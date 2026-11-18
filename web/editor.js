/* Révélation Studio — Montage vidéo.
   Timeline editor: media bin, multitrack timeline, canvas monitor, encrypted
   local persistence and real-time WebM/MP4 export. */
(function () {
  'use strict';

  const M = window.StudioEditorModel;
  if (!M) {
    console.error('StudioEditorModel introuvable : editor-model.js doit être chargé avant editor.js.');
    return;
  }

  const DB_NAME = 'revelation-editor-v1';
  const DB_VERSION = 1;
  const LABEL_W = 96;
  const ROW_H = 62;
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const STORE_PROJECTS = 'projects';
  const STORE_MEDIA = 'media';
  const STORE_META = 'meta';

  const ASST = { busy: false, voices: null, previewTimer: 0 };

  const S = {
    mounted: false,
    container: null,
    mountToken: 0,
    db: null,
    project: null,
    media: new Map(),
    history: new M.History(150),
    selectedClipId: null,
    playhead: 0,
    playing: false,
    scale: 80,
    snap: true,
    filter: '',
    scopesOpen: false,
    scopeLast: 0,
    scopeSource: null,
    scopePlots: {},
    dirty: false,
    saveTimer: 0,
    raf: 0,
    playStartWall: 0,
    playStartT: 0,
    audioCtx: null,
    master: null,
    streamDest: null,
    nodes: new Map(),
    drag: null,
    exporting: false,
    exportChunks: [],
    exportStream: null,
    exportStarted: 0,
    exportStopRequested: false,
    toastTimer: 0,
    keyHandler: null,
    lastSaved: null,
    missing: new Set(),
    hidden: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function toast(message) {
    const node = $('#ed-toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => node.classList.remove('show'), 4200);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function kindLabel(kind) {
    return { video: 'Vidéo', audio: 'Audio', image: 'Image' }[kind] || 'Média';
  }

  function sanitizeFilename(name) {
    return String(name || 'montage').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'montage';
  }

  function debounceSave() {
    clearTimeout(S.saveTimer);
    setSaveState('Modifications non enregistrées…', 'dirty');
    S.saveTimer = setTimeout(() => { saveProject(false).catch((error) => toast(error.message)); }, 650);
  }

  function setSaveState(text, mode) {
    const node = $('#ed-save-state');
    if (!node) return;
    node.textContent = text;
    node.dataset.mode = mode || '';
  }

  /* ---------------------------------------------------------------- storage */

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Stockage local indisponible.'));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGet(store, key) {
    return requestResult(S.db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function dbGetAll(store) {
    return requestResult(S.db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function dbPut(store, value, key) {
    const objectStore = S.db.transaction(store, 'readwrite').objectStore(store);
    const request = key === undefined ? objectStore.put(value) : objectStore.put(value, key);
    return requestResult(request);
  }

  async function dbDelete(store, key) {
    return requestResult(S.db.transaction(store, 'readwrite').objectStore(store).delete(key));
  }

  function vault() {
    const candidate = window.StudioVault;
    try {
      return candidate && candidate.available && candidate.available() ? candidate : null;
    } catch (error) {
      return null;
    }
  }

  async function sealBytes(bytes) {
    const safe = vault();
    if (safe) {
      const sealed = await safe.seal(bytes);
      return { sealed: true, iv: sealed.iv, data: sealed.data };
    }
    return { sealed: false, plain: bytes };
  }

  async function openBytes(record) {
    if (!record.sealed) return record.plain;
    const safe = vault();
    if (!safe) throw new Error('Coffre verrouillé : reconnecte-toi pour relire les médias.');
    return safe.open(record);
  }

  async function sealBlob(blob) {
    const buffer = await blob.arrayBuffer();
    const chunks = [];
    for (let offset = 0; offset < buffer.byteLength; offset += CHUNK_SIZE) {
      const slice = buffer.slice(offset, Math.min(buffer.byteLength, offset + CHUNK_SIZE));
      chunks.push(await sealBytes(slice));
    }
    return { chunks, size: buffer.byteLength };
  }

  async function openBlob(record) {
    const parts = [];
    for (const chunk of record.chunks) parts.push(await openBytes(chunk));
    return new Blob(parts, { type: record.mime || 'application/octet-stream' });
  }

  async function saveProject(manual) {
    if (!S.project) return;
    clearTimeout(S.saveTimer);
    try {
      const json = new TextEncoder().encode(JSON.stringify(S.project));
      const sealed = await sealBytes(json);
      await dbPut(STORE_PROJECTS, {
        id: S.project.id,
        updatedAt: S.project.updatedAt,
        sealed: sealed.sealed,
        iv: sealed.iv,
        data: sealed.data,
        plain: sealed.plain
      });
      await dbPut(STORE_META, S.project.id, 'last');
      S.dirty = false;
      S.lastSaved = new Date();
      setSaveState(`Enregistré à ${S.lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 'saved');
      if (manual) toast('Montage enregistré dans le stockage local.');
    } catch (error) {
      setSaveState('Échec de l’enregistrement', 'error');
      throw error;
    }
  }

  async function loadProject() {
    const records = await dbGetAll(STORE_PROJECTS);
    if (!records.length) {
      S.project = M.createProject({ name: 'Montage sans titre' });
      await saveProject(false);
      return;
    }
    const lastId = await dbGet(STORE_META, 'last');
    const record = records.find((item) => item.id === lastId) ||
      records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    const bytes = await openBytes(record);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    S.project = M.normalizeProject(parsed.project ? parsed.project : parsed);
  }

  async function newProject() {
    if (!S.project) return;
    if (S.project.clips.length && !window.confirm('Créer un nouveau montage ? Le montage actuel reste enregistré dans le stockage local.')) return;
    try {
      await saveProject(false);
      S.project = M.createProject({ name: 'Montage sans titre' });
      S.selectedClipId = null;
      S.playhead = 0;
      S.history.reset();
      await saveProject(false);
      renderAll();
      toast('Nouveau montage créé. Le précédent reste récupérable dans le stockage local.');
    } catch (error) {
      toast(`Nouveau montage impossible : ${error.message}`);
    }
  }

  /* ------------------------------------------------------------------ media */

  function mediaKind(file) {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type.startsWith('image/')) return 'image';
    const name = file.name.toLowerCase();
    if (/\.(mp4|mov|m4v|webm|mkv|avi)$/.test(name)) return 'video';
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
    if (/\.(png|jpe?g|gif|webp|avif|bmp)$/.test(name)) return 'image';
    return null;
  }

  function probeMedia(file, kind) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      if (kind === 'image') {
        const image = new Image();
        image.onload = () => {
          resolve({ duration: 5, width: image.naturalWidth, height: image.naturalHeight, url });
        };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Image illisible : ${file.name}`)); };
        image.src = url;
        return;
      }
      const element = document.createElement(kind === 'video' ? 'video' : 'audio');
      element.preload = 'metadata';
      element.muted = true;
      const cleanup = () => { element.removeAttribute('src'); element.load(); };
      element.onloadedmetadata = () => {
        const duration = Number.isFinite(element.duration) ? element.duration : 0;
        const width = element.videoWidth || 0;
        const height = element.videoHeight || 0;
        cleanup();
        resolve({ duration, width, height, url });
      };
      element.onerror = () => { cleanup(); URL.revokeObjectURL(url); reject(new Error(`Média illisible : ${file.name}`)); };
      element.src = url;
    });
  }

  async function makeThumbnail(entry) {
    try {
      if (entry.kind === 'image') {
        const image = entry.image || await loadImage(entry.url);
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 108;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(canvas.width / (image.naturalWidth || 16), canvas.height / (image.naturalHeight || 9));
        const width = (image.naturalWidth || 16) * scale;
        const height = (image.naturalHeight || 9) * scale;
        ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        return canvas.toDataURL('image/jpeg', 0.72);
      }
      if (entry.kind !== 'video') return '';
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.src = entry.url;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 3500);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Aperçu impossible')); };
      });
      const target = Math.min(0.25, Math.max(0, (entry.duration || 0) / 2));
      if (target > 0 && Math.abs(video.currentTime - target) > 0.05) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 1500);
          video.onseeked = () => { clearTimeout(timer); resolve(); };
          video.currentTime = target;
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 108;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(canvas.width / (video.videoWidth || 16), canvas.height / (video.videoHeight || 9));
      const width = (video.videoWidth || 16) * scale;
      const height = (video.videoHeight || 9) * scale;
      ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch (error) {
      return '';
    }
  }

  async function ensurePeaks(entry) {
    if (!entry || entry.kind !== 'audio' || entry.peaks || entry.peaksLoading || entry.peaksError) return entry && entry.peaks;
    entry.peaksLoading = true;
    let ctx = S.audioCtx;
    let temporary = false;
    try {
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('Audio non disponible');
        ctx = new Ctx();
        temporary = true;
      }
      const response = await fetch(entry.url);
      const buffer = await response.arrayBuffer();
      const audio = await ctx.decodeAudioData(buffer);
      const data = audio.getChannelData(0);
      const count = 1600;
      const peaks = new Float32Array(count);
      const step = Math.max(1, Math.floor(data.length / count));
      for (let index = 0; index < count; index += 1) {
        const from = index * step;
        const to = Math.min(data.length, from + step);
        let peak = 0;
        for (let cursor = from; cursor < to; cursor += 1) {
          const value = Math.abs(data[cursor]);
          if (value > peak) peak = value;
        }
        peaks[index] = peak;
      }
      entry.peaks = peaks;
      entry.peaksDuration = audio.duration || entry.duration;
      if (S.mounted && S.project) paintWaveforms();
    } catch (error) {
      entry.peaksError = true;
    } finally {
      entry.peaksLoading = false;
      if (temporary && ctx && ctx.close) ctx.close().catch(() => {});
    }
    return entry.peaks;
  }

  async function importFiles(files) {
    const list = Array.from(files || []);
    const created = [];
    if (!list.length) return created;
    let imported = 0;
    for (const file of list) {
      const kind = mediaKind(file);
      if (!kind) { toast(`Format non reconnu : ${file.name}`); continue; }
      try {
        const probe = await probeMedia(file, kind);
        const id = M.uid('media');
        const media = {
          id,
          name: file.name,
          kind,
          mime: file.type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/png'),
          size: file.size,
          duration: kind === 'image' ? 0 : probe.duration,
          width: probe.width || 0,
          height: probe.height || 0,
          addedAt: Date.now(),
          thumb: ''
        };
        const sealed = await sealBlob(file);
        if (probe.url) URL.revokeObjectURL(probe.url);
        const blob = await openBlob({ chunks: sealed.chunks, mime: media.mime });
        const url = URL.createObjectURL(blob);
        const entry = { ...media, url };
        if (kind === 'image') {
          entry.image = await loadImage(url);
        }
        S.media.set(id, entry);
        if (entry.kind === 'audio') ensurePeaks(entry);
        entry.thumb = await makeThumbnail(entry);
        media.thumb = entry.thumb;
        created.push(entry);
        await dbPut(STORE_MEDIA, {
          id,
          meta: media,
          mime: media.mime,
          chunks: sealed.chunks
        });
        const relinked = relinkClips(media);
        imported += 1;
        if (relinked) toast(`${relinked} clip(s) relié(s) à « ${file.name} ».`);
      } catch (error) {
        toast(error.message || `Import impossible : ${file.name}`);
      }
    }
    if (imported) {
      renderMedia();
      renderTimeline();
      renderInspector();
      renderTransport();
      scheduleSaveMetadata();
    }
    return created;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Image illisible.'));
      image.src = url;
    });
  }

  function relinkClips(media) {
    if (!S.project) return 0;
    const before = M.clone(S.project);
    let count = 0;
    for (const clip of S.project.clips) {
      if (clip.mediaName !== media.name) continue;
      if (clip.kind === 'audio' && media.kind !== 'audio') continue;
      if (clip.kind === 'video' && media.kind !== 'video') continue;
      if (clip.kind === 'image' && media.kind !== 'image') continue;
      if (clip.mediaId === media.id) continue;
      if (S.media.has(clip.mediaId) && clip.mediaId !== media.id) continue;
      clip.mediaId = media.id;
      if (media.kind !== 'image' && media.duration > 0) {
        clip.mediaDuration = media.duration;
        clip.in = Math.min(clip.in, Math.max(0, media.duration - M.minDuration(S.project)));
        clip.duration = Math.min(clip.duration, Math.max(M.minDuration(S.project), media.duration - clip.in));
      }
      count += 1;
    }
    if (count) {
      S.project.updatedAt = Date.now();
      S.history.commit(before);
      rebuildMissing();
      debounceSave();
    }
    return count;
  }

  function rebuildMissing() {
    S.missing.clear();
    for (const clip of S.project.clips) {
      if (!S.media.has(clip.mediaId)) S.missing.add(clip.mediaId || clip.mediaName || clip.id);
    }
  }

  function scheduleSaveMetadata() {
    setSaveState('Médias enregistrés localement.', 'saved');
  }

  async function loadMediaLibrary() {
    const records = await dbGetAll(STORE_MEDIA);
    for (const record of records) {
      try {
        const blob = await openBlob(record);
        const url = URL.createObjectURL(blob);
        const meta = record.meta || {};
        const entry = { ...meta, url };
        if (entry.kind === 'image') entry.image = await loadImage(url);
        if (!entry.thumb) entry.thumb = await makeThumbnail(entry);
        S.media.set(entry.id, entry);
        if (entry.kind === 'audio') ensurePeaks(entry);
      } catch (error) {
        console.warn('Média non déchiffré :', record.id, error.message);
      }
    }
    rebuildMissing();
  }

  async function removeMedia(mediaId) {
    const entry = S.media.get(mediaId);
    if (!entry) return;
    const used = S.project.clips.filter((clip) => clip.mediaId === mediaId);
    if (used.length && !window.confirm(`Ce média est utilisé par ${used.length} clip(s). Retirer le média et ses clips ?`)) return;
    const before = M.clone(S.project);
    for (const clip of used) {
      try { M.removeClip(S.project, clip.id); } catch (error) { /* ignore */ }
    }
    S.history.commit(before);
    S.project.updatedAt = Date.now();
    S.media.delete(mediaId);
    if (entry.url) URL.revokeObjectURL(entry.url);
    await dbDelete(STORE_MEDIA, mediaId);
    if (S.selectedClipId && !M.getClip(S.project, S.selectedClipId)) S.selectedClipId = null;
    rebuildMissing();
    debounceSave();
    renderAll();
  }

  /* ----------------------------------------------------------------- render */

  function template() {
    return `
<div class="ed-shell">
  <div class="ed-topbar">
    <div class="ed-project">
      <span class="ed-kicker">MONTAGE VIDÉO</span>
      <input id="ed-project-name" class="ed-name" maxlength="90" value="${esc(S.project.name)}" aria-label="Nom du montage">
      <span id="ed-save-state" class="ed-save" data-mode="saved">Stockage local</span>
    </div>
    <div class="ed-top-actions">
      <button class="ed-btn ed-icon" data-ed="undo" title="Annuler (⌘Z)">↶</button>
      <button class="ed-btn ed-icon" data-ed="redo" title="Rétablir (⇧⌘Z)">↷</button>
      <button class="ed-btn" id="ed-import-media">＋ Importer des médias</button>
      <button class="ed-btn" data-ed="save">Enregistrer</button>
      <button class="ed-btn" data-ed="open-project" title="Importer un projet .json">Ouvrir un projet</button>
      <button class="ed-btn" data-ed="export-project" title="Exporter le montage en .json">Projet .json</button>
      <button class="ed-btn ed-btn-assistant" data-ed="assistant" title="Générer un film complet sans quitter le Studio">Assistant projet</button>
      <button class="ed-btn ed-btn-primary" data-ed="export">Exporter la vidéo</button>
    </div>
  </div>
  <div class="ed-main">
    <aside class="ed-panel ed-media-panel">
      <div class="ed-panel-head"><h3>Médias</h3><span id="ed-media-count" class="ed-pill">0</span></div>
      <button class="ed-btn ed-btn-primary" id="ed-import-media-2">＋ Importer</button>
      <input id="ed-media-search" class="ed-search" type="search" placeholder="Rechercher un média…" autocomplete="off" aria-label="Rechercher un média">
      <div id="ed-media-list" class="ed-media-list"></div>
      <p class="ed-note" id="ed-storage-note"></p>
    </aside>
    <section class="ed-monitor-panel">
      <div class="ed-canvas-wrap" id="ed-canvas-wrap">
        <canvas id="ed-canvas"></canvas>
        <div class="ed-canvas-empty" id="ed-canvas-empty">Importe un média puis glisse-le sur la timeline.</div>
        <div class="ed-scopes" id="ed-scopes" hidden>
          <div class="ed-scope"><span>WFM · LUMA</span><canvas id="ed-scope-wave" width="260" height="120"></canvas></div>
          <div class="ed-scope compact"><span>VECTORSCOPE</span><canvas id="ed-scope-vector" width="122" height="120"></canvas></div>
        </div>
        <div class="ed-export-overlay" id="ed-export-overlay" hidden>
          <div class="ed-export-box">
            <strong>Export en cours</strong>
            <p id="ed-export-text">0 %</p>
            <div class="ed-progress"><div id="ed-export-bar"></div></div>
            <button class="ed-btn" id="ed-export-cancel">Arrêter</button>
            <p class="ed-note">L’export se fait en temps réel sur ce navigateur. Garde l’onglet au premier plan.</p>
          </div>
        </div>
      </div>
      <div class="ed-transport">
        <button class="ed-play" id="ed-play" title="Lecture (Espace)">▶</button>
        <span class="ed-tc" id="ed-timecode">00:00:00:00</span>
        <input type="range" id="ed-scrub" min="0" max="1" step="0.001" value="0" aria-label="Tête de lecture">
        <span class="ed-tc ed-dim" id="ed-duration">00:00:00:00</span>
        <button class="ed-btn" id="ed-split-btn" title="Couper au playhead (S)">Couper</button>
        <button class="ed-btn" id="ed-delete-btn" title="Supprimer (Suppr)">Supprimer</button>
        <button class="ed-btn" id="ed-scopes-toggle" title="Waveform et vectorscope comme dans Resolve">Scopes</button>
        <label class="ed-check"><input type="checkbox" id="ed-snap" checked> Aimant</label>
      </div>
    </section>
    <aside class="ed-panel ed-inspector" id="ed-props"></aside>
  </div>
  <div class="ed-timeline-panel">
    <div class="ed-timeline-toolbar">
      <span class="ed-kicker">TIMELINE</span>
      <button class="ed-btn" data-ed="add-video">＋ Piste vidéo</button>
      <button class="ed-btn" data-ed="add-audio">＋ Piste audio</button>
      <span class="ed-spacer"></span>
      <button class="ed-btn ed-icon" data-ed="zoom-out" title="Zoom arrière">−</button>
      <span id="ed-zoom-label" class="ed-pill">80 px/s</span>
      <button class="ed-btn ed-icon" data-ed="zoom-in" title="Zoom avant">＋</button>
      <button class="ed-btn" data-ed="fit">Ajuster</button>
    </div>
    <div class="ed-timeline-scroll" id="ed-timeline-scroll">
      <div class="ed-timeline-inner" id="ed-timeline-inner">
        <div class="ed-ruler-row">
          <div class="ed-ruler-label">TEMPS</div>
          <div class="ed-ruler-lane" id="ed-ruler-lane"></div>
        </div>
        <div id="ed-rows" class="ed-rows"></div>
        <div class="ed-playhead" id="ed-playhead"><span></span></div>
      </div>
    </div>
  </div>
  <input type="file" id="ed-files" accept="video/*,audio/*,image/*" multiple hidden>
  <input type="file" id="ed-project-file" accept=".json,application/json" hidden>
  <div class="ed-assistant-overlay" id="ed-assistant-overlay" hidden>
    <div class="ed-assistant" role="dialog" aria-modal="true" aria-labelledby="ed-asst-title">
      <header class="ed-asst-head">
        <div><span class="ed-kicker">FABRIQUER DANS LE STUDIO</span><h2 id="ed-asst-title">Assistant projet</h2></div>
        <button class="ed-mini" id="ed-asst-close" title="Fermer">×</button>
      </header>
      <div class="ed-asst-grid">
        <div class="ed-asst-controls">
          <div class="ed-two">
            <div class="ed-field"><label for="ed-asst-style">Style</label><select id="ed-asst-style">
              <option value="ambre">Ambre</option><option value="acier">Acier</option><option value="nuit">Nuit</option><option value="neon">Néon</option>
            </select></div>
            <div class="ed-field"><label for="ed-asst-duration">Durée (s)</label><input id="ed-asst-duration" type="number" min="12" max="120" step="1" value="30"></div>
          </div>
          <div class="ed-field"><label for="ed-asst-subject">Sujet du film</label><input id="ed-asst-subject" maxlength="80" value="Révélation Studio"></div>
          <div class="ed-field"><label for="ed-asst-signature">Signature finale</label><input id="ed-asst-signature" maxlength="120" value="Fabriqué de bout en bout dans Révélation Studio."></div>
          <div class="ed-field"><label for="ed-asst-voice">Voix off</label><select id="ed-asst-voice"><option value="">Détection…</option></select></div>
          <div class="ed-field"><label for="ed-asst-rate">Débit <span id="ed-asst-rate-value">175</span></label><input id="ed-asst-rate" type="range" min="120" max="240" step="5" value="175"></div>
          <div class="ed-asst-checks">
            <label class="ed-check"><input type="checkbox" id="ed-asst-images" checked> 6 plans cinématiques</label>
            <label class="ed-check"><input type="checkbox" id="ed-asst-titles" checked> Titres transparents</label>
            <label class="ed-check"><input type="checkbox" id="ed-asst-music" checked> Musique originale</label>
            <label class="ed-check"><input type="checkbox" id="ed-asst-voice-on" checked> Voix off</label>
          </div>
          <p class="ed-note" id="ed-asst-voice-note">Détection des voix système…</p>
        </div>
        <div class="ed-asst-visual">
          <canvas id="ed-asst-preview" width="640" height="360"></canvas>
          <div class="ed-asst-preview-meta"><span id="ed-asst-preview-title">UNE IDÉE</span><span>Plan 1 · 6 plans</span></div>
          <p class="ed-note">Aperçu réel du plan 1. Les images, les titres et la musique sont rendus localement, puis assemblés sur la timeline avec les voix disponibles.</p>
        </div>
      </div>
      <div class="ed-asst-log" id="ed-asst-log"><div><span>Prêt.</span><small>Le montage actuel sera enregistré puis remplacé.</small></div></div>
      <footer class="ed-asst-foot">
        <span class="ed-note" id="ed-asst-summary">6 plans · 6 titres · musique · 6 voix</span>
        <div>
          <button class="ed-btn" id="ed-asst-cancel">Fermer</button>
          <button class="ed-btn ed-btn-primary" id="ed-asst-generate">Générer le projet</button>
        </div>
      </footer>
    </div>
  </div>
  <div class="ed-toast" id="ed-toast" role="status"></div>
</div>`;
  }

  function renderMedia() {
    const list = $('#ed-media-list');
    if (!list) return;
    const allEntries = Array.from(S.media.values()).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    const query = S.filter.trim().toLowerCase();
    const entries = query ? allEntries.filter((entry) => entry.name.toLowerCase().includes(query)) : allEntries;
    $('#ed-media-count').textContent = query ? `${entries.length}/${allEntries.length}` : String(allEntries.length);
    $('#ed-storage-note').textContent = vault()
      ? 'Médias chiffrés (AES-GCM) dans ce navigateur. Le mot de passe du coffre les protège.'
      : 'Stockage local du navigateur. Reconnecte-toi au Studio pour chiffrer les nouveaux médias.';
    if (!entries.length) {
      list.innerHTML = allEntries.length
        ? `<div class="ed-empty">Aucun média ne correspond à « ${esc(S.filter.trim())} ».</div>`
        : '<div class="ed-empty">Aucun média. Importe une vidéo, une image ou un son.</div>';
      return;
    }
    list.innerHTML = entries.map((entry) => {
      const thumb = entry.thumb
        ? `<img src="${esc(entry.thumb)}" alt="">`
        : entry.kind === 'audio'
          ? '<span class="ed-audio-glyph">♫</span>'
          : '<span class="ed-audio-glyph">▢</span>';
      const duration = entry.kind === 'image' ? 'image' : M.timecode(entry.duration, S.project.fps);
      return `<article class="ed-media-item" draggable="true" data-media-id="${esc(entry.id)}" data-kind="${esc(entry.kind)}">
        <div class="ed-thumb">${thumb}</div>
        <div class="ed-media-info">
          <strong title="${esc(entry.name)}">${esc(entry.name)}</strong>
          <small>${esc(kindLabel(entry.kind))} · ${esc(duration)} · ${formatBytes(entry.size)}</small>
        </div>
        <div class="ed-media-actions">
          <button class="ed-mini" data-media-add="${esc(entry.id)}" title="Ajouter au playhead">＋</button>
          <button class="ed-mini" data-media-remove="${esc(entry.id)}" title="Retirer le média">×</button>
        </div>
      </article>`;
    }).join('');
    list.querySelectorAll('.ed-media-item').forEach((item) => {
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', item.dataset.mediaId);
        event.dataTransfer.setData('application/x-revelation-media', item.dataset.mediaId);
        event.dataTransfer.effectAllowed = 'copy';
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dblclick', () => addMediaAtPlayhead(item.dataset.mediaId));
    });
    list.querySelectorAll('[data-media-add]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        addMediaAtPlayhead(button.dataset.mediaAdd);
      });
    });
    list.querySelectorAll('[data-media-remove]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        removeMedia(button.dataset.mediaRemove).catch((error) => toast(error.message));
      });
    });
  }

  function rulerStep() {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    return steps.find((step) => step * S.scale >= 74) || steps[steps.length - 1];
  }

  function timelineMetrics() {
    const duration = Math.max(M.projectDuration(S.project), 0);
    const contentDuration = Math.max(20, duration + 6);
    const scroll = $('#ed-timeline-scroll');
    const viewport = Math.max(420, (scroll ? scroll.clientWidth : 900) - LABEL_W);
    const width = Math.max(viewport, contentDuration * S.scale);
    return { duration, contentDuration, width };
  }

  function renderTimeline() {
    if (!S.project) return;
    const { width } = timelineMetrics();
    const ruler = $('#ed-ruler-lane');
    const rows = $('#ed-rows');
    if (!ruler || !rows) return;
    ruler.style.width = `${width}px`;

    const step = rulerStep();
    const tickCount = Math.min(300, Math.ceil(width / (step * S.scale)));
    let ticks = '';
    for (let index = 0; index <= tickCount; index += 1) {
      const time = index * step;
      const x = time * S.scale;
      const major = true;
      ticks += `<div class="ed-tick ${major ? 'major' : ''}" style="left:${x}px"><span>${esc(M.timecode(time, S.project.fps).slice(3, 8))}</span></div>`;
      for (let sub = 1; sub < 5; sub += 1) {
        const subTime = time + (step * sub) / 5;
        ticks += `<div class="ed-tick minor" style="left:${subTime * S.scale}px"></div>`;
      }
    }
    ruler.innerHTML = ticks;

    rows.innerHTML = S.project.tracks.map((track) => {
      const clips = S.project.clips
        .filter((clip) => clip.trackId === track.id)
        .sort((a, b) => a.start - b.start)
        .map((clip) => clipMarkup(clip, track))
        .join('');
      return `<div class="ed-row ${track.kind}" data-track-id="${esc(track.id)}" style="height:${ROW_H}px">
        <div class="ed-row-label">
          <strong>${esc(track.name || track.id)}</strong>
          <div class="ed-row-buttons">
            <button class="ed-mini ${track.muted ? 'on' : ''}" data-track-mute="${esc(track.id)}" title="Muet">M</button>
            <button class="ed-mini ${track.locked ? 'on' : ''}" data-track-lock="${esc(track.id)}" title="Verrou">▮</button>
            <button class="ed-mini" data-track-del="${esc(track.id)}" title="Supprimer la piste">×</button>
          </div>
        </div>
        <div class="ed-lane" data-track-id="${esc(track.id)}" data-kind="${esc(track.kind)}" style="width:${width}px">${clips}</div>
      </div>`;
    }).join('');

    $('#ed-playhead').style.height = `${30 + S.project.tracks.length * ROW_H}px`;
    $('#ed-zoom-label').textContent = `${Math.round(S.scale)} px/s`;
    positionPlayhead();
    bindTimelinePointer();
    bindTrackButtons();
    bindLaneDrop();
    paintWaveforms();
  }

  function clipMarkup(clip, track) {
    const left = clip.start * S.scale;
    const width = Math.max(2, clip.duration * S.scale);
    const selected = clip.id === S.selectedClipId ? ' selected' : '';
    const missing = !S.media.has(clip.mediaId) ? ' missing' : '';
    const kind = clip.kind === 'image' ? 'image' : clip.kind;
    const label = missing ? 'Média à relier' : clip.name;
    const detail = missing
      ? esc(clip.mediaName || 'fichier absent')
      : `${M.timecode(clip.in, S.project.fps)} → ${M.timecode(clip.in + clip.duration, S.project.fps)}`;
    const fadeIn = Number(clip.fadeIn) || 0;
    const fadeOut = Number(clip.fadeOut) || 0;
    const fadeSpan = (value) => Math.max(3, Math.round((value / Math.max(0.001, clip.duration)) * 100));
    const wave = clip.kind === 'audio' && !missing
      ? `<canvas class="ed-wave" data-clip-id="${esc(clip.id)}" width="${Math.min(4096, Math.max(2, Math.round(width)))}" height="50"></canvas>`
      : '';
    return `<div class="ed-clip ${kind}${selected}${missing}${track.locked ? ' locked' : ''}" data-clip-id="${esc(clip.id)}" style="left:${left}px;width:${width}px">
      ${wave}
      ${fadeIn > 0 ? `<div class="ed-fade left" style="width:${fadeSpan(fadeIn)}%"></div>` : ''}
      ${fadeOut > 0 ? `<div class="ed-fade right" style="width:${fadeSpan(fadeOut)}%"></div>` : ''}
      <div class="ed-clip-handle left" data-trim="left"></div>
      <div class="ed-clip-body"><strong>${esc(label)}</strong><small>${esc(detail)}</small></div>
      <div class="ed-clip-handle right" data-trim="right"></div>
    </div>`;
  }

  function paintWaveforms() {
    if (!S.project) return;
    const canvases = $$('#ed-rows canvas.ed-wave');
    for (const canvas of canvases) {
      const clip = M.getClip(S.project, canvas.dataset.clipId);
      const entry = clip ? S.media.get(clip.mediaId) : null;
      const peaks = entry && entry.peaks;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      if (!peaks || !peaks.length) continue;
      const total = Math.max(0.001, entry.peaksDuration || Number(clip.mediaDuration) || 1);
      const from = M.clamp(clip.in / total, 0, 1);
      const to = M.clamp((clip.in + clip.duration) / total, 0, 1);
      const mid = height / 2;
      ctx.fillStyle = 'rgba(197, 240, 209, 0.62)';
      for (let x = 0; x < width; x += 1) {
        const fraction = width <= 1 ? from : from + (to - from) * (x / (width - 1));
        const index = Math.min(peaks.length - 1, Math.max(0, Math.floor(fraction * peaks.length)));
        const amplitude = Math.min(1, peaks[index] * 1.5) * (mid - 1);
        ctx.fillRect(x, mid - amplitude, 1, Math.max(1, amplitude * 2));
      }
    }
  }

  function positionPlayhead() {
    const playhead = $('#ed-playhead');
    if (!playhead) return;
    playhead.style.left = `${LABEL_W + S.playhead * S.scale}px`;
  }

  function renderTransport() {
    if (!S.project) return;
    const duration = Math.max(M.projectDuration(S.project), 0);
    $('#ed-timecode').textContent = M.timecode(S.playhead, S.project.fps);
    $('#ed-duration').textContent = M.timecode(duration, S.project.fps);
    const scrub = $('#ed-scrub');
    scrub.max = String(Math.max(1, duration / 1));
    scrub.value = String(Math.min(duration, S.playhead));
    $('#ed-play').textContent = S.playing ? '❚❚' : '▶';
  }

  function renderInspector() {
    const panel = $('#ed-props');
    if (!panel) return;
    const clip = S.selectedClipId ? M.getClip(S.project, S.selectedClipId) : null;
    if (!clip) {
      const duration = M.projectDuration(S.project);
      panel.innerHTML = `<div class="ed-panel-head"><h3>Montage</h3></div>
        <div class="ed-field"><label>Nom</label><input id="ed-insp-name" maxlength="90" value="${esc(S.project.name)}"></div>
        <div class="ed-field"><label>Format</label>
          <select id="ed-insp-format">
            ${[[1920, 1080, '1920 × 1080 · 16:9'], [1280, 720, '1280 × 720 · 16:9'], [1080, 1920, '1080 × 1920 · 9:16'], [1080, 1080, '1080 × 1080 · 1:1'], [2560, 1080, '2560 × 1080 · 21:9']].map(([w, h, label]) => `<option value="${w}x${h}" ${S.project.width === w && S.project.height === h ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
        <div class="ed-field"><label>Cadence</label>
          <select id="ed-insp-fps">${[24, 25, 30, 50, 60].map((fps) => `<option value="${fps}" ${S.project.fps === fps ? 'selected' : ''}>${fps} i/s</option>`).join('')}</select>
        </div>
        <div class="ed-stats">
          <div><strong>${M.timecode(duration, S.project.fps)}</strong><small>Durée</small></div>
          <div><strong>${S.project.clips.length}</strong><small>Clips</small></div>
          <div><strong>${S.media.size}</strong><small>Médias</small></div>
          <div><strong>${S.project.tracks.length}</strong><small>Pistes</small></div>
        </div>
        <p class="ed-note">Glisse un média sur une piste, ou utilise ＋ pour l’ajouter au playhead. Un clip se déplace, se coupe avec S et se rogne par ses poignées.</p>
        <div class="ed-shortcuts">
          <div><kbd>Espace</kbd> lecture</div><div><kbd>S</kbd> couper</div>
          <div><kbd>←</kbd><kbd>→</kbd> image</div><div><kbd>Suppr</kbd> supprimer</div>
          <div><kbd>⌘Z</kbd> annuler</div><div><kbd>⇧⌘Z</kbd> rétablir</div>
        </div>`;
      bindInspectorProject();
      return;
    }
    const trackOptions = S.project.tracks
      .filter((track) => M.accepts(track, clip.kind))
      .map((track) => `<option value="${esc(track.id)}" ${clip.trackId === track.id ? 'selected' : ''}>${esc(track.name || track.id)}</option>`)
      .join('');
    const mediaEntry = S.media.get(clip.mediaId);
    const missing = !mediaEntry;
    const grade = clip.grade || { exposure: 0, contrast: 0, saturation: 0, temperature: 0 };
    const transform = clip.transform || M.DEFAULT_TRANSFORM;
    const frameStep = (1 / S.project.fps).toFixed(4);
    const gv = (name) => Math.round(Number(grade[name]) || 0);
    const gradeSlider = (name, label) => `<div class="ed-grade-row"><label for="ed-grade-${name}">${label}<span id="ed-grade-${name}-value">${gv(name) > 0 ? '+' : ''}${gv(name)}</span></label><input id="ed-grade-${name}" data-grade="${name}" type="range" min="-100" max="100" step="1" value="${gv(name)}"></div>`;
    panel.innerHTML = `<div class="ed-panel-head"><h3>Clip</h3><button class="ed-mini" id="ed-insp-close" title="Désélectionner">×</button></div>
      <div class="ed-field"><label>Nom du clip</label><input id="ed-clip-name" maxlength="120" value="${esc(clip.name)}"></div>
      <div class="ed-field"><label>Média</label><input value="${esc(clip.mediaName || '—')}" disabled></div>
      ${missing ? `<p class="ed-warn">Média absent. Réimporte le fichier « ${esc(clip.mediaName || '')} » : il sera relié automatiquement.</p>` : ''}
      <div class="ed-field"><label>Piste</label><select id="ed-clip-track">${trackOptions}</select></div>
      <div class="ed-two">
        <div class="ed-field"><label>Début (s)</label><input id="ed-clip-start" type="number" min="0" step="${(1 / S.project.fps).toFixed(4)}" value="${clip.start.toFixed(3)}"></div>
        <div class="ed-field"><label>Durée (s)</label><input id="ed-clip-duration" type="number" min="${(1 / S.project.fps).toFixed(4)}" step="${(1 / S.project.fps).toFixed(4)}" value="${clip.duration.toFixed(3)}"></div>
      </div>
      <div class="ed-two">
        <div class="ed-field"><label>Entrée source (s)</label><input id="ed-clip-in" type="number" min="0" step="${frameStep}" value="${clip.in.toFixed(3)}"></div>
        <div class="ed-field"><label>Sortie source</label><input value="${(clip.in + clip.duration).toFixed(3)} s" disabled></div>
      </div>
      <div class="ed-two">
        <div class="ed-field"><label>Fondu entrée (s)</label><input id="ed-clip-fadein" type="number" min="0" max="${clip.duration.toFixed(3)}" step="${frameStep}" value="${clip.fadeIn.toFixed(3)}"></div>
        <div class="ed-field"><label>Fondu sortie (s)</label><input id="ed-clip-fadeout" type="number" min="0" max="${clip.duration.toFixed(3)}" step="${frameStep}" value="${clip.fadeOut.toFixed(3)}"></div>
      </div>
      ${clip.kind === 'audio' ? '' : `<div class="ed-field"><label>Opacité <span id="ed-opacity-value">${Math.round(clip.opacity * 100)} %</span></label><input id="ed-clip-opacity" type="range" min="0" max="1" step="0.01" value="${clip.opacity}"></div>`}
      <div class="ed-field"><label>Volume <span id="ed-volume-value">${Math.round(clip.volume * 100)} %</span></label><input id="ed-clip-volume" type="range" min="0" max="2" step="0.01" value="${clip.volume}"></div>
      <label class="ed-check"><input type="checkbox" id="ed-clip-muted" ${clip.muted ? 'checked' : ''}> Couper le son du clip</label>
      ${clip.kind === 'audio' ? '' : `<div class="ed-grade">
        <div class="ed-grade-head"><h4>Transformation</h4><button type="button" class="ed-btn ed-reset" id="ed-transform-reset">Réinitialiser</button></div>
        <div class="ed-two">
          <div class="ed-field"><label>Position X</label><input id="ed-tr-x" type="number" min="-1" max="1" step="0.01" value="${transform.x.toFixed(2)}"></div>
          <div class="ed-field"><label>Position Y</label><input id="ed-tr-y" type="number" min="-1" max="1" step="0.01" value="${transform.y.toFixed(2)}"></div>
        </div>
        <div class="ed-two">
          <div class="ed-field"><label>Échelle</label><input id="ed-tr-scale" type="range" min="0.05" max="3" step="0.01" value="${transform.scale}"></div>
          <div class="ed-field"><label>Rotation</label><input id="ed-tr-rotation" type="range" min="-180" max="180" step="1" value="${transform.rotation}"></div>
        </div>
        <div class="ed-actions" style="grid-template-columns:repeat(3,1fr)">
          <button type="button" class="ed-btn" data-tr-preset="plein">Plein cadre</button>
          <button type="button" class="ed-btn" data-tr-preset="gauche">Gauche</button>
          <button type="button" class="ed-btn" data-tr-preset="droite">Droite</button>
        </div>
      </div>`}
      ${clip.kind === 'audio' ? '' : `<div class="ed-grade">
        <div class="ed-grade-head"><h4>Étalonnage</h4><span>Canvas + export</span></div>
        ${gradeSlider('exposure', 'Exposition')}
        ${gradeSlider('contrast', 'Contraste')}
        ${gradeSlider('saturation', 'Saturation')}
        ${gradeSlider('temperature', 'Température')}
        <div class="ed-grade-presets">
          <button type="button" class="ed-btn" data-grade-preset="neutre">Neutre</button>
          <button type="button" class="ed-btn" data-grade-preset="ambre">Ambre</button>
          <button type="button" class="ed-btn" data-grade-preset="acier">Acier</button>
          <button type="button" class="ed-btn" data-grade-preset="contraste">Contraste</button>
        </div>
      </div>`}
      <div class="ed-actions">
        <button class="ed-btn" id="ed-clip-split">Couper au playhead</button>
        <button class="ed-btn" id="ed-clip-duplicate">Dupliquer</button>
        <button class="ed-btn ed-danger" id="ed-clip-delete">Supprimer</button>
        <button class="ed-btn ed-danger" id="ed-clip-ripple">Supprimer et fermer</button>
      </div>
      <p class="ed-note">Point d’entrée + durée = sortie source. Le trim gauche déplace l’entrée, le trim droite allonge jusqu’à la fin du média.</p>`;
    bindInspectorClip(clip);
  }

  function renderAll() {
    renderMedia();
    renderTimeline();
    renderInspector();
    renderTransport();
    drawFrame(S.playhead);
    updateUndoButtons();
    if ($('#ed-project-name')) $('#ed-project-name').value = S.project.name;
  }

  function updateUndoButtons() {
    const undo = document.querySelector('[data-ed="undo"]');
    const redo = document.querySelector('[data-ed="redo"]');
    if (undo) undo.disabled = !S.history.canUndo();
    if (redo) redo.disabled = !S.history.canRedo();
  }

  /* ---------------------------------------------------------------- playback */

  function ensureAudio() {
    if (!S.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      S.audioCtx = new Ctx();
      S.master = S.audioCtx.createGain();
      S.master.gain.value = 1;
      S.master.connect(S.audioCtx.destination);
      if (S.audioCtx.createMediaStreamDestination) {
        S.streamDest = S.audioCtx.createMediaStreamDestination();
        S.master.connect(S.streamDest);
      }
    }
    if (S.audioCtx.state === 'suspended') S.audioCtx.resume().catch(() => {});
    if (!S.hidden) {
      S.hidden = document.createElement('div');
      S.hidden.className = 'ed-hidden-media';
      S.hidden.setAttribute('aria-hidden', 'true');
      $('#ed-canvas-wrap').appendChild(S.hidden);
    }
    return S.audioCtx;
  }

  function nodeForClip(clip) {
    if (clip.kind === 'image') return null;
    if (S.nodes.has(clip.id)) return S.nodes.get(clip.id);
    const entry = S.media.get(clip.mediaId);
    if (!entry) return null;
    ensureAudio();
    const element = document.createElement(clip.kind === 'audio' ? 'audio' : 'video');
    element.preload = 'auto';
    element.playsInline = true;
    element.muted = false;
    element.dataset.clipId = clip.id;
    element.src = entry.url;
    element.addEventListener('seeked', () => {
      if (!S.playing && S.media.get(clip.mediaId)) drawFrame(S.playhead);
    });
    element.addEventListener('error', () => {
      if (!element.dataset.reported) {
        element.dataset.reported = '1';
        toast(`Lecture impossible : ${entry.name}`);
      }
    });
    if (S.hidden) S.hidden.appendChild(element);
    const node = { el: element, source: null, gain: null };
    if (S.audioCtx && S.master) {
      try {
        node.source = S.audioCtx.createMediaElementSource(element);
        node.gain = S.audioCtx.createGain();
        node.gain.gain.value = 1;
        node.source.connect(node.gain);
        node.gain.connect(S.master);
      } catch (error) {
        node.source = null;
        node.gain = null;
      }
    }
    S.nodes.set(clip.id, node);
    return node;
  }

  function disposeClipNode(clipId) {
    const node = S.nodes.get(clipId);
    if (!node) return;
    try { node.el.pause(); } catch (error) { /* ignore */ }
    try { node.el.removeAttribute('src'); node.el.load(); } catch (error) { /* ignore */ }
    try { node.source?.disconnect(); node.gain?.disconnect(); } catch (error) { /* ignore */ }
    node.el.remove();
    S.nodes.delete(clipId);
  }

  function clipTargetTime(clip, timelineTime) {
    return clip.in + (timelineTime - clip.start);
  }

  function syncAt(time, playing) {
    if (!S.project) return;
    const active = new Set(M.activeClips(S.project, time).map((item) => item.clip.id));
    for (const clip of S.project.clips) {
      if (clip.kind === 'image') continue;
      const track = M.getTrack(S.project, clip.trackId);
      const isActive = active.has(clip.id);
      const node = isActive ? nodeForClip(clip) : S.nodes.get(clip.id);
      if (!node) continue;
      const target = clipTargetTime(clip, time);
      const limit = Number.isFinite(clip.mediaDuration) && clip.mediaDuration > 0 ? clip.mediaDuration : node.el.duration;
      const safeTarget = Math.max(0, Math.min(Number.isFinite(limit) ? Math.max(0, limit - 0.02) : target, target));
      if (node.gain) {
        const fade = M.fadeFactor(clip, time);
        const gain = track && track.muted ? 0 : clip.volume * (clip.muted ? 0 : 1) * fade;
        node.gain.gain.value = gain;
      }
      if (!isActive) {
        if (!node.el.paused) node.el.pause();
        continue;
      }
      if (playing) {
        if (node.el.paused) {
          try { node.el.currentTime = safeTarget; } catch (error) { /* ignore */ }
          node.el.play().catch(() => {});
        } else if (Math.abs(node.el.currentTime - safeTarget) > 0.3) {
          try { node.el.currentTime = safeTarget; } catch (error) { /* ignore */ }
        }
      } else {
        if (!node.el.paused) node.el.pause();
        if (Math.abs(node.el.currentTime - safeTarget) > 0.04) {
          try { node.el.currentTime = safeTarget; } catch (error) { /* ignore */ }
        }
      }
    }
  }

  function gradeFilter(clip) {
    const grade = clip.grade || {};
    const exposure = Number(grade.exposure) || 0;
    const contrast = Number(grade.contrast) || 0;
    const saturation = Number(grade.saturation) || 0;
    const temperature = Number(grade.temperature) || 0;
    const parts = [];
    if (exposure) parts.push(`brightness(${Math.max(0.05, 1 + exposure / 125)})`);
    if (contrast) parts.push(`contrast(${Math.max(0.1, 1 + contrast / 125)})`);
    if (saturation) parts.push(`saturate(${Math.max(0, 1 + saturation / 100)})`);
    if (temperature > 0) parts.push(`sepia(${(temperature * 0.32).toFixed(1)}%)`);
    else if (temperature < 0) parts.push(`hue-rotate(${(temperature * 0.12).toFixed(1)}deg)`);
    return parts.length ? parts.join(' ') : 'none';
  }

  function drawFrame(time) {
    const canvas = $('#ed-canvas');
    if (!canvas || !S.project) return;
    if (canvas.width !== S.project.width) canvas.width = S.project.width;
    if (canvas.height !== S.project.height) canvas.height = S.project.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const active = M.activeClips(S.project, time).filter((item) => item.clip.kind !== 'audio');
    let painted = false;
    for (const item of active) {
      const clip = item.clip;
      const alpha = M.clamp((Number(clip.opacity) || 0) * M.fadeFactor(clip, time), 0, 1);
      if (alpha <= 0) continue;
      if (clip.kind === 'image') {
        const entry = S.media.get(clip.mediaId);
        if (entry && entry.image && entry.image.complete) {
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.filter = gradeFilter(clip);
          transformDraw(ctx, entry.image, entry.image.naturalWidth, entry.image.naturalHeight, canvas, clip);
          ctx.restore();
          painted = true;
        }
        continue;
      }
      const entry = S.media.get(clip.mediaId);
      if (!entry) continue;
      const node = S.nodes.get(clip.id);
      if (node && node.el.readyState >= 2 && node.el.videoWidth) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = gradeFilter(clip);
        transformDraw(ctx, node.el, node.el.videoWidth, node.el.videoHeight, canvas, clip);
        ctx.restore();
        painted = true;
      }
    }
    ctx.filter = 'none';
    const empty = $('#ed-canvas-empty');
    if (empty) empty.hidden = painted || active.length > 0;
    renderScopes(false);
  }

  function transformDraw(ctx, source, width, height, canvas, clip) {
    if (!width || !height) return;
    const transform = clip.transform || M.DEFAULT_TRANSFORM;
    const scale = Math.min(canvas.width / width, canvas.height / height) * transform.scale;
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    ctx.translate(canvas.width / 2 + (transform.x * canvas.width) / 2, canvas.height / 2 + (transform.y * canvas.height) / 2);
    if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  }

  /* ------------------------------------------------------------------ scopes */

  function ensureScopeSource() {
    if (!S.scopeSource) {
      S.scopeSource = document.createElement('canvas');
      S.scopeSource.width = 320;
      S.scopeSource.height = 180;
    }
    return S.scopeSource;
  }

  function renderScopes(force) {
    const panel = $('#ed-scopes');
    if (!panel || panel.hidden) return;
    const now = performance.now();
    if (!force && now - S.scopeLast < 120) return;
    S.scopeLast = now;
    const canvas = $('#ed-canvas');
    const wave = $('#ed-scope-wave');
    const vector = $('#ed-scope-vector');
    if (!canvas || !wave || !vector || !canvas.width || !canvas.height) return;
    const source = ensureScopeSource();
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    sourceCtx.drawImage(canvas, 0, 0, source.width, source.height);
    const pixels = sourceCtx.getImageData(0, 0, source.width, source.height).data;

    const waveCtx = wave.getContext('2d');
    const ww = wave.width;
    const wh = wave.height;
    waveCtx.clearRect(0, 0, ww, wh);
    waveCtx.fillStyle = '#05070a';
    waveCtx.fillRect(0, 0, ww, wh);
    waveCtx.strokeStyle = 'rgba(120, 180, 140, 0.18)';
    waveCtx.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      const y = (wh / 4) * row;
      waveCtx.beginPath();
      waveCtx.moveTo(0, y + 0.5);
      waveCtx.lineTo(ww, y + 0.5);
      waveCtx.stroke();
    }
    waveCtx.fillStyle = 'rgba(180, 235, 195, 0.34)';
    for (let sy = 0; sy < source.height; sy += 2) {
      for (let sx = 0; sx < source.width; sx += 2) {
        const offset = (sy * source.width + sx) * 4;
        const luma = (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255;
        const x = (sx / (source.width - 1)) * (ww - 1);
        const y = (1 - luma) * (wh - 1);
        waveCtx.fillRect(x, y, 1, 1);
      }
    }

    const vectorCtx = vector.getContext('2d');
    const vw = vector.width;
    const vh = vector.height;
    vectorCtx.clearRect(0, 0, vw, vh);
    vectorCtx.fillStyle = '#05070a';
    vectorCtx.fillRect(0, 0, vw, vh);
    const cx = vw / 2;
    const cy = vh / 2;
    const radius = Math.min(cx, cy) - 6;
    vectorCtx.strokeStyle = 'rgba(130, 170, 200, 0.22)';
    vectorCtx.beginPath();
    vectorCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    vectorCtx.stroke();
    vectorCtx.beginPath();
    vectorCtx.moveTo(cx - radius, cy);
    vectorCtx.lineTo(cx + radius, cy);
    vectorCtx.moveTo(cx, cy - radius);
    vectorCtx.lineTo(cx, cy + radius);
    vectorCtx.stroke();
    const targets = [['R', 103.5], ['M', 61], ['B', 347], ['C', 283], ['G', 241], ['Y', 167]];
    vectorCtx.font = '7px ui-monospace, Menlo, monospace';
    for (const [label, angle] of targets) {
      const radians = (angle * Math.PI) / 180;
      const tx = cx + Math.cos(radians) * (radius - 8);
      const ty = cy - Math.sin(radians) * (radius - 8);
      vectorCtx.fillStyle = 'rgba(190, 200, 215, 0.5)';
      vectorCtx.fillText(label, tx - 2, ty + 2);
    }
    vectorCtx.fillStyle = 'rgba(215, 210, 245, 0.4)';
    const unit = radius / 0.5;
    for (let sy = 0; sy < source.height; sy += 2) {
      for (let sx = 0; sx < source.width; sx += 2) {
        const offset = (sy * source.width + sx) * 4;
        const r = pixels[offset] / 255;
        const g = pixels[offset + 1] / 255;
        const b = pixels[offset + 2] / 255;
        const cb = -0.1687 * r - 0.3313 * g + 0.5 * b;
        const cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
        const x = cx + cb * unit;
        const y = cy - cr * unit;
        if (x < 0 || x >= vw || y < 0 || y >= vh) continue;
        vectorCtx.fillRect(x, y, 1, 1);
      }
    }
  }

  function toggleScopes() {
    S.scopesOpen = !S.scopesOpen;
    const panel = $('#ed-scopes');
    const button = $('#ed-scopes-toggle');
    if (panel) panel.hidden = !S.scopesOpen;
    if (button) button.classList.toggle('ed-active', S.scopesOpen);
    if (S.scopesOpen) renderScopes(true);
  }

  function duration() {
    return M.projectDuration(S.project);
  }

  function play(force) {
    if (!S.project || (S.exporting && !force)) return;
    const total = duration();
    if (total <= 0) { toast('Ajoute d’abord un clip sur la timeline.'); return; }
    ensureAudio();
    if (S.playhead >= total - 1 / S.project.fps) S.playhead = 0;
    S.playing = true;
    S.playStartWall = performance.now();
    S.playStartT = S.playhead;
    syncAt(S.playhead, true);
    $('#ed-play').textContent = '❚❚';
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(tick);
  }

  function pause(options) {
    if (!S.project) return;
    S.playing = false;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (options && options.atEnd) S.playhead = duration();
    syncAt(S.playhead, false);
    drawFrame(S.playhead);
    renderTransport();
    positionPlayhead();
    $('#ed-play').textContent = '▶';
  }

  function tick(now) {
    if (!S.playing || !S.project) return;
    const total = duration();
    const elapsed = (now - S.playStartWall) / 1000;
    let time = S.playStartT + elapsed;
    if (time >= total) {
      S.playhead = total;
      drawFrame(time);
      positionPlayhead();
      renderTransport();
      pause({ atEnd: true });
      if (S.exporting) finishExport();
      return;
    }
    S.playhead = Math.max(0, time);
    syncAt(S.playhead, true);
    drawFrame(S.playhead);
    positionPlayhead();
    renderTransport();
    if (S.exporting) updateExportProgress();
    S.raf = requestAnimationFrame(tick);
  }

  function seek(time, options) {
    if (!S.project) return;
    const total = duration();
    const target = M.quantize(S.project, Math.max(0, Math.min(total || 0, Number(time) || 0)));
    const wasPlaying = S.playing;
    if (wasPlaying) pause();
    S.playhead = target;
    syncAt(target, false);
    drawFrame(target);
    positionPlayhead();
    renderTransport();
    if (wasPlaying && options && options.keepPlaying) play();
  }

  function step(frames) {
    if (!S.project) return;
    seek(S.playhead + frames / S.project.fps);
  }

  /* ----------------------------------------------------------------- export */

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidates.find((mime) => {
      try { return MediaRecorder.isTypeSupported(mime); } catch (error) { return false; }
    }) || '';
  }

  async function exportVideo() {
    if (S.exporting) return;
    const total = duration();
    if (total <= 0) { toast('Ajoute d’abord un clip sur la timeline.'); return; }
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
      toast('Ce navigateur ne permet pas l’export vidéo. Utilise Chrome, Edge ou la version Electron.');
      return;
    }
    const canvas = $('#ed-canvas');
    ensureAudio();
    seek(0);
    drawFrame(0);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const mime = pickMime();
    let stream;
    try {
      const canvasStream = canvas.captureStream(S.project.fps);
      const tracks = canvasStream.getVideoTracks();
      if (S.streamDest) tracks.push(...S.streamDest.stream.getAudioTracks());
      stream = new MediaStream(tracks);
      const options = { videoBitsPerSecond: Math.min(20_000_000, Math.max(2_500_000, S.project.width * S.project.height * S.project.fps * 0.08)) };
      if (mime) options.mimeType = mime;
      const recorder = new MediaRecorder(stream, options);
      S.recorder = recorder;
      S.exportChunks = [];
      S.exportStream = stream;
      S.exporting = true;
      S.exportStarted = performance.now();
      S.exportStopRequested = false;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) S.exportChunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
        const blob = new Blob(S.exportChunks, { type });
        const extension = type.includes('mp4') ? 'mp4' : 'webm';
        const name = `${sanitizeFilename(S.project.name)}.${extension}`;
        downloadBlob(blob, name);
        const elapsed = ((performance.now() - S.exportStarted) / 1000).toFixed(1);
        cleanupExport();
        toast(`Export terminé : ${name} (${formatBytes(blob.size)}, ${elapsed} s).`);
      };
      recorder.onerror = (event) => {
        cleanupExport();
        toast(`Export interrompu : ${event.error?.message || 'erreur du navigateur'}`);
      };
      const overlay = $('#ed-export-overlay');
      overlay.hidden = false;
      updateExportProgress();
      recorder.start(750);
      play(true);
    } catch (error) {
      cleanupExport();
      toast(`Export impossible : ${error.message}`);
    }
  }

  function updateExportProgress() {
    const total = duration();
    const ratio = total > 0 ? Math.min(1, S.playhead / total) : 0;
    const text = $('#ed-export-text');
    const bar = $('#ed-export-bar');
    if (text) text.textContent = `${Math.round(ratio * 100)} % · ${M.timecode(S.playhead, S.project.fps)} / ${M.timecode(total, S.project.fps)}`;
    if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
  }

  function finishExport() {
    if (!S.recorder) return;
    S.exportStopRequested = true;
    try {
      if (S.recorder.state !== 'inactive') S.recorder.stop();
    } catch (error) {
      cleanupExport();
    }
  }

  function cleanupExport() {
    S.exporting = false;
    try {
      if (S.recorder && S.recorder.state !== 'inactive') S.recorder.stop();
    } catch (error) { /* ignore */ }
    S.recorder = null;
    S.exportChunks = [];
    if (S.exportStream) {
      for (const track of S.exportStream.getVideoTracks()) {
        try { track.stop(); } catch (error) { /* ignore */ }
      }
    }
    S.exportStream = null;
    const overlay = $('#ed-export-overlay');
    if (overlay) overlay.hidden = true;
  }

  function cancelExport() {
    if (!S.exporting) return;
    S.exportStopRequested = true;
    pause();
    // A cancelled recording is discarded instead of downloaded.
    const recorder = S.recorder;
    S.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch (error) { /* ignore */ }
    }
    cleanupExport();
    toast('Export annulé.');
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function exportProjectJSON() {
    const mediaMeta = Array.from(S.media.values()).map((entry) => ({
      id: entry.id, name: entry.name, kind: entry.kind, mime: entry.mime,
      size: entry.size, duration: entry.duration, width: entry.width, height: entry.height
    }));
    const payload = {
      app: 'REVELATION_STUDIO_EDITOR',
      schema: 1,
      exportedAt: new Date().toISOString(),
      project: S.project,
      media: mediaMeta
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${sanitizeFilename(S.project.name)}.montage.json`);
    toast('Projet exporté. Les médias restent dans ce navigateur : pour un autre poste, copie aussi les fichiers source.');
  }

  async function importProjectJSON(file) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const source = payload.project || payload;
      const project = M.normalizeProject(source);
      if (!window.confirm('Remplacer le montage actuel par ce projet ?')) return;
      S.project = project;
      S.project.updatedAt = Date.now();
      S.history.reset();
      S.selectedClipId = null;
      S.playhead = 0;
      S.missing.clear();
      for (const clip of S.project.clips) {
        const entry = S.media.get(clip.mediaId);
        if (!entry) {
          const match = Array.from(S.media.values()).find((item) => item.name === clip.mediaName);
          if (match) {
            clip.mediaId = match.id;
            if (match.duration > 0) clip.mediaDuration = match.duration;
          } else {
            S.missing.add(clip.mediaId || clip.mediaName);
          }
        }
      }
      await saveProject(false);
      renderAll();
      toast(`Projet « ${project.name} » chargé${S.missing.size ? ` · ${S.missing.size} média(s) à réimporter` : ''}.`);
    } catch (error) {
      toast(`Projet illisible : ${error.message}`);
    }
  }

  /* -------------------------------------------------------------- operations */

  function commit(mutate) {
    if (!S.project) return false;
    const before = M.clone(S.project);
    try {
      mutate();
      S.project.updatedAt = Date.now();
      S.history.commit(before);
      debounceSave();
      return true;
    } catch (error) {
      toast(error.message);
      return false;
    }
  }

  function refreshAfterCommit(options) {
    const opts = options || {};
    if (opts.media) renderMedia();
    renderTimeline();
    renderInspector();
    renderTransport();
    drawFrame(S.playhead);
    updateUndoButtons();
  }

  function undo() {
    if (!S.project) return;
    const restored = S.history.undo(S.project);
    if (!restored) return;
    pause();
    S.project = restored;
    S.selectedClipId = null;
    S.playhead = Math.min(S.playhead, duration());
    debounceSave();
    refreshAfterCommit();
    toast('Annulé.');
  }

  function redo() {
    if (!S.project) return;
    const restored = S.history.redo(S.project);
    if (!restored) return;
    pause();
    S.project = restored;
    S.selectedClipId = null;
    S.playhead = Math.min(S.playhead, duration());
    debounceSave();
    refreshAfterCommit();
    toast('Rétabli.');
  }

  function defaultDuration(entry) {
    if (entry.kind === 'image') return 5;
    return M.fitDuration(S.project, entry.duration > 0 ? entry.duration : 5);
  }

  function addMediaAtPlayhead(mediaId) {
    const entry = S.media.get(mediaId);
    if (!entry) return;
    const wanted = defaultDuration(entry);
    const candidates = S.project.tracks.filter((track) => !track.locked && M.accepts(track, entry.kind));
    if (!candidates.length) { toast('Ajoute d’abord une piste compatible.'); return; }
    const ordered = entry.kind === 'audio' ? candidates : candidates.slice().reverse();
    let track = ordered.find((item) => M.canPlace(S.project, {
      trackId: item.id, start: S.playhead, duration: wanted, kind: entry.kind
    }).ok);
    let start = S.playhead;
    if (!track) {
      track = ordered[0];
      start = Math.max(0, ...S.project.clips.filter((clip) => clip.trackId === track.id).map((clip) => M.clipEnd(clip)));
    }
    const id = M.uid('clip');
    const added = commit(() => {
      M.addClip(S.project, {
        id,
        trackId: track.id,
        kind: entry.kind,
        mediaId: entry.id,
        mediaName: entry.name,
        name: entry.name,
        start,
        duration: wanted,
        in: 0,
        mediaDuration: entry.kind === 'image' ? M.MAX_IMAGE_DURATION : entry.duration
      });
    });
    if (added) {
      S.selectedClipId = id;
      S.playhead = start;
      refreshAfterCommit();
      seek(start);
    }
  }

  function addMediaAt(mediaId, trackId, time) {
    const entry = S.media.get(mediaId);
    const track = M.getTrack(S.project, trackId);
    if (!entry || !track) return false;
    if (track.locked) { toast('Cette piste est verrouillée.'); return false; }
    if (!M.accepts(track, entry.kind)) { toast('Ce média ne va pas sur cette piste.'); return false; }
    const wanted = defaultDuration(entry);
    let start = Math.max(0, M.quantize(S.project, time));
    if (S.snap) {
      const snapped = M.snapTime(S.project, start, { threshold: 8 / S.scale, playhead: S.playhead });
      start = snapped.time;
    }
    const id = M.uid('clip');
    const added = commit(() => {
      M.addClip(S.project, {
        id,
        trackId,
        kind: entry.kind,
        mediaId: entry.id,
        mediaName: entry.name,
        name: entry.name,
        start,
        duration: wanted,
        in: 0,
        mediaDuration: entry.kind === 'image' ? M.MAX_IMAGE_DURATION : entry.duration
      });
    });
    if (added) {
      S.selectedClipId = id;
      refreshAfterCommit();
    }
    return added;
  }

  function splitAtPlayhead() {
    if (!S.project) return;
    const clip = S.selectedClipId ? M.getClip(S.project, S.selectedClipId) : null;
    const candidates = clip
      ? [clip]
      : S.project.clips.filter((item) => S.playhead > item.start + M.EPS && S.playhead < M.clipEnd(item) - M.EPS);
    if (!candidates.length) { toast('Place le playhead sur un clip.'); return; }
    let result = null;
    const ok = commit(() => {
      const created = [];
      for (const item of candidates) {
        try { created.push(M.splitClip(S.project, item.id, S.playhead)); } catch (error) { /* skip */ }
      }
      if (!created.length) throw new Error('La coupe est trop proche du bord du clip.');
      result = created;
    });
    if (ok) {
      if (clip && result) S.selectedClipId = result[0].left.id;
      refreshAfterCommit();
      toast(`${result.length} clip(s) coupé(s).`);
    }
  }

  function deleteSelected(ripple) {
    if (!S.selectedClipId) { toast('Sélectionne un clip.'); return; }
    const id = S.selectedClipId;
    const ok = commit(() => {
      M.removeClip(S.project, id, { ripple: Boolean(ripple) });
    });
    if (ok) {
      disposeClipNode(id);
      S.selectedClipId = null;
      refreshAfterCommit();
    }
  }

  function duplicateSelected() {
    if (!S.selectedClipId) return;
    let copyId = null;
    const ok = commit(() => {
      const copy = M.duplicateClip(S.project, S.selectedClipId);
      copyId = copy.id;
    });
    if (ok) {
      S.selectedClipId = copyId;
      refreshAfterCommit();
    }
  }

  function updateSelected(patch) {
    if (!S.selectedClipId) return;
    const ok = commit(() => M.updateClip(S.project, S.selectedClipId, patch));
    if (ok) refreshAfterCommit();
  }

  function zoomBy(factor) {
    zoomTo(S.scale * factor);
  }

  function zoomTo(value) {
    const old = S.scale;
    S.scale = M.clamp(Number(value) || 80, 8, 500);
    if (old === S.scale) return;
    renderTimeline();
    const scroll = $('#ed-timeline-scroll');
    if (scroll) {
      scroll.scrollLeft = Math.max(0, LABEL_W + S.playhead * S.scale - scroll.clientWidth / 2);
    }
  }

  function fitTimeline() {
    const total = Math.max(M.projectDuration(S.project), 20);
    const scroll = $('#ed-timeline-scroll');
    const viewport = Math.max(420, (scroll ? scroll.clientWidth : 900) - LABEL_W - 48);
    zoomTo(viewport / total);
    if (scroll) scroll.scrollLeft = 0;
  }

  function addTrack(kind) {
    const ok = commit(() => M.addTrack(S.project, kind));
    if (ok) { refreshAfterCommit(); toast(`Piste ${kind === 'audio' ? 'audio' : 'vidéo'} ajoutée.`); }
  }

  function toggleTrack(trackId, field) {
    const track = M.getTrack(S.project, trackId);
    if (!track) return;
    const ok = commit(() => M.updateTrack(S.project, trackId, { [field]: !track[field] }));
    if (ok) { refreshAfterCommit(); syncAt(S.playhead, false); }
  }

  function removeTrack(trackId) {
    const track = M.getTrack(S.project, trackId);
    if (!track) return;
    const clips = S.project.clips.filter((clip) => clip.trackId === trackId);
    if (clips.length && !window.confirm(`Supprimer la piste ${track.name} et ses ${clips.length} clip(s) ?`)) return;
    if (S.project.tracks.length <= 1) { toast('Le montage doit garder au moins une piste.'); return; }
    const ok = commit(() => M.removeTrack(S.project, trackId));
    if (ok) {
      for (const clip of clips) disposeClipNode(clip.id);
      if (S.selectedClipId && !M.getClip(S.project, S.selectedClipId)) S.selectedClipId = null;
      refreshAfterCommit();
    }
  }

  /* ------------------------------------------------------------ interactions */

  function pointerTime(event, lane) {
    const rect = lane.getBoundingClientRect();
    return M.clamp((event.clientX - rect.left) / S.scale, 0, Number.MAX_SAFE_INTEGER);
  }

  function bindTimelinePointer() {
    const ruler = $('#ed-ruler-lane');
    if (ruler) {
      ruler.onpointerdown = (event) => {
        event.preventDefault();
        const move = (moveEvent) => seek(pointerTime(moveEvent, ruler));
        move(event);
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
    }

    $$('.ed-lane').forEach((lane) => {
      lane.onpointerdown = (event) => {
        if (event.target.closest('.ed-clip')) return;
        event.preventDefault();
        S.selectedClipId = null;
        const move = (moveEvent) => seek(pointerTime(moveEvent, lane));
        move(event);
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        renderInspector();
        renderTimeline();
      };
    });

    $$('.ed-clip').forEach((element) => {
      const clip = M.getClip(S.project, element.dataset.clipId);
      if (!clip) return;
      element.onclick = (event) => {
        event.stopPropagation();
        S.selectedClipId = clip.id;
        renderTimeline();
        renderInspector();
      };
      element.onpointerdown = (event) => {
        if (event.button !== 0) return;
        const handle = event.target.closest('[data-trim]');
        event.stopPropagation();
        S.selectedClipId = clip.id;
        renderInspector();
        $$('.ed-clip').forEach((item) => item.classList.toggle('selected', item === element));
        if (handle) startTrim(event, clip, handle.dataset.trim);
        else startClipDrag(event, clip);
      };
    });
  }

  function startClipDrag(event, clip) {
    if (M.getTrack(S.project, clip.trackId)?.locked) { toast('Piste verrouillée.'); return; }
    const element = document.querySelector(`.ed-clip[data-clip-id="${CSS.escape(clip.id)}"]`);
    if (!element) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originStart = clip.start;
    const originTrack = clip.trackId;
    let targetTrack = originTrack;
    let previewStart = originStart;
    let moved = false;
    element.classList.add('dragging');

    const move = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) / S.scale;
      let next = Math.max(0, originStart + delta);
      if (S.snap) {
        next = M.snapTime(S.project, next, { threshold: 8 / S.scale, excludeId: clip.id, playhead: S.playhead }).time;
      }
      previewStart = M.quantize(S.project, Math.max(0, next));
      element.style.left = `${previewStart * S.scale}px`;
      const rows = $$('.ed-row');
      const row = rows.find((item) => {
        const rect = item.getBoundingClientRect();
        return moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom;
      });
      if (row) {
        const track = M.getTrack(S.project, row.dataset.trackId);
        if (track && !track.locked && M.accepts(track, clip.kind)) {
          targetTrack = track.id;
          rows.forEach((item) => item.classList.toggle('drop-target', item === row));
        }
      }
      if (Math.abs(moveEvent.clientX - startX) > 2 || Math.abs(moveEvent.clientY - startY) > 2) moved = true;
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.classList.remove('dragging');
      $$('.ed-row').forEach((item) => item.classList.remove('drop-target'));
      if (!moved) return;
      if (targetTrack === originTrack && previewStart === originStart) { renderTimeline(); return; }
      const ok = commit(() => M.moveClip(S.project, clip.id, { trackId: targetTrack, start: previewStart }));
      if (ok) {
        refreshAfterCommit();
      } else {
        renderTimeline();
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startTrim(event, clip, edge) {
    const element = document.querySelector(`.ed-clip[data-clip-id="${CSS.escape(clip.id)}"]`);
    if (!element) return;
    const startX = event.clientX;
    const bounds = M.trimBounds(S.project, clip, edge);
    const originStart = clip.start;
    const originEnd = M.clipEnd(clip);
    let target = edge === 'left' ? originStart : originEnd;
    element.classList.add('trimming');

    const move = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) / S.scale;
      const raw = edge === 'left' ? originStart + delta : originEnd + delta;
      let snapped = raw;
      if (S.snap) {
        snapped = M.snapTime(S.project, raw, { threshold: 8 / S.scale, excludeId: clip.id, playhead: S.playhead }).time;
      }
      target = M.clamp(M.quantize(S.project, snapped), bounds.min, bounds.max);
      if (edge === 'left') {
        const width = Math.max(2, (originEnd - target) * S.scale);
        element.style.left = `${target * S.scale}px`;
        element.style.width = `${width}px`;
      } else {
        const width = Math.max(2, (target - originStart) * S.scale);
        element.style.width = `${width}px`;
      }
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      element.classList.remove('trimming');
      const changed = Math.abs(target - (edge === 'left' ? originStart : originEnd)) > M.EPS;
      if (!changed) { renderTimeline(); return; }
      const ok = commit(() => M.trimClipTo(S.project, clip.id, edge, target));
      if (ok) refreshAfterCommit();
      else renderTimeline();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function bindTrackButtons() {
    $$('[data-track-mute]').forEach((button) => {
      button.onclick = (event) => { event.stopPropagation(); toggleTrack(button.dataset.trackMute, 'muted'); };
    });
    $$('[data-track-lock]').forEach((button) => {
      button.onclick = (event) => { event.stopPropagation(); toggleTrack(button.dataset.trackLock, 'locked'); };
    });
    $$('[data-track-del]').forEach((button) => {
      button.onclick = (event) => { event.stopPropagation(); removeTrack(button.dataset.trackDel); };
    });
  }

  function bindLaneDrop() {
    $$('.ed-lane').forEach((lane) => {
      lane.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        lane.classList.add('drag-over');
      });
      lane.addEventListener('dragleave', () => lane.classList.remove('drag-over'));
      lane.addEventListener('drop', (event) => {
        event.preventDefault();
        lane.classList.remove('drag-over');
        const mediaId = event.dataTransfer.getData('application/x-revelation-media') || event.dataTransfer.getData('text/plain');
        if (!mediaId) return;
        const time = pointerTime(event, lane);
        addMediaAt(mediaId, lane.dataset.trackId, time);
      });
    });
  }

  function bindInspectorProject() {
    const name = $('#ed-insp-name');
    if (name) {
      name.onchange = () => {
        commit(() => { S.project.name = name.value.trim().slice(0, 90) || 'Montage sans titre'; });
        refreshAfterCommit();
        const top = $('#ed-project-name');
        if (top) top.value = S.project.name;
      };
    }
    const format = $('#ed-insp-format');
    if (format) {
      format.onchange = () => {
        const [width, height] = format.value.split('x').map(Number);
        commit(() => { S.project.width = width; S.project.height = height; });
        refreshAfterCommit();
      };
    }
    const fps = $('#ed-insp-fps');
    if (fps) {
      fps.onchange = () => {
        if (S.project.clips.length && !window.confirm('Changer la cadence ne déplace pas les clips existants. Continuer ?')) {
          fps.value = String(S.project.fps);
          return;
        }
        for (const clip of S.project.clips) disposeClipNode(clip.id);
        commit(() => { S.project.fps = Number(fps.value); });
        refreshAfterCommit();
      };
    }
  }

  function bindInspectorClip(clip) {
    $('#ed-insp-close').onclick = () => { S.selectedClipId = null; renderTimeline(); renderInspector(); };
    $('#ed-clip-name').onchange = (event) => updateSelected({ name: event.target.value });
    $('#ed-clip-track').onchange = (event) => updateSelected({ trackId: event.target.value });
    $('#ed-clip-start').onchange = (event) => updateSelected({ start: Number(event.target.value) });
    $('#ed-clip-duration').onchange = (event) => updateSelected({ duration: Number(event.target.value) });
    $('#ed-clip-in').onchange = (event) => updateSelected({ in: Number(event.target.value) });
    const fadeIn = $('#ed-clip-fadein');
    if (fadeIn) fadeIn.onchange = (event) => updateSelected({ fadeIn: Number(event.target.value) });
    const fadeOut = $('#ed-clip-fadeout');
    if (fadeOut) fadeOut.onchange = (event) => updateSelected({ fadeOut: Number(event.target.value) });
    const opacity = $('#ed-clip-opacity');
    if (opacity) opacity.onchange = (event) => updateSelected({ opacity: Number(event.target.value) });
    const volume = $('#ed-clip-volume');
    if (volume) volume.onchange = (event) => updateSelected({ volume: Number(event.target.value) });
    const muted = $('#ed-clip-muted');
    if (muted) muted.onchange = (event) => updateSelected({ muted: event.target.checked });
    bindTransform(clip);
    bindGrade(clip);
    $('#ed-clip-split').onclick = splitAtPlayhead;
    $('#ed-clip-duplicate').onclick = duplicateSelected;
    $('#ed-clip-delete').onclick = () => deleteSelected(false);
    $('#ed-clip-ripple').onclick = () => deleteSelected(true);
  }

  function bindTransform(clip) {
    const names = ['x', 'y', 'scale', 'rotation'];
    const inputs = names.map((name) => $(`#ed-tr-${name}`)).filter(Boolean);
    if (!inputs.length) return;
    const read = () => {
      const next = M.clone(clip.transform || M.DEFAULT_TRANSFORM);
      for (const input of inputs) next[input.id.replace('ed-tr-', '')] = Number(input.value);
      return next;
    };
    let pending = null;
    for (const input of inputs) {
      input.oninput = () => {
        if (!pending) pending = M.clone(clip.transform || M.DEFAULT_TRANSFORM);
        const live = M.getClip(S.project, clip.id);
        if (live) live.transform = M.normalizeTransform(read());
        drawFrame(S.playhead);
      };
      input.onchange = () => {
        const final = read();
        const before = pending || M.clone(clip.transform || M.DEFAULT_TRANSFORM);
        pending = null;
        const live = M.getClip(S.project, clip.id);
        if (live) live.transform = M.normalizeTransform(before);
        const ok = commit(() => M.updateClip(S.project, clip.id, { transform: final }));
        if (ok) refreshAfterCommit(); else drawFrame(S.playhead);
      };
    }
    const reset = $('#ed-transform-reset');
    if (reset) {
      reset.onclick = () => {
        const ok = commit(() => M.updateClip(S.project, clip.id, { transform: M.DEFAULT_TRANSFORM }));
        if (ok) refreshAfterCommit();
      };
    }
    const presets = {
      plein: { x: 0, y: 0, scale: 1, rotation: 0 },
      gauche: { x: -0.34, y: 0, scale: 1.12, rotation: 0 },
      droite: { x: 0.34, y: 0, scale: 1.12, rotation: 0 }
    };
    $$('#ed-props [data-tr-preset]').forEach((button) => {
      button.onclick = () => {
        const preset = presets[button.dataset.trPreset];
        if (!preset) return;
        const ok = commit(() => M.updateClip(S.project, clip.id, { transform: preset }));
        if (ok) refreshAfterCommit();
      };
    });
  }

  function bindGrade(clip) {
    const sliders = $$('#ed-props [data-grade]');
    if (!sliders.length) return;
    let pending = null;
    const read = () => Object.fromEntries(sliders.map((slider) => [slider.dataset.grade, Number(slider.value)]));
    const paint = () => {
      for (const slider of sliders) {
        const label = $(`#ed-grade-${slider.dataset.grade}-value`);
        if (label) label.textContent = `${Number(slider.value) > 0 ? '+' : ''}${slider.value}`;
      }
      drawFrame(S.playhead);
    };
    for (const slider of sliders) {
      slider.oninput = () => {
        if (!pending) pending = M.clone(clip.grade || {});
        clip.grade = read();
        paint();
      };
      slider.onchange = () => {
        const final = read();
        const before = pending || M.clone(clip.grade || {});
        pending = null;
        const live = M.getClip(S.project, clip.id);
        if (live) live.grade = M.clone(before);
        const ok = commit(() => M.updateClip(S.project, clip.id, { grade: final }));
        if (ok) refreshAfterCommit();
        else paint();
      };
    }
    const presets = {
      neutre: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 },
      ambre: { exposure: 4, contrast: 8, saturation: 6, temperature: 32 },
      acier: { exposure: 2, contrast: 10, saturation: -8, temperature: -30 },
      contraste: { exposure: 2, contrast: 30, saturation: 4, temperature: 0 }
    };
    $$('#ed-props [data-grade-preset]').forEach((button) => {
      button.onclick = () => {
        const preset = presets[button.dataset.gradePreset];
        if (!preset) return;
        const ok = commit(() => M.updateClip(S.project, clip.id, { grade: preset }));
        if (ok) refreshAfterCommit();
      };
    });
  }

  /* --------------------------------------------------------------- assistant */

  function assistantModule() {
    return window.StudioProjectAssistant || null;
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Rendu image impossible dans ce navigateur.'));
      }, type, 0.94);
    });
  }

  function assistantYield() {
    return new Promise((resolve) => setTimeout(resolve, 24));
  }

  function assistantOptions() {
    const voiceToggle = $('#ed-asst-voice-on');
    return {
      style: $('#ed-asst-style').value,
      duration: M.clamp(Number($('#ed-asst-duration').value) || 30, 12, 120),
      width: S.project.width,
      height: S.project.height,
      fps: S.project.fps,
      subject: $('#ed-asst-subject').value.trim(),
      signature: $('#ed-asst-signature').value.trim(),
      voice: $('#ed-asst-voice').value,
      rate: Number($('#ed-asst-rate').value) || 175,
      images: $('#ed-asst-images').checked,
      titles: $('#ed-asst-titles').checked,
      music: $('#ed-asst-music').checked,
      voiceOn: Boolean(voiceToggle && voiceToggle.checked && !voiceToggle.disabled)
    };
  }

  function updateAssistantSummary(options) {
    const summary = $('#ed-asst-summary');
    if (!summary) return;
    const parts = [];
    if (options.images) parts.push('6 plans');
    if (options.titles) parts.push('6 titres');
    if (options.music) parts.push('musique');
    if (options.voiceOn && ASST.voices && ASST.voices.available) parts.push('6 voix');
    summary.textContent = `${parts.length ? parts.join(' · ') : 'timeline vide'} · ${Math.round(options.duration)} s`;
  }

  function updateAssistantPreview() {
    const A = assistantModule();
    const canvas = $('#ed-asst-preview');
    if (!A || !canvas || !S.project) return;
    const options = assistantOptions();
    const ctx = canvas.getContext('2d');
    A.renderShot(ctx, {
      style: options.style, index: 0, seedText: options.subject,
      subject: options.subject, seed: A.hashString(`${options.subject}|preview`)
    });
    const overlay = document.createElement('canvas');
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    A.renderOverlay(overlay.getContext('2d'), {
      style: options.style, subject: options.subject, signature: options.signature,
      shot: { index: 0, number: 1, title: 'UNE IDÉE', subtitle: 'Tout commence par une idée.' },
      total: 6
    });
    ctx.drawImage(overlay, 0, 0);
    updateAssistantSummary(options);
  }

  function scheduleAssistantPreview() {
    clearTimeout(ASST.previewTimer);
    ASST.previewTimer = setTimeout(updateAssistantPreview, 90);
  }

  async function refreshAssistantVoices() {
    const A = assistantModule();
    const select = $('#ed-asst-voice');
    const note = $('#ed-asst-voice-note');
    const toggle = $('#ed-asst-voice-on');
    if (!A || !select) return;
    if (!ASST.voices) {
      select.innerHTML = '<option value="">Détection…</option>';
      if (note) note.textContent = 'Détection des voix système…';
      ASST.voices = await A.ttsStatus();
    }
    const status = ASST.voices;
    if (status.available && status.voices.length) {
      select.disabled = false;
      select.innerHTML = status.voices.map((voice) => `<option value="${esc(voice.id)}" ${voice.id === status.default ? 'selected' : ''}>${esc(voice.label || voice.name || voice.id)}</option>`).join('');
      if (toggle) { toggle.disabled = false; toggle.checked = true; }
      if (note) note.textContent = `Voix système ${status.backend || status.channel || ''} · ${status.voices.length} disponible(s). Synthèse sur ce poste, sans clé ni réseau.`;
    } else {
      select.disabled = true;
      select.innerHTML = '<option value="">Aucune voix système</option>';
      if (toggle) { toggle.disabled = true; toggle.checked = false; }
      if (note) note.textContent = status.reason || 'Voix indisponible dans cette édition. Les plans, titres et musique restent générés localement.';
    }
    updateAssistantPreview();
  }

  function assistantLog(message, detail) {
    const log = $('#ed-asst-log');
    if (!log) return;
    const row = document.createElement('div');
    row.innerHTML = `<span>${esc(message)}</span>${detail ? `<small>${esc(detail)}</small>` : ''}`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 40) log.removeChild(log.firstChild);
  }

  function setAssistantBusy(busy) {
    ASST.busy = busy;
    const generate = $('#ed-asst-generate');
    const close = $('#ed-asst-close');
    const cancel = $('#ed-asst-cancel');
    if (generate) {
      generate.disabled = busy;
      generate.textContent = busy ? 'Génération…' : 'Générer le projet';
    }
    if (close) close.disabled = busy;
    if (cancel) cancel.disabled = busy;
  }

  function openAssistant() {
    if (!assistantModule()) { toast('Assistant projet indisponible : recharge la page.'); return; }
    if (!S.project) return;
    if (S.playing) pause();
    const overlay = $('#ed-assistant-overlay');
    if (!overlay) return;
    overlay.hidden = false;
    const subject = $('#ed-asst-subject');
    if (subject) {
      const clean = (value) => String(value || '').replace(/\s*·\s*\d+(?:[.,]\d+)?\s*s$/i, '').trim();
      const current = clean(subject.value);
      subject.value = current && subject.value !== 'Révélation Studio' ? current : clean(S.project.name) || 'Révélation Studio';
    }
    const log = $('#ed-asst-log');
    if (log) log.innerHTML = '<div><span>Prêt.</span><small>Le montage actuel sera enregistré puis remplacé.</small></div>';
    updateAssistantPreview();
    refreshAssistantVoices().catch((error) => assistantLog('Voix indisponible', error.message));
    if (subject) subject.focus();
  }

  function closeAssistant() {
    if (ASST.busy) return;
    const overlay = $('#ed-assistant-overlay');
    if (overlay) overlay.hidden = true;
  }

  function bindAssistant() {
    const overlay = $('#ed-assistant-overlay');
    if (!overlay) return;
    $('#ed-asst-close').onclick = closeAssistant;
    $('#ed-asst-cancel').onclick = closeAssistant;
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeAssistant(); });
    $('#ed-asst-generate').onclick = generateAssistantProject;
    for (const selector of ['#ed-asst-style', '#ed-asst-duration', '#ed-asst-subject', '#ed-asst-signature']) {
      const node = $(selector);
      if (node) {
        node.addEventListener('input', scheduleAssistantPreview);
        node.addEventListener('change', scheduleAssistantPreview);
      }
    }
    for (const selector of ['#ed-asst-images', '#ed-asst-titles', '#ed-asst-music', '#ed-asst-voice-on']) {
      const node = $(selector);
      if (node) node.addEventListener('change', updateAssistantPreview);
    }
    const rate = $('#ed-asst-rate');
    if (rate) {
      rate.addEventListener('input', () => {
        const label = $('#ed-asst-rate-value');
        if (label) label.textContent = rate.value;
      });
    }
    updateAssistantPreview();
  }

  async function generateAssistantProject() {
    if (ASST.busy) return;
    const A = assistantModule();
    if (!A) { toast('Module assistant introuvable.'); return; }
    const options = assistantOptions();
    if (!options.images && !options.titles) { toast('Active au moins les plans ou les titres.'); return; }
    if (S.project.clips.length && !window.confirm('Le montage actuel sera enregistré dans le stockage local puis remplacé par le film généré. Continuer ?')) return;
    setAssistantBusy(true);
    const started = performance.now();
    try {
      if (S.playing) pause();
      assistantLog('Enregistrement du montage actuel');
      await saveProject(false);
      const plan = A.buildPlan(options);
      const token = Date.now().toString(36).slice(-5).toUpperCase();
      const prefix = `${plan.filePrefix}-${token}`;
      assistantLog('Plan de montage', `${plan.shots.length} plans · ${M.timecode(plan.duration, plan.fps)} · ${plan.width}×${plan.height} · ${plan.styleLabel}`);
      const files = [];
      const images = [];
      const overlays = [];
      if (options.images) {
        for (const shot of plan.shots) {
          assistantLog(`Rendu du plan ${shot.number}/${plan.shots.length}`, `${shot.title} · motif ${shot.motif}`);
          const canvas = document.createElement('canvas');
          canvas.width = plan.width;
          canvas.height = plan.height;
          A.renderShot(canvas.getContext('2d'), {
            style: plan.style, index: shot.index, seedText: plan.subject,
            subject: plan.subject, seed: plan.seed
          });
          const blob = await canvasToBlob(canvas, 'image/png');
          const name = `${prefix}-PLAN-${String(shot.number).padStart(2, '0')}.png`;
          files.push(new File([blob], name, { type: 'image/png' }));
          images.push({ shot, name });
          await assistantYield();
        }
      }
      if (options.titles) {
        for (const shot of plan.shots) {
          assistantLog(`Titre ${shot.number}/${plan.shots.length}`, shot.title);
          const canvas = document.createElement('canvas');
          canvas.width = plan.width;
          canvas.height = plan.height;
          A.renderOverlay(canvas.getContext('2d'), {
            style: plan.style, subject: plan.subject, signature: plan.signature,
            shot, total: plan.shots.length
          });
          const blob = await canvasToBlob(canvas, 'image/png');
          const name = `${prefix}-TITRE-${String(shot.number).padStart(2, '0')}.png`;
          files.push(new File([blob], name, { type: 'image/png' }));
          overlays.push({ shot, name });
          await assistantYield();
        }
      }
      let music = null;
      if (options.music) {
        assistantLog('Composition de la musique', `${plan.duration.toFixed(1)} s · 48 kHz · stéréo`);
        await assistantYield();
        const cue = A.renderMusic({ duration: plan.duration, sampleRate: 48000, style: plan.style, seedText: plan.subject });
        const wav = A.encodeWav(cue);
        const name = `${prefix}-MUSIQUE.wav`;
        files.push(new File([wav], name, { type: 'audio/wav' }));
        music = { name };
        assistantLog('Musique prête', `${formatBytes(wav.length)} · composition originale`);
        await assistantYield();
      }
      const voices = [];
      let voiceOn = options.voiceOn;
      if (voiceOn) {
        if (!ASST.voices) ASST.voices = await A.ttsStatus();
        voiceOn = Boolean(ASST.voices.available && options.voice);
        if (!voiceOn) assistantLog('Voix ignorée', ASST.voices.reason || 'Aucune voix système disponible.');
      }
      if (voiceOn) {
        for (const line of plan.voices) {
          assistantLog(`Voix ${line.shotId.slice(-2)}`, line.text);
          try {
            const result = await A.ttsRender({ text: line.text, voice: options.voice, rate: options.rate });
            const name = `${prefix}-VOIX-${line.shotId.slice(-2)}.wav`;
            files.push(new File([result.bytes], name, { type: result.mime || 'audio/wav' }));
            voices.push({ line, name });
            await assistantYield();
          } catch (error) {
            assistantLog('Voix interrompue', `${error.message} Le film continuera sans voix.`);
            for (let index = files.length - 1; index >= 0; index -= 1) {
              if (files[index].name.includes('-VOIX-')) files.splice(index, 1);
            }
            voices.length = 0;
            voiceOn = false;
            break;
          }
        }
      }
      assistantLog('Import des médias', `${files.length} fichiers dans le coffre local`);
      const entries = await importFiles(files);
      if (!entries || entries.length !== files.length) {
        throw new Error(`Import incomplet : ${entries ? entries.length : 0} fichier(s) sur ${files.length}. Le montage actuel est conservé.`);
      }
      const byName = new Map(entries.map((entry) => [entry.name, entry]));
      assistantLog('Assemblage de la timeline', 'images V1 · titres V2 · musique A1 · voix A2');
      const next = M.createProject({ name: plan.defaultName, width: plan.width, height: plan.height, fps: plan.fps });
      const add = (input) => M.addClip(next, { id: M.uid('clip'), ...input });
      for (const item of images) {
        const entry = byName.get(item.name);
        if (!entry) throw new Error(`Média manquant : ${item.name}`);
        add({
          trackId: 'V1', kind: 'image', mediaId: entry.id, mediaName: entry.name,
          name: `${item.shot.number} · ${item.shot.title}`,
          start: item.shot.start, duration: item.shot.duration, in: 0,
          mediaDuration: M.MAX_IMAGE_DURATION, fadeIn: 0.32, fadeOut: 0.32
        });
      }
      for (const item of overlays) {
        const entry = byName.get(item.name);
        if (!entry) throw new Error(`Média manquant : ${item.name}`);
        add({
          trackId: 'V2', kind: 'image', mediaId: entry.id, mediaName: entry.name,
          name: `Titre · ${item.shot.title}`,
          start: item.shot.start, duration: item.shot.duration, in: 0,
          mediaDuration: M.MAX_IMAGE_DURATION, fadeIn: 0.55, fadeOut: 0.55
        });
      }
      if (music) {
        const entry = byName.get(music.name);
        if (!entry) throw new Error(`Média manquant : ${music.name}`);
        const clipDuration = M.fitDuration(next, Math.min(plan.duration, entry.duration));
        add({
          trackId: 'A1', kind: 'audio', mediaId: entry.id, mediaName: entry.name,
          name: 'Musique originale', start: 0, duration: clipDuration, in: 0,
          mediaDuration: entry.duration, volume: 0.36, fadeIn: 1.2,
          fadeOut: Math.min(3, clipDuration / 3)
        });
      }
      for (const item of voices) {
        const entry = byName.get(item.name);
        if (!entry) throw new Error(`Média manquant : ${item.name}`);
        const room = Math.max(0, item.line.duration - 0.3);
        const clipDuration = M.fitDuration(next, Math.min(entry.duration, room));
        if (clipDuration <= M.minDuration(next)) {
          assistantLog('Voix trop courte', item.line.text);
          continue;
        }
        if (entry.duration > room + 0.08) assistantLog('Voix rognée', `${entry.duration.toFixed(2)} s pour ${room.toFixed(2)} s`);
        add({
          trackId: 'A2', kind: 'audio', mediaId: entry.id, mediaName: entry.name,
          name: `Voix · ${item.line.shotId.slice(-2)}`,
          start: item.line.start + 0.15, duration: clipDuration, in: 0,
          mediaDuration: entry.duration, volume: 0.95, fadeIn: 0.08, fadeOut: 0.18
        });
      }
      if (!next.clips.length) throw new Error('Aucun clip n’a pu être assemblé.');
      pause();
      S.project = next;
      S.selectedClipId = null;
      S.playhead = 0;
      S.history.reset();
      await saveProject(false);
      renderAll();
      fitTimeline();
      seek(0);
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);
      assistantLog('Film assemblé', `${next.clips.length} clips · ${M.timecode(M.projectDuration(next), next.fps)} · ${elapsed} s`);
      toast(`Projet généré : ${next.clips.length} clips sur la timeline. Espace pour visionner, puis Exporter la vidéo.`);
      setAssistantBusy(false);
      setTimeout(() => { if (!ASST.busy) closeAssistant(); }, 850);
      return next;
    } catch (error) {
      assistantLog('Génération interrompue', error.message);
      toast(`Assistant projet : ${error.message}`);
      setAssistantBusy(false);
      return null;
    }
  }

  function bindTopbar() {
    $$('[data-ed]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.ed;
        if (action === 'undo') undo();
        else if (action === 'redo') redo();
        else if (action === 'save') saveProject(true).catch((error) => toast(error.message));
        else if (action === 'open-project') $('#ed-project-file').click();
        else if (action === 'export-project') exportProjectJSON();
        else if (action === 'assistant') openAssistant();
        else if (action === 'export') exportVideo();
        else if (action === 'add-video') addTrack('video');
        else if (action === 'add-audio') addTrack('audio');
        else if (action === 'zoom-in') zoomBy(1.35);
        else if (action === 'zoom-out') zoomBy(1 / 1.35);
        else if (action === 'fit') fitTimeline();
      };
    });
    const name = $('#ed-project-name');
    name.onchange = () => {
      commit(() => { S.project.name = name.value.trim().slice(0, 90) || 'Montage sans titre'; });
      setSaveState('Nom modifié', 'dirty');
    };
    const fileInput = $('#ed-files');
    const pick = () => fileInput.click();
    $('#ed-import-media').onclick = pick;
    $('#ed-import-media-2').onclick = pick;
    fileInput.onchange = async () => {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      await importFiles(files);
    };
    const projectInput = $('#ed-project-file');
    projectInput.onchange = async () => {
      const file = projectInput.files[0];
      projectInput.value = '';
      if (file) await importProjectJSON(file);
    };
    $('#ed-play').onclick = () => { if (S.playing) pause(); else play(); };
    $('#ed-split-btn').onclick = splitAtPlayhead;
    $('#ed-delete-btn').onclick = () => deleteSelected(false);
    const search = $('#ed-media-search');
    if (search) {
      search.value = S.filter;
      search.oninput = () => { S.filter = search.value; renderMedia(); };
    }
    const scopes = $('#ed-scopes-toggle');
    if (scopes) {
      scopes.classList.toggle('ed-active', S.scopesOpen);
      scopes.onclick = toggleScopes;
    }
    const snap = $('#ed-snap');
    snap.checked = S.snap;
    snap.onchange = () => { S.snap = snap.checked; };
    const scrub = $('#ed-scrub');
    scrub.oninput = () => {
      if (S.playing) pause();
      seek(Number(scrub.value));
    };
    $('#ed-export-cancel').onclick = cancelExport;

    const scroll = $('#ed-timeline-scroll');
    scroll.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
      }
    }, { passive: false });
    $('#ed-canvas').addEventListener('click', () => { if (S.playing) pause(); else play(); });
    const canvas = $('#ed-canvas');
    const setSize = () => {
      const wrap = $('#ed-canvas-wrap');
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = S.project.width / S.project.height;
      let width = rect.width;
      let height = width / ratio;
      if (height > rect.height) { height = rect.height; width = height * ratio; }
      canvas.style.width = `${Math.max(1, width)}px`;
      canvas.style.height = `${Math.max(1, height)}px`;
    };
    setSize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(setSize);
      observer.observe($('#ed-canvas-wrap'));
      S.resizeObserver = observer;
    }
  }

  function bindKeyboard() {
    S.keyHandler = (event) => {
      if (!S.mounted) return;
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
      if (tag === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (mod && key === 'y') { event.preventDefault(); redo(); return; }
      if (key === ' ') { event.preventDefault(); if (S.playing) pause(); else play(); return; }
      if (mod || event.altKey) return;
      if (key === 's') { event.preventDefault(); splitAtPlayhead(); return; }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        deleteSelected(event.shiftKey);
        return;
      }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(event.shiftKey ? -S.project.fps : -1); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(event.shiftKey ? S.project.fps : 1); return; }
      if (event.key === 'Home') { event.preventDefault(); seek(0); return; }
      if (event.key === 'End') { event.preventDefault(); seek(duration()); return; }
      if (key === '+' || key === '=') { event.preventDefault(); zoomBy(1.25); return; }
      if (key === '-') { event.preventDefault(); zoomBy(1 / 1.25); return; }
      if (key === 'f') { event.preventDefault(); fitTimeline(); }
    };
    window.addEventListener('keydown', S.keyHandler);
  }

  function unbindKeyboard() {
    if (S.keyHandler) window.removeEventListener('keydown', S.keyHandler);
    S.keyHandler = null;
  }

  /* ------------------------------------------------------------------ mount */

  async function mount(container) {
    if (!container) return;
    if (S.mounted && S.container === container) return;
    if (S.mounted) await unmount();
    const token = ++S.mountToken;
    S.container = container;
    S.mounted = true;
    try {
      S.db = await openDB();
      await loadProject();
      if (token !== S.mountToken) return;
      await loadMediaLibrary();
      if (token !== S.mountToken) return;
      container.innerHTML = template();
      bindTopbar();
      bindAssistant();
      bindKeyboard();
      renderAll();
      if (!S.project.clips.length) {
        $('#ed-canvas-empty').hidden = false;
      }
      fitTimeline();
    } catch (error) {
      console.error(error);
      container.innerHTML = `<div class="ed-shell"><div class="ed-fatal"><h2>Montage indisponible</h2><p>${esc(error.message)}</p><button class="ed-btn" onclick="location.reload()">Recharger le Studio</button></div></div>`;
    }
  }

  async function unmount() {
    if (!S.mounted) return;
    const project = S.project;
    S.mounted = false;
    S.mountToken += 1;
    S.playing = false;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    unbindKeyboard();
    if (project && S.db) {
      try { await saveProject(false); } catch (error) { /* already reported */ }
    }
    for (const clipId of Array.from(S.nodes.keys())) disposeClipNode(clipId);
    for (const entry of S.media.values()) if (entry.url) URL.revokeObjectURL(entry.url);
    S.media.clear();
    S.nodes.clear();
    if (S.audioCtx) {
      try { await S.audioCtx.close(); } catch (error) { /* ignore */ }
    }
    S.audioCtx = null;
    S.master = null;
    S.streamDest = null;
    S.hidden = null;
    if (S.resizeObserver) { try { S.resizeObserver.disconnect(); } catch (error) { /* ignore */ } }
    S.resizeObserver = null;
    S.project = null;
    S.selectedClipId = null;
    S.playhead = 0;
    S.filter = '';
    S.scopesOpen = false;
    S.scopeLast = 0;
    S.scopeSource = null;
    S.scopePlots = {};
    S.history.reset();
    S.container = null;
    S.dirty = false;
    ASST.busy = false;
    clearTimeout(S.saveTimer);
    clearTimeout(ASST.previewTimer);
  }

  window.StudioEditor = {
    mount,
    unmount,
    isMounted: () => S.mounted,
    newProject,
    commands: {
      undo,
      redo,
      splitAtPlayhead,
      duplicateSelected,
      deleteSelected,
      exportVideo,
      saveProject,
      openProjectPicker: () => { const input = $('#ed-project-file'); if (input) input.click(); },
      exportProjectJSON
    },
    _debug: { state: S, M, importFiles, assistant: { generate: generateAssistantProject, open: openAssistant, options: assistantOptions } }
  };
})();
