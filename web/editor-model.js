/* Timeline model for Révélation Studio Montage.
   Pure functions, no DOM: shared by the browser editor and the Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioEditorModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPS = 1e-6;
  const VIDEO_KINDS = new Set(['video', 'image']);
  const DEFAULTS = { fps: 30, width: 1920, height: 1080 };
  const MAX_IMAGE_DURATION = 3600;

  function uid(prefix) {
    const raw = (globalThis.crypto && globalThis.crypto.randomUUID)
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12).padEnd(10, '0');
    return `${prefix || 'id'}_${raw}`;
  }

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function invalid(message, code) {
    const error = new Error(message);
    error.code = code || 'invalid';
    return error;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function minDuration(project) {
    return 1 / (project.fps || DEFAULTS.fps);
  }

  function quantize(project, seconds) {
    const fps = project.fps || DEFAULTS.fps;
    return Math.round(seconds * fps) / fps;
  }

  function fitDuration(project, seconds) {
    const frame = minDuration(project);
    const quantized = quantize(project, seconds);
    return quantized > seconds + EPS ? Math.max(frame, quantized - frame) : quantized;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0 };

  function normalizeGrade(input) {
    const grade = input && typeof input === 'object' ? input : {};
    const value = (name) => (isFiniteNumber(grade[name]) ? clamp(grade[name], -100, 100) : 0);
    return {
      exposure: value('exposure'),
      contrast: value('contrast'),
      saturation: value('saturation'),
      temperature: value('temperature')
    };
  }

  function normalizeTransform(input) {
    const transform = input && typeof input === 'object' ? input : {};
    const value = (name, fallback, low, high) => (isFiniteNumber(transform[name]) ? clamp(transform[name], low, high) : fallback);
    return {
      x: value('x', 0, -1, 1),
      y: value('y', 0, -1, 1),
      scale: value('scale', 1, 0.05, 5),
      rotation: value('rotation', 0, -180, 180)
    };
  }

  function trackKindForClip(kind) {
    return kind === 'audio' ? 'audio' : 'video';
  }

  function accepts(track, kind) {
    if (!track) return false;
    return track.kind === 'audio' ? kind === 'audio' : VIDEO_KINDS.has(kind);
  }

  function createProject(options) {
    const opts = options || {};
    const now = Date.now();
    const project = {
      schema: 1,
      id: opts.id || uid('proj'),
      name: opts.name || 'Montage sans titre',
      fps: opts.fps || DEFAULTS.fps,
      width: opts.width || DEFAULTS.width,
      height: opts.height || DEFAULTS.height,
      createdAt: opts.createdAt || now,
      updatedAt: now,
      tracks: [
        { id: 'V2', kind: 'video', name: 'V2', muted: false, locked: false },
        { id: 'V1', kind: 'video', name: 'V1', muted: false, locked: false },
        { id: 'A1', kind: 'audio', name: 'A1', muted: false, locked: false },
        { id: 'A2', kind: 'audio', name: 'A2', muted: false, locked: false }
      ],
      clips: []
    };
    return project;
  }

  function getTrack(project, trackId) {
    return project.tracks.find((track) => track.id === trackId) || null;
  }

  function trackIndex(project, trackId) {
    return project.tracks.findIndex((track) => track.id === trackId);
  }

  function nextTrackId(project, kind) {
    const letter = kind === 'audio' ? 'A' : 'V';
    let highest = 0;
    for (const track of project.tracks) {
      const match = new RegExp(`^${letter}(\\d+)$`).exec(track.id);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
    return `${letter}${highest + 1}`;
  }

  function addTrack(project, kind) {
    if (kind !== 'video' && kind !== 'audio') throw invalid('Type de piste inconnu.', 'track_kind');
    const id = nextTrackId(project, kind);
    const track = { id, kind, name: id, muted: false, locked: false };
    if (kind === 'video') project.tracks.unshift(track);
    else project.tracks.push(track);
    project.updatedAt = Date.now();
    return track;
  }

  function removeTrack(project, trackId) {
    const index = trackIndex(project, trackId);
    if (index < 0) throw invalid('Piste introuvable.', 'track_missing');
    const [track] = project.tracks.splice(index, 1);
    project.clips = project.clips.filter((clip) => clip.trackId !== trackId);
    project.updatedAt = Date.now();
    return track;
  }

  function updateTrack(project, trackId, patch) {
    const track = getTrack(project, trackId);
    if (!track) throw invalid('Piste introuvable.', 'track_missing');
    if (typeof patch.name === 'string') track.name = patch.name.slice(0, 24);
    if (typeof patch.muted === 'boolean') track.muted = patch.muted;
    if (typeof patch.locked === 'boolean') track.locked = patch.locked;
    project.updatedAt = Date.now();
    return track;
  }

  function clipEnd(clip) {
    return clip.start + clip.duration;
  }

  function fadeFactor(clip, time) {
    const local = clamp(Number(time) - clip.start, 0, clip.duration);
    let factor = 1;
    const fadeIn = Math.max(0, Number(clip.fadeIn) || 0);
    const fadeOut = Math.max(0, Number(clip.fadeOut) || 0);
    if (fadeIn > 0) factor = Math.min(factor, local / fadeIn);
    if (fadeOut > 0) factor = Math.min(factor, (clip.duration - local) / fadeOut);
    return clamp(factor, 0, 1);
  }

  function clipsOnTrack(project, trackId, ignoreId) {
    return project.clips
      .filter((clip) => clip.trackId === trackId && clip.id !== ignoreId)
      .sort((a, b) => a.start - b.start);
  }

  function previousClip(project, clip) {
    const list = clipsOnTrack(project, clip.trackId, clip.id);
    let previous = null;
    for (const other of list) {
      if (clipEnd(other) <= clip.start + EPS) previous = other;
    }
    return previous;
  }

  function nextClip(project, clip) {
    const list = clipsOnTrack(project, clip.trackId, clip.id);
    for (const other of list) {
      if (other.start >= clipEnd(clip) - EPS) return other;
    }
    return null;
  }

  function overlaps(project, candidate, ignoreId) {
    for (const other of clipsOnTrack(project, candidate.trackId, ignoreId)) {
      const end = candidate.start + candidate.duration;
      if (candidate.start < clipEnd(other) - EPS && end > other.start + EPS) {
        return other;
      }
    }
    return null;
  }

  function canPlace(project, options) {
    const track = getTrack(project, options.trackId);
    if (!track) return { ok: false, reason: 'Piste introuvable.' };
    if (options.kind && !accepts(track, options.kind)) {
      return { ok: false, reason: 'Ce média ne va pas sur cette piste.' };
    }
    if (!isFiniteNumber(options.start) || options.start < -EPS) {
      return { ok: false, reason: 'Position invalide.' };
    }
    if (!isFiniteNumber(options.duration) || options.duration < minDuration(project) - EPS) {
      return { ok: false, reason: 'Durée trop courte.' };
    }
    const blocker = overlaps(project, {
      trackId: options.trackId,
      start: options.start,
      duration: options.duration
    }, options.ignoreId);
    if (blocker) return { ok: false, reason: 'Un clip occupe déjà cet espace.', blocker };
    return { ok: true };
  }

  function normalizeClip(project, input) {
    const kind = input.kind === 'audio' ? 'audio' : input.kind === 'image' ? 'image' : 'video';
    const mediaDuration = isFiniteNumber(input.mediaDuration)
      ? input.mediaDuration
      : (kind === 'image' ? MAX_IMAGE_DURATION : undefined);
    const start = quantize(project, Math.max(0, Number(input.start) || 0));
    const duration = quantize(project, Math.max(minDuration(project), Number(input.duration) || minDuration(project)));
    const inPoint = quantize(project, Math.max(0, Number(input.in) || 0));
    const fadeIn = quantize(project, clamp(isFiniteNumber(input.fadeIn) ? input.fadeIn : 0, 0, duration));
    const fadeOut = quantize(project, clamp(isFiniteNumber(input.fadeOut) ? input.fadeOut : 0, 0, duration));
    return {
      id: input.id || uid('clip'),
      trackId: input.trackId,
      mediaId: input.mediaId || '',
      mediaName: input.mediaName || '',
      kind,
      name: input.name || input.mediaName || 'Clip',
      start,
      duration,
      in: inPoint,
      mediaDuration,
      opacity: isFiniteNumber(input.opacity) ? clamp(input.opacity, 0, 1) : 1,
      volume: isFiniteNumber(input.volume) ? clamp(input.volume, 0, 2) : 1,
      muted: Boolean(input.muted),
      fadeIn,
      fadeOut,
      transform: normalizeTransform(input.transform),
      grade: normalizeGrade(input.grade)
    };
  }

  function validateClip(project, clip, ignoreId) {
    const track = getTrack(project, clip.trackId);
    if (!track) throw invalid('Piste introuvable.', 'track_missing');
    if (!accepts(track, clip.kind)) throw invalid('Ce média ne va pas sur cette piste.', 'kind_mismatch');
    if (clip.start < -EPS) throw invalid('Le clip ne peut pas commencer avant zéro.', 'start_negative');
    if (clip.duration < minDuration(project) - EPS) throw invalid('Durée trop courte.', 'duration');
    if (clip.in < -EPS) throw invalid('Point d’entrée invalide.', 'in');
    if (isFiniteNumber(clip.mediaDuration) && clip.mediaDuration > 0) {
      if (clip.in + clip.duration > clip.mediaDuration + EPS) {
        throw invalid('Le clip dépasse la fin du média.', 'media_end');
      }
    }
    const blocker = overlaps(project, clip, ignoreId);
    if (blocker) throw invalid('Un clip occupe déjà cet espace.', 'overlap');
    return clip;
  }

  function sortClips(project) {
    project.clips.sort((a, b) => {
      if (a.trackId === b.trackId) return a.start - b.start;
      return trackIndex(project, a.trackId) - trackIndex(project, b.trackId);
    });
  }

  function addClip(project, input) {
    const track = getTrack(project, input.trackId);
    if (!track) throw invalid('Piste introuvable.', 'track_missing');
    if (track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    const clip = normalizeClip(project, input);
    validateClip(project, clip);
    project.clips.push(clip);
    sortClips(project);
    project.updatedAt = Date.now();
    return clip;
  }

  function getClip(project, clipId) {
    return project.clips.find((clip) => clip.id === clipId) || null;
  }

  function moveClip(project, clipId, options) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    const sourceTrack = getTrack(project, clip.trackId);
    if (sourceTrack && sourceTrack.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    const trackId = options.trackId || clip.trackId;
    const targetTrack = getTrack(project, trackId);
    if (!targetTrack) throw invalid('Piste introuvable.', 'track_missing');
    if (targetTrack.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    if (!accepts(targetTrack, clip.kind)) throw invalid('Ce média ne va pas sur cette piste.', 'kind_mismatch');
    const start = quantize(project, Math.max(0, Number(options.start)));
    const candidate = { ...clip, trackId, start };
    validateClip(project, candidate, clip.id);
    clip.trackId = trackId;
    clip.start = start;
    project.updatedAt = Date.now();
    sortClips(project);
    return clip;
  }

  function trimBounds(project, clip, edge) {
    const min = minDuration(project);
    if (edge === 'left') {
      const previous = previousClip(project, clip);
      const limitFromMedia = clip.start - clip.in;
      const limitFromPrevious = previous ? clipEnd(previous) : 0;
      return {
        min: quantize(project, Math.max(0, limitFromMedia, limitFromPrevious)),
        max: quantize(project, clipEnd(clip) - min)
      };
    }
    const next = nextClip(project, clip);
    const mediaLimit = isFiniteNumber(clip.mediaDuration) && clip.mediaDuration > 0
      ? clip.start + (clip.mediaDuration - clip.in)
      : Infinity;
    return {
      min: quantize(project, clip.start + min),
      max: quantize(project, Math.min(next ? next.start : Infinity, mediaLimit))
    };
  }

  function trimClipTo(project, clipId, edge, time) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    const track = getTrack(project, clip.trackId);
    if (track && track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    const bounds = trimBounds(project, clip, edge);
    if (bounds.max < bounds.min) throw invalid('Espace insuffisant pour ce trim.', 'trim_space');
    const target = quantize(project, clamp(quantize(project, Number(time)), bounds.min, bounds.max));
    if (edge === 'left') {
      const end = clipEnd(clip);
      const newIn = quantize(project, clip.in + (target - clip.start));
      clip.in = Math.max(0, newIn);
      clip.start = target;
      clip.duration = quantize(project, end - target);
    } else {
      clip.duration = quantize(project, target - clip.start);
    }
    clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
    clip.fadeOut = Math.min(clip.fadeOut, clip.duration);
    validateClip(project, clip, clip.id);
    project.updatedAt = Date.now();
    return clip;
  }

  function trimClipBy(project, clipId, edge, delta) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    return trimClipTo(project, clipId, edge, edge === 'left' ? clip.start + delta : clipEnd(clip) + delta);
  }

  function splitClip(project, clipId, at) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    const track = getTrack(project, clip.trackId);
    if (track && track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    const point = quantize(project, clamp(quantize(project, Number(at)), clip.start, clipEnd(clip)));
    const min = minDuration(project);
    if (point <= clip.start + min - EPS || point >= clipEnd(clip) - min + EPS) {
      throw invalid('Place la tête de lecture à l’intérieur du clip.', 'split_bounds');
    }
    const right = {
      ...clone(clip),
      id: uid('clip'),
      start: point,
      duration: quantize(project, clipEnd(clip) - point),
      in: quantize(project, clip.in + (point - clip.start))
    };
    clip.duration = quantize(project, point - clip.start);
    clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
    clip.fadeOut = 0;
    right.fadeIn = 0;
    right.fadeOut = Math.min(right.fadeOut, right.duration);
    validateClip(project, clip, clip.id);
    project.clips.push(right);
    sortClips(project);
    project.updatedAt = Date.now();
    return { left: clip, right, point };
  }

  function removeClip(project, clipId, options) {
    const opts = options || {};
    const index = project.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) throw invalid('Clip introuvable.', 'clip_missing');
    const clip = project.clips[index];
    const track = getTrack(project, clip.trackId);
    if (track && track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    project.clips.splice(index, 1);
    if (opts.ripple) {
      for (const other of project.clips) {
        if (other.trackId === clip.trackId && other.start >= clip.start - EPS) {
          other.start = quantize(project, Math.max(0, other.start - clip.duration));
        }
      }
      sortClips(project);
    }
    project.updatedAt = Date.now();
    return clip;
  }

  function duplicateClip(project, clipId) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    const copy = clone(clip);
    copy.id = uid('clip');
    copy.start = quantize(project, clipEnd(clip));
    const track = getTrack(project, clip.trackId);
    if (track && track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    validateClip(project, copy);
    project.clips.push(copy);
    sortClips(project);
    project.updatedAt = Date.now();
    return copy;
  }

  function updateClip(project, clipId, patch) {
    const clip = getClip(project, clipId);
    if (!clip) throw invalid('Clip introuvable.', 'clip_missing');
    const track = getTrack(project, clip.trackId);
    if (track && track.locked) throw invalid('Cette piste est verrouillée.', 'track_locked');
    if (typeof patch.name === 'string') clip.name = patch.name.slice(0, 120);
    if (typeof patch.opacity === 'number') clip.opacity = clamp(patch.opacity, 0, 1);
    if (typeof patch.volume === 'number') clip.volume = clamp(patch.volume, 0, 2);
    if (typeof patch.muted === 'boolean') clip.muted = patch.muted;
    if (patch.grade && typeof patch.grade === 'object') clip.grade = normalizeGrade({ ...clip.grade, ...patch.grade });
    if (patch.transform && typeof patch.transform === 'object') clip.transform = normalizeTransform({ ...clip.transform, ...patch.transform });
    if (patch.fadeIn !== undefined) clip.fadeIn = quantize(project, clamp(Number(patch.fadeIn) || 0, 0, clip.duration));
    if (patch.fadeOut !== undefined) clip.fadeOut = quantize(project, clamp(Number(patch.fadeOut) || 0, 0, clip.duration));
    if (patch.start !== undefined || patch.duration !== undefined || patch.in !== undefined) {
      const start = quantize(project, Math.max(0, Number(patch.start ?? clip.start)));
      const duration = quantize(project, Math.max(minDuration(project), Number(patch.duration ?? clip.duration)));
      const inPoint = quantize(project, Math.max(0, Number(patch.in ?? clip.in)));
      const candidate = { ...clip, start, duration, in: inPoint };
      validateClip(project, candidate, clip.id);
      clip.start = start;
      clip.duration = duration;
      clip.in = inPoint;
      clip.fadeIn = Math.min(clip.fadeIn, clip.duration);
      clip.fadeOut = Math.min(clip.fadeOut, clip.duration);
    }
    if (patch.trackId && patch.trackId !== clip.trackId) {
      moveClip(project, clipId, { trackId: patch.trackId, start: clip.start });
    }
    project.updatedAt = Date.now();
    sortClips(project);
    return clip;
  }

  function activeClips(project, time) {
    return project.clips
      .filter((clip) => time >= clip.start - EPS && time < clipEnd(clip) - EPS)
      .map((clip) => ({ clip, track: getTrack(project, clip.trackId), index: trackIndex(project, clip.trackId) }))
      .sort((a, b) => b.index - a.index);
  }

  function projectDuration(project) {
    let duration = 0;
    for (const clip of project.clips) duration = Math.max(duration, clipEnd(clip));
    return duration;
  }

  function snapTime(project, time, options) {
    const opts = options || {};
    const threshold = isFiniteNumber(opts.threshold) ? opts.threshold : 0.08;
    const candidates = [0];
    if (isFiniteNumber(opts.playhead)) candidates.push(opts.playhead);
    for (const clip of project.clips) {
      if (clip.id === opts.excludeId) continue;
      candidates.push(clip.start, clipEnd(clip));
    }
    let best = null;
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - time);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { time: candidate, distance, snapped: true };
      }
    }
    return best || { time, distance: 0, snapped: false };
  }

  function timecode(seconds, fps) {
    const rate = fps || DEFAULTS.fps;
    const safe = Math.max(0, Number(seconds) || 0);
    let totalFrames = Math.round(safe * rate);
    const frames = totalFrames % rate;
    const totalSeconds = Math.floor(totalFrames / rate);
    const secs = totalSeconds % 60;
    const mins = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  }

  function parseTimecode(value, fps) {
    const rate = fps || DEFAULTS.fps;
    const parts = String(value || '').split(':').map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 4) return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / rate;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }

  function validateProject(project) {
    const errors = [];
    if (!project || typeof project !== 'object') return ['Projet invalide.'];
    if (!Array.isArray(project.tracks) || !project.tracks.length) errors.push('Aucune piste.');
    if (!Array.isArray(project.clips)) errors.push('Liste de clips invalide.');
    const trackIds = new Set((project.tracks || []).map((track) => track.id));
    const seen = new Set();
    for (const clip of project.clips || []) {
      if (!trackIds.has(clip.trackId)) errors.push(`Clip ${clip.id} sur une piste absente.`);
      if (seen.has(clip.id)) errors.push(`Identifiant de clip dupliqué : ${clip.id}.`);
      seen.add(clip.id);
      if (!(clip.duration >= minDuration(project) - EPS)) errors.push(`Clip ${clip.id} trop court.`);
      if (clip.start < -EPS) errors.push(`Clip ${clip.id} commence avant zéro.`);
      const blocker = overlaps(project, clip, clip.id);
      if (blocker) errors.push(`Chevauchement entre ${clip.id} et ${blocker.id}.`);
    }
    for (const track of project.tracks || []) {
      const list = (project.clips || []).filter((clip) => clip.trackId === track.id).sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i += 1) {
        if (list[i].start < clipEnd(list[i - 1]) - EPS) errors.push(`Piste ${track.id} : clips qui se chevauchent.`);
      }
    }
    return errors;
  }

  function normalizeProject(input) {
    if (!input || typeof input !== 'object') throw invalid('Projet illisible.', 'project');
    const project = createProject({
      id: input.id,
      name: input.name,
      fps: Number(input.fps) || DEFAULTS.fps,
      width: Number(input.width) || DEFAULTS.width,
      height: Number(input.height) || DEFAULTS.height,
      createdAt: input.createdAt
    });
    if (Array.isArray(input.tracks) && input.tracks.length) {
      project.tracks = input.tracks
        .filter((track) => track && typeof track.id === 'string')
        .map((track) => ({
          id: track.id.slice(0, 12),
          kind: track.kind === 'audio' ? 'audio' : 'video',
          name: String(track.name || track.id).slice(0, 24),
          muted: Boolean(track.muted),
          locked: Boolean(track.locked)
        }));
    }
    project.clips = (Array.isArray(input.clips) ? input.clips : [])
      .filter((clip) => clip && getTrack(project, clip.trackId))
      .map((clip) => normalizeClip(project, clip));
    sortClips(project);
    const errors = validateProject(project);
    if (errors.length) throw invalid(`Projet invalide : ${errors[0]}`, 'project_invalid');
    return project;
  }

  function History(limit) {
    this.limit = limit || 120;
    this.past = [];
    this.future = [];
  }

  History.prototype.reset = function () {
    this.past = [];
    this.future = [];
  };

  History.prototype.commit = function (before) {
    this.past.push(clone(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  };

  History.prototype.undo = function (current) {
    if (!this.past.length) return null;
    this.future.push(clone(current));
    return this.past.pop();
  };

  History.prototype.redo = function (current) {
    if (!this.future.length) return null;
    this.past.push(clone(current));
    return this.future.pop();
  };

  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };

  return {
    EPS,
    DEFAULTS,
    MAX_IMAGE_DURATION,
    DEFAULT_TRANSFORM,
    uid,
    clone,
    clamp,
    quantize,
    fitDuration,
    minDuration,
    normalizeTransform,
    fadeFactor,
    createProject,
    getTrack,
    trackIndex,
    addTrack,
    removeTrack,
    updateTrack,
    clipEnd,
    clipsOnTrack,
    canPlace,
    accepts,
    addClip,
    getClip,
    updateClip,
    moveClip,
    trimBounds,
    trimClipTo,
    trimClipBy,
    splitClip,
    removeClip,
    duplicateClip,
    activeClips,
    projectDuration,
    snapTime,
    timecode,
    parseTimecode,
    validateProject,
    normalizeProject,
    sortClips,
    trackKindForClip,
    History
  };
});
