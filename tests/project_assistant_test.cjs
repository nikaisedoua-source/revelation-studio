'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../web/project-assistant.js');

test('a 30 second plan produces six frame-accurate shots', () => {
  const plan = A.buildPlan({ duration: 30, fps: 25, subject: 'Essai' });
  assert.equal(plan.shots.length, 6);
  assert.equal(plan.overlays.length, 6);
  assert.equal(plan.voices.length, 6);
  assert.equal(plan.duration, 30);
  assert.equal(plan.fps, 25);
  assert.equal(plan.width, 1920);
  assert.equal(plan.height, 1080);
  const frames = Math.round(plan.shots.reduce((total, shot) => total + shot.duration, 0) * plan.fps);
  assert.equal(frames, 750);
  for (const shot of plan.shots) {
    assert.equal(shot.index, plan.shots.indexOf(shot));
    assert.equal(shot.motif, A.buildPlan({ duration: 30, fps: 25 }).shots[shot.index].motif);
    assert.ok(shot.prompt.length >= 12);
  }
  assert.equal(plan.shots[0].start, 0);
  assert.equal(plan.voices[0].start, 0);
});

test('a duration that does not divide evenly still totals the requested frame count', () => {
  const plan = A.buildPlan({ duration: 31, fps: 25 });
  const frames = plan.shots.reduce((total, shot) => total + Math.round(shot.duration * plan.fps), 0);
  assert.equal(frames, 775);
  assert.equal(plan.duration, 31);
});

test('the plan is deterministic for the same inputs and changes with the subject', () => {
  const first = A.buildPlan({ duration: 24, fps: 24, subject: 'Alpha' });
  const again = A.buildPlan({ duration: 24, fps: 24, subject: 'Alpha' });
  const other = A.buildPlan({ duration: 24, fps: 24, subject: 'Beta' });
  assert.deepEqual(first, again);
  assert.notEqual(first.seed, other.seed);
  assert.notEqual(first.filePrefix, other.filePrefix);
});

test('styles are known and invalid values fall back instead of failing', () => {
  const plan = A.buildPlan({ duration: 12, fps: 30, style: 'inconnu' });
  assert.equal(plan.style, 'ambre');
  assert.ok(A.STYLES[plan.style]);
  assert.equal(A.buildPlan({ duration: 1, fps: 1 }).duration, 12);
  assert.equal(A.buildPlan({ duration: 1, fps: 1 }).fps, 30);
});

test('music is stereo, finite and the same length as the requested duration', () => {
  const audio = A.renderMusic({ duration: 6, sampleRate: 48000, style: 'nuit', seedText: 'essai' });
  assert.equal(audio.sampleRate, 48000);
  assert.equal(audio.left.length, 6 * 48000);
  assert.equal(audio.right.length, audio.left.length);
  let peak = 0;
  for (const sample of audio.left) {
    assert.ok(Number.isFinite(sample));
    peak = Math.max(peak, Math.abs(sample));
  }
  for (const sample of audio.right) assert.ok(Number.isFinite(sample));
  assert.ok(peak > 0.05 && peak <= 0.87);
  assert.equal(audio.duration, 6);
});

test('the WAV encoder writes a valid 16-bit stereo RIFF header', () => {
  const audio = A.renderMusic({ duration: 3, sampleRate: 44100, style: 'acier' });
  const wav = A.encodeWav(audio);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const text = (start, length) => String.fromCharCode(...wav.slice(start, start + length));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(text(36, 4), 'data');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(4, true), wav.length - 8);
  assert.equal(view.getUint32(40, true), wav.length - 44);
});

test('default narration lines carry the studio message', () => {
  assert.equal(A.DEFAULT_LINES.length, 6);
  assert.match(A.DEFAULT_LINES[0].title, /IDÉE/);
  assert.match(A.DEFAULT_LINES[5].title, /RÉVÉLATION/);
});

function fakeContext(width = 1920, height = 1080) {
  const stops = [];
  const gradient = () => ({
    addColorStop(offset, color) {
      if (typeof color !== 'string' || !color || color.includes('undefined')) {
        throw new TypeError(`Couleur de dégradé invalide : ${color}`);
      }
      stops.push(color);
    }
  });
  const base = {
    canvas: { width, height },
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    measureText: (text) => ({ width: String(text).length * 10 })
  };
  return {
    context: new Proxy(base, {
      get(target, key) {
        if (key in target) return target[key];
        return () => {};
      },
      set(target, key, value) {
        if (['fillStyle', 'strokeStyle', 'shadowColor'].includes(key) && typeof value === 'string' && value.includes('undefined')) {
          throw new TypeError(`Couleur de contexte invalide : ${value}`);
        }
        target[key] = value;
        return true;
      }
    }),
    stops
  };
}

test('every motif and style paints without an undefined color', () => {
  for (const style of Object.keys(A.STYLES)) {
    for (let index = 0; index < 6; index += 1) {
      const shot = fakeContext();
      assert.doesNotThrow(() => A.renderShot(shot.context, { style, index, subject: 'Essai', seed: 42 }));
      assert.ok(shot.stops.length > 0);
      const overlay = fakeContext();
      const plan = A.buildPlan({ duration: 30, fps: 25, style });
      assert.doesNotThrow(() => A.renderOverlay(overlay.context, { style, subject: 'Essai', signature: 'Fin', shot: plan.shots[index], total: 6 }));
    }
  }
});

test('TTS status always resolves to an honest availability shape', async () => {
  const status = await A.ttsStatus();
  assert.equal(typeof status.available, 'boolean');
  assert.ok(Array.isArray(status.voices));
  if (!status.available) assert.ok(status.reason && status.reason.length > 10);
});
