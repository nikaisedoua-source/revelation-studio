"""System speech synthesis for the local studio (macOS, Windows, Linux).

The module never uses a shell, validates every input before touching a
process, and returns the WAV as bytes so the API layer can decide how to
expose it. No credential or external service is involved.
"""
import base64
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_TEXT = 900
MAX_OUTPUT = 24 * 1024 * 1024
TIMEOUT = 45


def _run(command, args):
    try:
        result = subprocess.run(
            [command, *args],
            capture_output=True,
            timeout=TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(f"{Path(command).name} indisponible : {error}")
    return result


def _backend():
    if sys.platform == 'darwin' and Path('/usr/bin/say').exists() and Path('/usr/bin/afconvert').exists():
        return 'macos'
    if sys.platform.startswith('win'):
        return 'windows'
    if sys.platform.startswith('linux') and shutil.which('espeak-ng'):
        return 'linux'
    return None


def _mac_voices():
    result = _run('/usr/bin/say', ['-v', '?'])
    if result.returncode != 0 or not result.stdout:
        return []
    seen = set()
    voices = []
    for line in result.stdout.decode('utf-8', 'replace').splitlines():
        match = re.match(r'^(.+?)\s{2,}([A-Za-z_-]{2,})\s+#', line)
        if not match:
            continue
        voice_id = match.group(1).strip()
        if not voice_id or voice_id in seen:
            continue
        seen.add(voice_id)
        voices.append({'id': voice_id, 'name': voice_id, 'language': match.group(2), 'label': f'{voice_id} · {match.group(2)}'})
    return voices


def _windows_voices():
    script = ("Add-Type -AssemblyName System.Speech; "
              "(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | "
              "ForEach-Object { $_.VoiceInfo.Name + '|' + $_.VoiceInfo.Culture.Name }")
    result = _run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    if result.returncode != 0 or not result.stdout:
        return []
    seen = set()
    voices = []
    for line in result.stdout.decode('utf-8', 'replace').splitlines():
        parts = [value.strip() for value in line.split('|')]
        name = parts[0] if parts else ''
        culture = parts[1] if len(parts) > 1 else ''
        if not name or name in seen:
            continue
        seen.add(name)
        voices.append({'id': name, 'name': name, 'language': culture, 'label': f'{name} · {culture}' if culture else name})
    return voices


def _linux_voices():
    executable = shutil.which('espeak-ng')
    if not executable:
        return []
    result = _run(executable, ['--voices'])
    if result.returncode != 0 or not result.stdout:
        return []
    seen = set()
    voices = []
    for line in result.stdout.decode('utf-8', 'replace').splitlines():
        match = re.match(r'^\s*\d+\s+(\S+)\s+\S+\s+(\S+)\s+', line)
        if not match:
            continue
        language, voice_id = match.group(1), match.group(2)
        if not voice_id or voice_id in seen:
            continue
        seen.add(voice_id)
        voices.append({'id': voice_id, 'name': voice_id, 'language': language, 'label': f'{voice_id} · {language}'})
    if 'fr' not in seen:
        voices.insert(0, {'id': 'fr', 'name': 'fr', 'language': 'fr', 'label': 'fr · français'})
    return voices


def _voices_for(kind):
    if kind == 'macos':
        return _mac_voices()
    if kind == 'windows':
        return _windows_voices()
    if kind == 'linux':
        return _linux_voices()
    return []


def _default_voice(voices):
    french = [voice for voice in voices if re.match(r'^fr', voice['language'] or '', re.I)]
    chosen = next((v for v in french if re.match(r'^fr[_-]FR', v['language'], re.I)), None) or (french[0] if french else None) or (voices[0] if voices else None)
    return chosen['id'] if chosen else ''


def _clean_text(value):
    text = str('' if value is None else value).replace('\r\n', '\n').replace('\r', '\n').strip()
    if not text:
        raise ValueError('Texte de la voix vide.')
    if len(text) > MAX_TEXT:
        raise ValueError(f'Texte trop long : {MAX_TEXT} caractères maximum.')
    if re.search(r'[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', text):
        raise ValueError('Caractères de contrôle refusés.')
    return text


def _clean_rate(value):
    try:
        rate = round(float(value))
    except (TypeError, ValueError):
        return 175
    return min(320, max(90, rate))


def _resolve_voice(requested, voices):
    voice_id = str(requested or '').strip()
    if voice_id:
        if not any(voice['id'] == voice_id for voice in voices):
            raise ValueError('Voix système inconnue sur ce poste.')
        return voice_id
    fallback = _default_voice(voices)
    if not fallback:
        raise ValueError('Aucune voix système disponible.')
    return fallback


def _read_wave(path):
    size = path.stat().st_size
    if size < 44 or size > MAX_OUTPUT:
        raise ValueError('Fichier audio système invalide ou trop volumineux.')
    data = path.read_bytes()
    if data[0:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise ValueError('Le système n’a pas produit un fichier WAV valide.')
    return data


def _render_mac(text, voice, rate, directory):
    aiff = directory / 'voice.aiff'
    wav = directory / 'voice.wav'
    speech = _run('/usr/bin/say', ['-v', voice, '-r', str(rate), '-o', str(aiff), '--', text])
    if speech.returncode != 0:
        raise RuntimeError('La synthèse vocale de macOS a échoué.')
    convert = _run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', str(aiff), str(wav)])
    if convert.returncode != 0:
        raise RuntimeError('La conversion WAV a échoué.')
    return _read_wave(wav)


SAPI_SCRIPT = '\n'.join([
    'param([string]$TextFile,[string]$OutFile,[string]$Voice,[int]$Rate)',
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$text = Get-Content -LiteralPath $TextFile -Raw -Encoding UTF8',
    'if ($Voice) { $synth.SelectVoice($Voice) }',
    '$synth.Rate = $Rate',
    '$synth.SetOutputToWaveFile($OutFile)',
    '$synth.Speak($text)',
    '$synth.Dispose()',
])


def _render_windows(text, voice, rate, directory):
    text_file = directory / 'voice.txt'
    script_file = directory / 'voice.ps1'
    wav = directory / 'voice.wav'
    text_file.write_text(text, encoding='utf-8')
    script_file.write_text(SAPI_SCRIPT, encoding='utf-8')
    sapi_rate = min(10, max(-10, round((rate - 175) / 12)))
    result = _run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(script_file), str(text_file), str(wav), voice, str(sapi_rate)])
    if result.returncode != 0:
        raise RuntimeError('La synthèse vocale de Windows a échoué.')
    return _read_wave(wav)


def _render_linux(text, voice, rate, directory):
    executable = shutil.which('espeak-ng')
    if not executable:
        raise RuntimeError('espeak-ng est requis pour la synthèse vocale.')
    text_file = directory / 'voice.txt'
    wav = directory / 'voice.wav'
    text_file.write_text(text, encoding='utf-8')
    result = _run(executable, ['-v', voice, '-s', str(rate), '-w', str(wav), '-f', str(text_file)])
    if result.returncode != 0:
        raise RuntimeError('La synthèse vocale d’espeak-ng a échoué.')
    return _read_wave(wav)


def status():
    kind = _backend()
    if not kind:
        return {'available': False, 'backend': None, 'voices': [], 'default': '', 'reason': 'Aucune synthèse vocale système détectée sur ce poste.'}
    try:
        voices = _voices_for(kind)
    except (OSError, RuntimeError, ValueError) as error:
        return {'available': False, 'backend': kind, 'voices': [], 'default': '', 'reason': str(error)}
    if not voices:
        return {'available': False, 'backend': kind, 'voices': [], 'default': '', 'reason': 'Aucune voix installée pour la synthèse vocale du système.'}
    return {'available': True, 'backend': kind, 'voices': voices, 'default': _default_voice(voices)}


def render(payload):
    kind = _backend()
    if not kind:
        raise ValueError('Aucune synthèse vocale système détectée sur ce poste.')
    voices = _voices_for(kind)
    if not voices:
        raise ValueError('Aucune voix système installée.')
    request = payload or {}
    voice = _resolve_voice(request.get('voice'), voices)
    text = _clean_text(request.get('text'))
    rate = _clean_rate(request.get('rate'))
    with tempfile.TemporaryDirectory(prefix='revelation-tts-') as raw:
        directory = Path(raw)
        if kind == 'macos':
            data = _render_mac(text, voice, rate, directory)
        elif kind == 'windows':
            data = _render_windows(text, voice, rate, directory)
        else:
            data = _render_linux(text, voice, rate, directory)
    if len(data) < 44:
        raise ValueError('Le fichier audio produit est vide.')
    return {'mime': 'audio/wav', 'data': base64.b64encode(data).decode('ascii'), 'voice': voice, 'backend': kind, 'bytes': len(data)}
