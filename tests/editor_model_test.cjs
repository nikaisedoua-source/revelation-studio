'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../web/editor-model.js');

function project() {
  return M.createProject({ name: 'Test', fps: 30 });
}

function add(project, overrides) {
  return M.addClip(project, {
    trackId: 'V1',
    kind: 'video',
    name: 'Rush',
    mediaName: 'rush.mp4',
    mediaId: 'm1',
    start: 0,
    duration: 4,
    in: 0,
    mediaDuration: 20,
    ...overrides
  });
}

test('a new project has two video tracks, two audio tracks and no clips', () => {
  const p = project();
  assert.deepEqual(p.tracks.map((t) => t.id), ['V2', 'V1', 'A1', 'A2']);
  assert.equal(p.clips.length, 0);
  assert.equal(p.fps, 30);
  assert.equal(M.projectDuration(p), 0);
});

test('adding a clip quantizes to frames and refuses overlap', () => {
  const p = project();
  const clip = add(p, { start: 0.333 });
  assert.equal(clip.start, 10 / 30);
  add(p, { mediaId: 'm2', start: 5 });
  assert.throws(() => add(p, { mediaId: 'm3', start: 2 }), /occupe déjà/);
  assert.equal(p.clips.length, 2);
});

test('a media kind must match its track', () => {
  const p = project();
  assert.throws(() => add(p, { trackId: 'A1' }), /ne va pas sur cette piste/);
  assert.throws(() => add(p, { trackId: 'V1', kind: 'audio' }), /ne va pas sur cette piste/);
  const image = add(p, { mediaId: 'img', kind: 'image', mediaName: 'plan.png' });
  assert.equal(image.kind, 'image');
});

test('a locked track refuses edits', () => {
  const p = project();
  const clip = add(p);
  M.updateTrack(p, 'V1', { locked: true });
  assert.throws(() => M.moveClip(p, clip.id, { start: 6 }), /verrouillée/);
  assert.throws(() => M.trimClipBy(p, clip.id, 'right', -1), /verrouillée/);
  assert.throws(() => M.removeClip(p, clip.id), /verrouillée/);
});

test('moving a clip can change track but never overlap', () => {
  const p = project();
  const a = add(p, { start: 0, duration: 2 });
  add(p, { trackId: 'V2', mediaId: 'm2', start: 0, duration: 2 });
  M.moveClip(p, a.id, { trackId: 'V2', start: 3 });
  assert.equal(a.trackId, 'V2');
  assert.equal(a.start, 3);
  assert.throws(() => M.moveClip(p, a.id, { trackId: 'V2', start: 1 }), /occupe déjà/);
});

test('trimming the left edge keeps the source in point coherent', () => {
  const p = project();
  const clip = add(p, { start: 2, duration: 4, in: 2, mediaDuration: 20 });
  M.trimClipTo(p, clip.id, 'left', 0);
  assert.equal(clip.start, 0);
  assert.equal(clip.in, 0);
  assert.equal(clip.duration, 6);
  assert.equal(clip.start + clip.duration, 6);
});

test('trimming the right edge never exceeds the source media', () => {
  const p = project();
  const clip = add(p, { start: 0, duration: 4, in: 2, mediaDuration: 10 });
  M.trimClipTo(p, clip.id, 'right', 30);
  assert.equal(clip.duration, 8);
  assert.equal(clip.start + clip.duration, 8);
  assert.ok(clip.in + clip.duration <= clip.mediaDuration + 1e-6);
});

test('trimming stops at the neighbouring clip', () => {
  const p = project();
  const a = add(p, { start: 0, duration: 2 });
  add(p, { mediaId: 'm2', start: 3, duration: 2 });
  M.trimClipTo(p, a.id, 'right', 10);
  assert.equal(a.duration, 3);
});

test('split produces two adjacent clips with continuous source in points', () => {
  const p = project();
  const clip = add(p, { start: 1, duration: 6, in: 3, mediaDuration: 30 });
  const { left, right, point } = M.splitClip(p, clip.id, 3);
  assert.equal(point, 3);
  assert.equal(left.duration, 2);
  assert.equal(right.start, 3);
  assert.equal(right.duration, 4);
  assert.equal(right.in, 5);
  assert.equal(left.in + left.duration, right.in);
  assert.equal(p.clips.length, 2);
  assert.deepEqual(M.validateProject(p), []);
});

test('split refuses a cut outside the clip or on its last frame', () => {
  const p = project();
  const clip = add(p, { start: 0, duration: 4 });
  assert.throws(() => M.splitClip(p, clip.id, 5), /intérieur/);
  assert.throws(() => M.splitClip(p, clip.id, 0), /intérieur/);
});

test('ripple delete closes the gap on the same track only', () => {
  const p = project();
  const first = add(p, { start: 0, duration: 2 });
  const second = add(p, { mediaId: 'm2', start: 4, duration: 2 });
  const other = add(p, { trackId: 'V2', mediaId: 'm3', start: 4, duration: 2 });
  M.removeClip(p, first.id, { ripple: true });
  assert.equal(second.start, 2);
  assert.equal(other.start, 4);
});

test('active clips are inclusive at the start and exclusive at the end', () => {
  const p = project();
  add(p, { start: 0, duration: 2 });
  add(p, { trackId: 'V2', mediaId: 'm2', start: 1, duration: 2 });
  assert.equal(M.activeClips(p, 0).length, 1);
  assert.equal(M.activeClips(p, 1).length, 2);
  assert.equal(M.activeClips(p, 2).length, 1);
  assert.equal(M.activeClips(p, 3).length, 0);
  const order = M.activeClips(p, 1).map((item) => item.clip.trackId);
  assert.deepEqual(order, ['V1', 'V2']);
});

test('snapping chooses the closest edge inside the threshold', () => {
  const p = project();
  add(p, { start: 2, duration: 2 });
  assert.equal(M.snapTime(p, 2.05, { threshold: 0.08 }).time, 2);
  assert.equal(M.snapTime(p, 2.4, { threshold: 0.08 }).snapped, false);
  assert.equal(M.snapTime(p, 9.95, { threshold: 0.08, playhead: 10 }).time, 10);
});

test('timecode is frame accurate', () => {
  assert.equal(M.timecode(1.5, 30), '00:00:01:15');
  assert.equal(M.timecode(3661.25, 25), '01:01:01:06');
  assert.equal(M.parseTimecode('00:00:02:15', 30), 2.5);
});

test('history restores complete snapshots', () => {
  const p = project();
  const history = new M.History();
  const clip = add(p, { start: 0, duration: 2 });
  const before = M.clone(p);
  M.moveClip(p, clip.id, { start: 4 });
  history.commit(before);
  assert.equal(M.getClip(p, clip.id).start, 4);
  const restored = history.undo(p);
  assert.equal(M.getClip(restored, clip.id).start, 0);
  const redone = history.redo(restored);
  assert.equal(M.getClip(redone, clip.id).start, 4);
});

test('normalization rejects an invalid project and keeps a valid one', () => {
  const p = project();
  add(p, { start: 0, duration: 2 });
  add(p, { mediaId: 'm2', start: 2, duration: 2 });
  const normalized = M.normalizeProject(p);
  assert.deepEqual(M.validateProject(normalized), []);

  const broken = M.clone(p);
  broken.clips[1].start = 1;
  assert.throws(() => M.normalizeProject(broken), /invalide/);
});

test('duplicate places a copy right after the clip when the gap is free', () => {
  const p = project();
  const clip = add(p, { start: 0, duration: 2 });
  const copy = M.duplicateClip(p, clip.id);
  assert.notEqual(copy.id, clip.id);
  assert.equal(copy.start, 2);
  assert.equal(copy.mediaId, clip.mediaId);
  const third = M.duplicateClip(p, copy.id);
  assert.equal(third.start, 4);
  add(p, { mediaId: 'm9', start: 6, duration: 2 });
  assert.throws(() => M.duplicateClip(p, third.id), /occupe déjà/);
});

test('images accept long durations and audio stays on audio tracks', () => {
  const p = project();
  const image = add(p, { kind: 'image', mediaId: 'img', start: 0, duration: 20 });
  assert.equal(image.duration, 20);
  const audio = add(p, { trackId: 'A1', kind: 'audio', mediaId: 'wav', start: 0, duration: 5, mediaDuration: 30 });
  assert.equal(audio.trackId, 'A1');
  assert.deepEqual(M.validateProject(p), []);
});

test('adding tracks keeps video on top and audio at the bottom', () => {
  const p = project();
  const video = M.addTrack(p, 'video');
  const audio = M.addTrack(p, 'audio');
  assert.equal(video.id, 'V3');
  assert.equal(p.tracks[0].id, 'V3');
  assert.equal(audio.id, 'A3');
  assert.equal(p.tracks[p.tracks.length - 1].id, 'A3');
});

test('transform and fades normalize, clamp and survive a project round-trip', () => {
  const p = project();
  const clip = add(p, {
    transform: { x: 0.25, y: -0.5, scale: 1.4, rotation: 22 },
    fadeIn: 1,
    fadeOut: 0.5
  });
  assert.deepEqual(clip.transform, { x: 0.25, y: -0.5, scale: 1.4, rotation: 22 });
  assert.equal(clip.fadeIn, 1);
  assert.equal(clip.fadeOut, 0.5);

  M.updateClip(p, clip.id, { transform: { x: 4, scale: 0.001, rotation: -400 } });
  assert.deepEqual(clip.transform, { x: 1, y: -0.5, scale: 0.05, rotation: -180 });

  M.updateClip(p, clip.id, { fadeIn: 99, fadeOut: -3 });
  assert.equal(clip.fadeIn, clip.duration);
  assert.equal(clip.fadeOut, 0);

  const normalized = M.normalizeProject(M.clone(p));
  assert.deepEqual(normalized.clips[0].transform, clip.transform);
  assert.equal(normalized.clips[0].fadeIn, clip.fadeIn);
});

test('fadeFactor ramps opacity at both edges and stays full in the middle', () => {
  const p = project();
  const clip = add(p, { start: 2, duration: 4, fadeIn: 1, fadeOut: 2 });
  assert.equal(M.fadeFactor(clip, 2), 0);
  assert.equal(M.fadeFactor(clip, 2.5), 0.5);
  assert.equal(M.fadeFactor(clip, 3), 1);
  assert.equal(M.fadeFactor(clip, 4), 1);
  assert.equal(M.fadeFactor(clip, 5), 0.5);
  assert.equal(M.fadeFactor(clip, 6), 0);
  assert.equal(M.fadeFactor(clip, 0), 0);
});

test('split and trim keep fades attached to the correct edges', () => {
  const p = project();
  const clip = add(p, { start: 1, duration: 6, fadeIn: 2, fadeOut: 3 });
  const { left, right } = M.splitClip(p, clip.id, 4);
  assert.equal(left.fadeIn, 2);
  assert.equal(left.fadeOut, 0);
  assert.equal(right.fadeIn, 0);
  assert.equal(right.fadeOut, 3);

  M.trimClipTo(p, right.id, 'right', 5);
  assert.equal(right.duration, 1);
  assert.equal(right.fadeOut, 1, 'fadeOut is clamped to the shortened clip');
  assert.equal(left.fadeIn, 2);
});
