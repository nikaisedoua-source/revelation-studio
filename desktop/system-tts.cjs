'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_TEXT = 900;
const MAX_OUTPUT = 24 * 1024 * 1024;
const TIMEOUT = 45000;

function findExecutable(name) {
  for (const directory of String(process.env.PATH || '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch (error) {
      /* keep searching */
    }
  }
  return null;
}

function backend() {
  if (process.platform === 'darwin' && fs.existsSync('/usr/bin/say') && fs.existsSync('/usr/bin/afconvert')) return 'macos';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux' && findExecutable('espeak-ng')) return 'linux';
  return null;
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: TIMEOUT,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    ...options
  });
  if (result.error) throw new Error(`${path.basename(command)} indisponible : ${result.error.message}`);
  return result;
}

function macVoices() {
  const result = run('/usr/bin/say', ['-v', '?']);
  if (result.status !== 0 || !result.stdout) return [];
  const seen = new Set();
  const voices = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^(.+?)\s{2,}([A-Za-z_-]{2,})\s+#/.exec(line);
    if (!match) continue;
    const id = match[1].trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    voices.push({ id, name: id, language: match[2], label: `${id} · ${match[2]}` });
  }
  return voices;
}

function windowsVoices() {
  const script = "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }";
  const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  if (result.status !== 0 || !result.stdout) return [];
  const seen = new Set();
  const voices = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const [name, culture] = line.split('|').map((value) => String(value || '').trim());
    if (!name || seen.has(name)) continue;
    seen.add(name);
    voices.push({ id: name, name, language: culture || '', label: culture ? `${name} · ${culture}` : name });
  }
  return voices;
}

function linuxVoices() {
  const executable = findExecutable('espeak-ng');
  if (!executable) return [];
  const result = run(executable, ['--voices']);
  if (result.status !== 0 || !result.stdout) return [];
  const seen = new Set();
  const voices = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^\s*\d+\s+(\S+)\s+\S+\s+(\S+)\s+/.exec(line);
    if (!match) continue;
    const language = match[1];
    const id = match[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    voices.push({ id, name: id, language, label: `${id} · ${language}` });
  }
  if (!seen.has('fr')) voices.unshift({ id: 'fr', name: 'fr', language: 'fr', label: 'fr · français' });
  return voices;
}

function defaultVoice(voices) {
  const french = voices.filter((voice) => /^fr/i.test(voice.language));
  const chosen = french.find((voice) => /^fr[_-]FR/i.test(voice.language)) || french[0] || voices[0];
  return chosen ? chosen.id : '';
}

function cleanText(value) {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('Texte de la voix vide.');
  if (text.length > MAX_TEXT) throw new Error(`Texte trop long : ${MAX_TEXT} caractères maximum.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new Error('Caractères de contrôle refusés.');
  return text;
}

function cleanRate(value) {
  const rate = Math.round(Number(value));
  if (!Number.isFinite(rate)) return 175;
  return Math.min(320, Math.max(90, rate));
}

function resolveVoice(requested, voices) {
  const id = String(requested || '').trim();
  if (id) {
    if (!voices.some((voice) => voice.id === id)) throw new Error('Voix système inconnue sur ce poste.');
    return id;
  }
  const fallback = defaultVoice(voices);
  if (!fallback) throw new Error('Aucune voix système disponible.');
  return fallback;
}

function readWave(file) {
  const stat = fs.statSync(file);
  if (stat.size < 44 || stat.size > MAX_OUTPUT) throw new Error('Fichier audio système invalide ou trop volumineux.');
  const data = fs.readFileSync(file);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Le système n’a pas produit un fichier WAV valide.');
  }
  return data;
}

function renderMac(text, voice, rate) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-tts-'));
  try {
    const aiff = path.join(directory, 'voice.aiff');
    const wav = path.join(directory, 'voice.wav');
    const speech = run('/usr/bin/say', ['-v', voice, '-r', String(rate), '-o', aiff, '--', text]);
    if (speech.status !== 0) throw new Error('La synthèse vocale de macOS a échoué.');
    const convert = run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', aiff, wav]);
    if (convert.status !== 0) throw new Error('La conversion WAV a échoué.');
    return readWave(wav);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const SAPI_SCRIPT = [
  'param([string]$TextFile,[string]$OutFile,[string]$Voice,[int]$Rate)',
  'Add-Type -AssemblyName System.Speech',
  '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
  '$text = Get-Content -LiteralPath $TextFile -Raw -Encoding UTF8',
  'if ($Voice) { $synth.SelectVoice($Voice) }',
  '$synth.Rate = $Rate',
  '$synth.SetOutputToWaveFile($OutFile)',
  '$synth.Speak($text)',
  '$synth.Dispose()'
].join('\n');

function renderWindows(text, voice, rate) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-tts-'));
  try {
    const textFile = path.join(directory, 'voice.txt');
    const scriptFile = path.join(directory, 'voice.ps1');
    const wav = path.join(directory, 'voice.wav');
    fs.writeFileSync(textFile, text, 'utf8');
    fs.writeFileSync(scriptFile, SAPI_SCRIPT, 'utf8');
    const sapiRate = Math.min(10, Math.max(-10, Math.round((rate - 175) / 12)));
    const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile, textFile, wav, voice, String(sapiRate)]);
    if (result.status !== 0) throw new Error('La synthèse vocale de Windows a échoué.');
    return readWave(wav);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function renderLinux(text, voice, rate) {
  const executable = findExecutable('espeak-ng');
  if (!executable) throw new Error('espeak-ng est requis pour la synthèse vocale.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'revelation-tts-'));
  try {
    const textFile = path.join(directory, 'voice.txt');
    const wav = path.join(directory, 'voice.wav');
    fs.writeFileSync(textFile, text, 'utf8');
    const result = run(executable, ['-v', voice, '-s', String(rate), '-w', wav, '-f', textFile]);
    if (result.status !== 0) throw new Error('La synthèse vocale d’espeak-ng a échoué.');
    return readWave(wav);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function voicesFor(kind) {
  if (kind === 'macos') return macVoices();
  if (kind === 'windows') return windowsVoices();
  if (kind === 'linux') return linuxVoices();
  return [];
}

function status() {
  const kind = backend();
  if (!kind) {
    return { available: false, backend: null, voices: [], default: '', reason: 'Aucune synthèse vocale système détectée sur ce poste.' };
  }
  let voices = [];
  try {
    voices = voicesFor(kind);
  } catch (error) {
    return { available: false, backend: kind, voices: [], default: '', reason: error.message };
  }
  if (!voices.length) {
    return { available: false, backend: kind, voices: [], default: '', reason: 'Aucune voix installée pour la synthèse vocale du système.' };
  }
  return { available: true, backend: kind, voices, default: defaultVoice(voices) };
}

function render(payload) {
  const kind = backend();
  if (!kind) throw new Error('Aucune synthèse vocale système détectée sur ce poste.');
  const voices = voicesFor(kind);
  if (!voices.length) throw new Error('Aucune voix système installée.');
  const request = payload || {};
  const voice = resolveVoice(request.voice, voices);
  const text = cleanText(request.text);
  const rate = cleanRate(request.rate);
  let data;
  if (kind === 'macos') data = renderMac(text, voice, rate);
  else if (kind === 'windows') data = renderWindows(text, voice, rate);
  else data = renderLinux(text, voice, rate);
  if (!data || data.length < 44) throw new Error('Le fichier audio produit est vide.');
  return { mime: 'audio/wav', data: data.toString('base64'), voice, backend: kind, bytes: data.length };
}

module.exports = { status, render };
