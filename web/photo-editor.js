/* Atelier photo à calques — canvas réel, calques, modes de fusion, historique. */
(function () {
  'use strict';

  const pageIndex = pages.findIndex((item) => item[0] === 'color');
  if (!pages.some((item) => item[0] === 'photo')) pages.splice(pageIndex < 0 ? pages.length : pageIndex, 0, ['photo', '◧', 'Atelier photo']);

  const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'color-dodge', 'soft-light', 'difference', 'hue', 'saturation', 'color', 'luminosity'];
  const FONTS = ['Georgia', 'Baskerville', 'Arial', 'Helvetica', 'Courier New', 'Impact'];
  const TOOLS = [
    ['move', 'V', 'Déplacer', '↖'],
    ['brush', 'B', 'Pinceau', '✎'],
    ['eraser', 'E', 'Gomme', '⌫'],
    ['rect', 'R', 'Rectangle', '▭'],
    ['ellipse', 'O', 'Ellipse', '◯'],
    ['text', 'T', 'Texte', 'T'],
    ['fill', 'G', 'Remplir', '▣'],
    ['picker', 'I', 'Pipette', '⌖']
  ];
  const LABELS = { move: 'Déplacer', brush: 'Pinceau', eraser: 'Gomme', rect: 'Rectangle', ellipse: 'Ellipse', text: 'Texte', fill: 'Remplissage', picker: 'Pipette' };

  const D = {
    width: 1920,
    height: 1080,
    layers: [],
    activeId: null,
    tool: 'brush',
    color: '#e2c07a',
    secondary: '#13161c',
    brushSize: 48,
    brushOpacity: 1,
    fontFamily: 'Georgia',
    fontSize: 110,
    zoom: 'fit',
    undo: [],
    redo: [],
    dirty: false,
    docName: 'Composition',
    pointer: null,
    drawing: false,
    stroke: null,
    shape: null,
    loaded: false,
    area: null,
    canvas: null,
    ctx: null,
    saveTimer: 0
  };

  let uidCounter = 0;
  function uid(prefix) { uidCounter += 1; return `${prefix || 'layer'}_${Date.now().toString(36)}_${uidCounter}`; }
  function clamp(value, low, high) { return Math.min(high, Math.max(low, Number(value) || 0)); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function blendValue(blend) { return blend === 'normal' ? 'source-over' : blend; }

  function makeLayer(name, options) {
    const canvas = document.createElement('canvas');
    canvas.width = D.width;
    canvas.height = D.height;
    const layer = {
      id: uid('layer'),
      name: name || 'Calque',
      canvas,
      ctx: canvas.getContext('2d'),
      visible: options && options.visible === false ? false : true,
      opacity: options && Number.isFinite(options.opacity) ? options.opacity : 1,
      blend: options && options.blend ? options.blend : 'normal',
      text: options && options.text ? options.text : null
    };
    return layer;
  }

  function fillLayer(layer, color) {
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = 'source-over';
    layer.ctx.fillStyle = color;
    layer.ctx.fillRect(0, 0, D.width, D.height);
    layer.ctx.restore();
  }

  function drawWelcome(layer) {
    const ctx = layer.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e2c07a';
    ctx.font = `600 ${Math.round(D.width * 0.065)}px Georgia, serif`;
    ctx.fillText('RÉVÉLATION', D.width / 2, D.height / 2 - D.height * 0.045);
    ctx.fillStyle = '#e8e6df';
    ctx.font = `${Math.round(D.width * 0.013)}px Arial, sans-serif`;
    ctx.fillText('STUDIO PHOTO · CALQUES · COMPOSITION', D.width / 2, D.height / 2 + D.height * 0.055);
    ctx.strokeStyle = '#8a713f';
    ctx.lineWidth = Math.max(1, D.width / 960);
    ctx.beginPath();
    ctx.moveTo(D.width / 2 - D.width * 0.07, D.height / 2 + D.height * 0.008);
    ctx.lineTo(D.width / 2 + D.width * 0.07, D.height / 2 + D.height * 0.008);
    ctx.stroke();
    ctx.restore();
  }

  function makeDefaultDocument(welcome) {
    D.layers = [];
    D.undo = [];
    D.redo = [];
    D.width = 1920;
    D.height = 1080;
    D.docName = welcome ? 'Composition de bienvenue' : 'Composition';
    const background = makeLayer('Fond');
    fillLayer(background, '#11151b');
    D.layers.push(background);
    const paint = makeLayer('Calque 1');
    D.layers.push(paint);
    if (welcome) {
      const text = makeLayer('Titre', { text: { value: 'RÉVÉLATION', x: D.width / 2, y: D.height / 2 - D.height * 0.045, size: Math.round(D.width * 0.065), family: 'Georgia', color: '#e2c07a' } });
      drawWelcome(text);
      D.layers.push(text);
    }
    D.activeId = (welcome ? D.layers[2] : paint).id;
    D.loaded = true;
    D.dirty = false;
  }

  function newDocument() {
    if (D.dirty && !window.confirm('Créer une nouvelle composition ? La composition actuelle sera remplacée (elle peut être enregistrée avant).')) return;
    makeDefaultDocument(false);
    renderAll(true);
    toast('Nouvelle composition 1920 × 1080 créée.');
  }

  function activeLayer() {
    return D.layers.find((layer) => layer.id === D.activeId) || D.layers[D.layers.length - 1] || null;
  }

  function layerIndex(id) {
    return D.layers.findIndex((layer) => layer.id === id);
  }

  function compose() {
    if (!D.canvas || !D.ctx) return;
    const ctx = D.ctx;
    ctx.save();
    ctx.clearRect(0, 0, D.width, D.height);
    for (const layer of D.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = blendValue(layer.blend);
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.restore();
  }

  function markDirty() {
    D.dirty = true;
    const slot = document.getElementById('ph-save-state');
    if (slot) { slot.textContent = 'Modifié'; slot.dataset.mode = 'dirty'; }
  }

  function markSaved(label) {
    D.dirty = false;
    const slot = document.getElementById('ph-save-state');
    if (slot) { slot.textContent = label || 'Enregistré'; slot.dataset.mode = 'saved'; }
  }

  function pushHistory(entry, label) {
    entry.label = label || entry.kind;
    D.undo.push(entry);
    if (D.undo.length > 10) D.undo.shift();
    D.redo = [];
    markDirty();
    renderHistory();
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(D.saveTimer);
    D.saveTimer = setTimeout(() => { if (D.dirty) saveDocument(true); }, 2500);
  }

  function renderHistory() {
    const slot = document.getElementById('ph-history');
    if (!slot) return;
    const rows = [];
    if (D.undo.length) {
      rows.push(`<div class="ph-history-row"><strong>${esc(D.undo[D.undo.length - 1].label)}</strong><span>dernière action</span></div>`);
      rows.push(`<div class="ph-history-row"><span>${D.undo.length} étape(s) annulable(s)</span><span>${D.redo.length} rétablie(s)</span></div>`);
    } else rows.push('<div class="ph-history-row"><span>Aucune action enregistrée</span></div>');
    slot.innerHTML = rows.join('');
  }

  function restoreBitmap(layer, image) {
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = 'source-over';
    layer.ctx.globalAlpha = 1;
    layer.ctx.putImageData(image, 0, 0);
    layer.ctx.restore();
  }

  function replayStroke(layer, entry) {
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = entry.opacity;
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = entry.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = entry.tool === 'eraser' ? 'destination-out' : 'source-over';
    for (const point of entry.points) {
      if (point.first) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + 0.01, point.y + 0.01);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(point.px, point.py);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function replayShape(layer, shape) {
    const ctx = layer.ctx;
    const { x0, y0, x1, y1, kind, color, fill } = shape;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, D.brushSize / 3);
    ctx.beginPath();
    if (kind === 'rect') {
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      ctx.ellipse(cx, cy, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    }
    if (fill) ctx.fill(); else ctx.stroke();
    ctx.restore();
  }

  function applyUndo(entry) {
    if (entry.kind === 'bitmap' || entry.kind === 'shape' || entry.kind === 'fill') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) restoreBitmap(layer, entry.before);
    } else if (entry.kind === 'move') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) {
        layer.ctx.clearRect(0, 0, D.width, D.height);
        layer.ctx.drawImage(entry.beforeCanvas, 0, 0);
      }
    } else if (entry.kind === 'text') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) {
        if (entry.beforeBitmap) restoreBitmap(layer, entry.beforeBitmap);
        layer.text = entry.before ? { ...entry.before } : null;
      }
    } else if (entry.kind === 'add') {
      const index = layerIndex(entry.layer.id);
      if (index >= 0) D.layers.splice(index, 1);
      if (D.activeId === entry.layer.id) D.activeId = D.layers[Math.max(0, index - 1)] ? D.layers[Math.max(0, index - 1)].id : null;
    } else if (entry.kind === 'remove') {
      D.layers.splice(Math.min(entry.index, D.layers.length), 0, entry.layer);
      D.activeId = entry.layer.id;
    } else if (entry.kind === 'order') {
      const index = layerIndex(entry.id);
      if (index >= 0) {
        const [layer] = D.layers.splice(index, 1);
        D.layers.splice(Math.min(entry.from, D.layers.length), 0, layer);
      }
    } else if (entry.kind === 'prop') {
      const layer = D.layers.find((item) => item.id === entry.id);
      if (layer) Object.assign(layer, entry.before);
    }
  }

  function applyRedo(entry) {
    if (entry.kind === 'bitmap') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) { restoreBitmap(layer, entry.before); replayStroke(layer, entry.stroke); }
    } else if (entry.kind === 'fill') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) {
        layer.ctx.save();
        layer.ctx.globalCompositeOperation = 'source-over';
        layer.ctx.fillStyle = entry.color;
        layer.ctx.fillRect(0, 0, D.width, D.height);
        layer.ctx.restore();
      }
    } else if (entry.kind === 'shape') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) { restoreBitmap(layer, entry.before); replayShape(layer, entry.shape); }
    } else if (entry.kind === 'move') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) {
        layer.ctx.clearRect(0, 0, D.width, D.height);
        layer.ctx.drawImage(entry.beforeCanvas, entry.dx, entry.dy);
      }
    } else if (entry.kind === 'text') {
      const layer = D.layers.find((item) => item.id === entry.layerId);
      if (layer) {
        if (entry.beforeBitmap) restoreBitmap(layer, entry.beforeBitmap);
        layer.text = { ...entry.after };
        drawTextContent(layer);
      }
    } else if (entry.kind === 'add') {
      D.layers.splice(Math.min(entry.index, D.layers.length), 0, entry.layer);
      D.activeId = entry.layer.id;
    } else if (entry.kind === 'remove') {
      const index = layerIndex(entry.layer.id);
      if (index >= 0) D.layers.splice(index, 1);
      if (D.activeId === entry.layer.id) D.activeId = D.layers[0] ? D.layers[0].id : null;
    } else if (entry.kind === 'order') {
      const index = layerIndex(entry.id);
      if (index >= 0) {
        const [layer] = D.layers.splice(index, 1);
        D.layers.splice(Math.min(entry.to, D.layers.length), 0, layer);
      }
    } else if (entry.kind === 'prop') {
      const layer = D.layers.find((item) => item.id === entry.id);
      if (layer) Object.assign(layer, entry.after);
    }
  }

  function undo() {
    const entry = D.undo.pop();
    if (!entry) { toast('Aucune action à annuler.'); return; }
    applyUndo(entry);
    D.redo.push(entry);
    markDirty();
    renderLayers();
    renderHistory();
    renderProperties();
    compose();
    scheduleSave();
  }

  function redo() {
    const entry = D.redo.pop();
    if (!entry) { toast('Aucune action à rétablir.'); return; }
    applyRedo(entry);
    D.undo.push(entry);
    markDirty();
    renderLayers();
    renderHistory();
    renderProperties();
    compose();
    scheduleSave();
  }

  /* ------------------------------------------------------------------ tools */
  function canvasPoint(event) {
    const canvas = D.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = D.width / rect.width;
    const scaleY = D.height / rect.height;
    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, D.width),
      y: clamp((event.clientY - rect.top) * scaleY, 0, D.height),
      pressure: event.pressure || 1
    };
  }

  function beginStroke(layer, point) {
    const entry = {
      kind: 'bitmap',
      layerId: layer.id,
      before: layer.ctx.getImageData(0, 0, D.width, D.height),
      stroke: { tool: D.tool, color: D.color, size: D.brushSize, opacity: D.brushOpacity, points: [{ x: point.x, y: point.y, first: true }] }
    };
    D.stroke = entry;
    replayStroke(layer, entry.stroke);
    compose();
  }

  function extendStroke(layer, point) {
    const entry = D.stroke;
    if (!entry) return;
    const points = entry.stroke.points;
    const last = points[points.length - 1];
    points.push({ x: point.x, y: point.y, px: last.x, py: last.y, first: false });
    replayStroke(layer, { tool: entry.stroke.tool, color: entry.stroke.color, size: entry.stroke.size, opacity: entry.stroke.opacity, points: points.slice(-2).length ? [points[points.length - 2], points[points.length - 1]].map((p) => ({ ...p, first: false })) : points });
    compose();
  }

  function endStroke() {
    if (D.stroke && D.stroke.kind === 'bitmap') {
      pushHistory(D.stroke, D.stroke.stroke.tool === 'eraser' ? 'Gomme' : 'Coup de pinceau');
      D.stroke = null;
    }
  }

  function beginShape(layer, point) {
    D.shape = {
      layerId: layer.id,
      before: layer.ctx.getImageData(0, 0, D.width, D.height),
      shape: { kind: D.tool, x0: point.x, y0: point.y, x1: point.x, y1: point.y, color: D.color, fill: D.tool === 'rect' || D.tool === 'ellipse' }
    };
  }

  function extendShape(layer, point, event) {
    if (!D.shape) return;
    const shape = D.shape.shape;
    let x1 = point.x;
    let y1 = point.y;
    if (event && event.shiftKey) {
      const size = Math.max(Math.abs(x1 - shape.x0), Math.abs(y1 - shape.y0));
      x1 = shape.x0 + Math.sign(x1 - shape.x0 || 1) * size;
      y1 = shape.y0 + Math.sign(y1 - shape.y0 || 1) * size;
    }
    shape.x1 = x1;
    shape.y1 = y1;
    restoreBitmap(layer, D.shape.before);
    replayShape(layer, shape);
    compose();
  }

  function endShape() {
    if (D.shape) {
      pushHistory({ kind: 'shape', layerId: D.shape.layerId, before: D.shape.before, shape: D.shape.shape }, D.shape.shape.kind === 'rect' ? 'Rectangle' : 'Ellipse');
      D.shape = null;
    }
  }

  function fillAt(layer, point) {
    const before = layer.ctx.getImageData(0, 0, D.width, D.height);
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = 'source-over';
    layer.ctx.fillStyle = D.color;
    layer.ctx.fillRect(0, 0, D.width, D.height);
    layer.ctx.restore();
    pushHistory({ kind: 'fill', layerId: layer.id, before, color: D.color }, 'Remplissage');
    compose();
  }

  function pickColor(layer, point) {
    const data = layer.ctx.getImageData(Math.max(0, Math.floor(point.x)), Math.max(0, Math.floor(point.y)), 1, 1).data;
    const hex = `#${[data[0], data[1], data[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    D.color = hex;
    renderOptions();
    toast(`Couleur prélevée : ${hex.toUpperCase()}`);
  }

  function textFont(size, family) {
    return `600 ${Math.max(1, Math.round(Number(size) || 32))}px ${family || 'Georgia'}, sans-serif`;
  }

  function drawTextContent(layer) {
    const text = layer.text;
    if (!text) return;
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, D.width, D.height);
    ctx.fillStyle = text.color || '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = textFont(text.size, text.family);
    ctx.fillText(String(text.value || ''), text.x, text.y);
    ctx.restore();
  }

  function snapshotText(layer) {
    return {
      text: layer.text ? { ...layer.text } : null,
      bitmap: layer.ctx.getImageData(0, 0, D.width, D.height)
    };
  }

  function commitText(layer, before, patches) {
    const after = { ...layer.text, ...patches };
    layer.text = before.text ? { ...before.text } : null;
    restoreBitmap(layer, before.bitmap);
    layer.text = after;
    drawTextContent(layer);
    pushHistory({ kind: 'text', layerId: layer.id, before: before.text, after, beforeBitmap: before.bitmap }, 'Texte');
    renderLayers();
    compose();
  }

  function addTextLayer(point) {
    const value = window.prompt('Texte du calque :', 'VOTRE TEXTE');
    if (!value || !value.trim()) return;
    const layer = makeLayer(value.trim().slice(0, 26), {
      text: { value: value.trim(), x: point.x, y: point.y, size: D.fontSize, family: D.fontFamily, color: D.color }
    });
    drawTextContent(layer);
    D.layers.push(layer);
    D.activeId = layer.id;
    pushHistory({ kind: 'add', layer, index: D.layers.length - 1 }, 'Calque texte');
    renderLayers();
    renderProperties();
    compose();
  }

  function moveStart(layer, point) {
    D.stroke = { kind: 'move', layerId: layer.id, beforeCanvas: cloneCanvas(layer.canvas), start: point };
  }

  function moveExtend(layer, point) {
    if (!D.stroke || D.stroke.kind !== 'move') return;
    const dx = Math.round(point.x - D.stroke.start.x);
    const dy = Math.round(point.y - D.stroke.start.y);
    D.stroke.dx = dx;
    D.stroke.dy = dy;
    layer.ctx.clearRect(0, 0, D.width, D.height);
    layer.ctx.drawImage(D.stroke.beforeCanvas, dx, dy);
    compose();
  }

  function moveEnd() {
    if (D.stroke && D.stroke.kind === 'move') {
      if (D.stroke.dx || D.stroke.dy) pushHistory(D.stroke, 'Déplacement');
      D.stroke = null;
    }
  }

  function cloneCanvas(source) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext('2d').drawImage(source, 0, 0);
    return copy;
  }

  function onPointerDown(event) {
    if (!D.layers.length || event.button !== 0) return;
    const layer = activeLayer();
    if (!layer) return;
    if (!layer.visible) { toast('Le calque actif est masqué.'); return; }
    D.canvas.setPointerCapture(event.pointerId);
    D.drawing = true;
    const point = canvasPoint(event);
    if (D.tool === 'brush' || D.tool === 'eraser') beginStroke(layer, point);
    else if (D.tool === 'rect' || D.tool === 'ellipse') beginShape(layer, point);
    else if (D.tool === 'text') addTextLayer(point);
    else if (D.tool === 'fill') fillAt(layer, point);
    else if (D.tool === 'picker') pickColor(layer, point);
    else if (D.tool === 'move') moveStart(layer, point);
  }

  function onPointerMove(event) {
    if (!D.drawing) return;
    const layer = activeLayer();
    if (!layer) return;
    const point = canvasPoint(event);
    if (D.stroke && D.stroke.kind !== 'move') extendStroke(layer, point);
    else if (D.shape) extendShape(layer, point, event);
    else if (D.stroke && D.stroke.kind === 'move') moveExtend(layer, point);
    const cursor = document.getElementById('ph-cursor');
    if (cursor) cursor.textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
  }

  function onPointerUp() {
    if (!D.drawing) return;
    D.drawing = false;
    moveEnd();
    endStroke();
    endShape();
  }

  /* ---------------------------------------------------------------- layers */
  function addLayer() {
    const layer = makeLayer(`Calque ${D.layers.length + 1}`);
    D.layers.push(layer);
    D.activeId = layer.id;
    pushHistory({ kind: 'add', layer, index: D.layers.length - 1 }, 'Nouveau calque');
    renderLayers();
    renderProperties();
    compose();
  }

  function duplicateLayer() {
    const source = activeLayer();
    if (!source) return;
    const copy = makeLayer(`${source.name} copie`, { opacity: source.opacity, blend: source.blend, visible: source.visible, text: source.text ? { ...source.text } : null });
    copy.ctx.drawImage(source.canvas, 0, 0);
    const index = layerIndex(source.id) + 1;
    D.layers.splice(index, 0, copy);
    D.activeId = copy.id;
    pushHistory({ kind: 'add', layer: copy, index }, 'Calque dupliqué');
    renderLayers();
    renderProperties();
    compose();
  }

  function removeLayer() {
    const layer = activeLayer();
    if (!layer) return;
    if (D.layers.length <= 1) { toast('La composition doit conserver au moins un calque.'); return; }
    const index = layerIndex(layer.id);
    D.layers.splice(index, 1);
    D.activeId = (D.layers[index] || D.layers[index - 1] || null)?.id || null;
    pushHistory({ kind: 'remove', layer, index }, 'Calque supprimé');
    renderLayers();
    renderProperties();
    compose();
  }

  function moveLayer(delta) {
    const layer = activeLayer();
    if (!layer) return;
    const from = layerIndex(layer.id);
    const to = from + delta;
    if (to < 0 || to >= D.layers.length) return;
    D.layers.splice(from, 1);
    D.layers.splice(to, 0, layer);
    pushHistory({ kind: 'order', id: layer.id, from, to }, 'Ordre des calques');
    renderLayers();
    compose();
  }

  function toggleVisibility(layer) {
    const before = { visible: layer.visible };
    layer.visible = !layer.visible;
    pushHistory({ kind: 'prop', id: layer.id, before, after: { visible: layer.visible } }, 'Visibilité');
    renderLayers();
    compose();
  }

  function selectLayer(id) {
    D.activeId = id;
    renderLayers();
    renderProperties();
  }

  function thumbnail(layer) {
    try {
      const mini = document.createElement('canvas');
      mini.width = 46;
      mini.height = 26;
      const ctx = mini.getContext('2d');
      ctx.fillStyle = '#0b0d11';
      ctx.fillRect(0, 0, mini.width, mini.height);
      ctx.drawImage(layer.canvas, 0, 0, mini.width, mini.height);
      return mini.toDataURL('image/png');
    } catch (error) {
      return '';
    }
  }

  function renderLayers() {
    const slot = document.getElementById('ph-layers');
    if (!slot) return;
    const ordered = D.layers.map((layer, index) => ({ layer, index })).reverse();
    slot.innerHTML = ordered.map(({ layer }) => `<div class="ph-layer ${layer.id === D.activeId ? 'active' : ''}" data-layer="${esc(layer.id)}">
      <button type="button" class="ph-eye ${layer.visible ? 'on' : ''}" data-eye="${esc(layer.id)}" title="Visibilité">${layer.visible ? '◉' : '◌'}</button>
      <img class="ph-thumb" alt="" src="${thumbnail(layer)}">
      <div class="ph-layer-name"><strong>${esc(layer.name)}</strong><small>${esc(layer.blend)} · ${Math.round(layer.opacity * 100)} %</small></div>
    </div>`).join('');
    slot.querySelectorAll('[data-layer]').forEach((row) => {
      row.onclick = () => selectLayer(row.dataset.layer);
      row.ondblclick = () => renameLayer(row.dataset.layer);
    });
    slot.querySelectorAll('[data-eye]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        const layer = D.layers.find((item) => item.id === button.dataset.eye);
        if (layer) toggleVisibility(layer);
      };
    });
    const count = document.getElementById('ph-layer-count');
    if (count) count.textContent = String(D.layers.length);
    renderHistory();
  }

  function renameLayer(id) {
    const layer = D.layers.find((item) => item.id === id);
    if (!layer) return;
    const name = window.prompt('Nom du calque :', layer.name);
    if (!name || !name.trim()) return;
    const before = { name: layer.name };
    layer.name = name.trim().slice(0, 40);
    pushHistory({ kind: 'prop', id, before, after: { name: layer.name } }, 'Renommer');
    renderLayers();
  }

  function renderProperties() {
    const slot = document.getElementById('ph-props');
    if (!slot) return;
    const layer = activeLayer();
    if (!layer) { slot.innerHTML = '<p class="ph-empty">Aucun calque.</p>'; return; }
    slot.innerHTML = `<div class="ph-prop-row"><label>Opacité <span id="ph-opacity-value">${Math.round(layer.opacity * 100)} %</span></label><input id="ph-opacity" type="range" min="0" max="1" step="0.01" value="${layer.opacity}"></div>
      <div class="ph-prop-row"><label>Fusion</label><select id="ph-blend">${BLENDS.map((blend) => `<option value="${blend}" ${layer.blend === blend ? 'selected' : ''}>${blend}</option>`).join('')}</select></div>
      <div class="ph-prop-row"><label>Nom</label><input id="ph-layer-title" maxlength="40" value="${esc(layer.name)}"></div>
      ${layer.text ? `<div class="ph-prop-row"><label>Texte du calque <span>modifiable</span></label><input id="ph-text-value" type="text" maxlength="120" value="${esc(layer.text.value)}"></div>
      <div class="ph-prop-row"><label>Taille <span id="ph-text-size-value">${Math.round(layer.text.size)} px</span></label><input id="ph-text-size" type="range" min="12" max="420" step="1" value="${layer.text.size}"></div>
      <div class="ph-prop-row"><label>Police</label><select id="ph-text-font">${FONTS.map((font) => `<option value="${font}" ${layer.text.family === font ? 'selected' : ''}>${font}</option>`).join('')}</select></div>
      <div class="ph-prop-row"><label>Couleur</label><input id="ph-text-color" type="color" value="${layer.text.color || '#ffffff'}"></div>
      <p class="ph-hint">Double-clique le texte dans l’image pour le reprendre ici. Chaque modification reste annulable.</p>` : ''}
      <div class="ph-prop-grid">
        <button type="button" class="secondary" id="ph-layer-up">Monter</button>
        <button type="button" class="secondary" id="ph-layer-down">Descendre</button>
        <button type="button" class="secondary" id="ph-layer-duplicate">Dupliquer</button>
        <button type="button" class="secondary" id="ph-layer-delete">Supprimer</button>
      </div>
      <p class="ph-hint">Le calque actif reçoit les coups de pinceau, les formes et le texte.</p>`;
    const opacity = document.getElementById('ph-opacity');
    let initial = null;
    opacity.oninput = () => {
      if (initial === null) initial = layer.opacity;
      layer.opacity = Number(opacity.value);
      const label = document.getElementById('ph-opacity-value');
      if (label) label.textContent = `${Math.round(layer.opacity * 100)} %`;
      compose();
    };
    opacity.onchange = () => {
      const final = Number(opacity.value);
      const before = { opacity: initial === null ? layer.opacity : initial };
      initial = null;
      pushHistory({ kind: 'prop', id: layer.id, before, after: { opacity: final } }, 'Opacité');
      renderLayers();
    };
    const blend = document.getElementById('ph-blend');
    blend.onchange = () => {
      const before = { blend: layer.blend };
      layer.blend = blend.value;
      pushHistory({ kind: 'prop', id: layer.id, before, after: { blend: layer.blend } }, 'Mode de fusion');
      renderLayers();
      compose();
    };
    const title = document.getElementById('ph-layer-title');
    title.onchange = () => {
      const before = { name: layer.name };
      layer.name = title.value.trim().slice(0, 40) || layer.name;
      pushHistory({ kind: 'prop', id: layer.id, before, after: { name: layer.name } }, 'Renommer');
      renderLayers();
    };
    document.getElementById('ph-layer-up').onclick = () => moveLayer(1);
    document.getElementById('ph-layer-down').onclick = () => moveLayer(-1);
    document.getElementById('ph-layer-duplicate').onclick = duplicateLayer;
    document.getElementById('ph-layer-delete').onclick = removeLayer;
    if (layer.text) {
      let pending = null;
      const bindText = (element, read, label) => {
        if (!element) return;
        element.oninput = () => {
          if (!pending) pending = snapshotText(layer);
          layer.text = { ...layer.text, ...read() };
          drawTextContent(layer);
          compose();
          if (label) label();
        };
        element.onchange = () => {
          const snap = pending || snapshotText(layer);
          pending = null;
          commitText(layer, snap, read());
        };
      };
      bindText(document.getElementById('ph-text-value'), () => ({ value: document.getElementById('ph-text-value').value }));
      bindText(document.getElementById('ph-text-size'), () => ({ size: Number(document.getElementById('ph-text-size').value) }), () => {
        const label = document.getElementById('ph-text-size-value');
        if (label) label.textContent = `${Math.round(Number(document.getElementById('ph-text-size').value))} px`;
      });
      bindText(document.getElementById('ph-text-font'), () => ({ family: document.getElementById('ph-text-font').value }));
      bindText(document.getElementById('ph-text-color'), () => ({ color: document.getElementById('ph-text-color').value }));
    }
  }

  function renderOptions() {
    const slot = document.getElementById('ph-tool-options');
    if (!slot) return;
    const swatches = ['#e2c07a', '#f4f1e8', '#d98d86', '#7fc59a', '#6fa8d6', '#a88fd6', '#11151b', '#ffffff'];
    const colorRow = `<div class="ph-color-wrap"><label>Couleur</label><input id="ph-color" type="color" value="${D.color}"><div class="ph-swatches">${swatches.map((color) => `<button type="button" class="ph-swatch ${D.color.toLowerCase() === color.toLowerCase() ? 'active' : ''}" data-swatch="${color}" style="background:${color}" title="${color}"></button>`).join('')}</div></div>`;
    let body = '';
    if (D.tool === 'brush' || D.tool === 'eraser') {
      body = `<div class="ph-opt"><label>Taille <span id="ph-size-value">${D.brushSize} px</span></label><input id="ph-size" type="range" min="1" max="400" step="1" value="${D.brushSize}"></div>
        <div class="ph-opt"><label>Opacité <span id="ph-brush-opacity-value">${Math.round(D.brushOpacity * 100)} %</span></label><input id="ph-brush-opacity" type="range" min="0.02" max="1" step="0.01" value="${D.brushOpacity}"></div>${colorRow}`;
    } else if (D.tool === 'rect' || D.tool === 'ellipse') {
      body = `${colorRow}<p class="ph-opt-note">Tracer en glissant. Maj contraint le carré ou le cercle.</p>`;
    } else if (D.tool === 'text') {
      body = `<div class="ph-opt"><label>Police</label><select id="ph-font">${FONTS.map((font) => `<option ${font === D.fontFamily ? 'selected' : ''}>${font}</option>`).join('')}</select></div>
        <div class="ph-opt"><label>Taille <span id="ph-font-size-value">${D.fontSize} px</span></label><input id="ph-font-size" type="range" min="12" max="420" step="1" value="${D.fontSize}"></div>${colorRow}<p class="ph-opt-note">Cliquer dans l’image pour créer un calque texte.</p>`;
    } else if (D.tool === 'move') {
      body = '<p class="ph-opt-note">Glisser le contenu du calque actif. Chaque déplacement est annulable.</p>';
    } else if (D.tool === 'fill') {
      body = `${colorRow}<p class="ph-opt-note">Remplit le calque actif avec la couleur choisie.</p>`;
    } else if (D.tool === 'picker') {
      body = '<p class="ph-opt-note">Cliquer sur l’image pour prélever une couleur dans le calque actif.</p>';
    }
    slot.innerHTML = body;
    document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === D.tool));
    const badge = document.getElementById('ph-tool-badge');
    if (badge) badge.textContent = LABELS[D.tool] || D.tool;
    const color = document.getElementById('ph-color');
    if (color) color.oninput = () => { D.color = color.value; renderOptions(); };
    slot.querySelectorAll('[data-swatch]').forEach((button) => {
      button.onclick = () => { D.color = button.dataset.swatch; renderOptions(); };
    });
    const size = document.getElementById('ph-size');
    if (size) size.oninput = () => { D.brushSize = Number(size.value); const label = document.getElementById('ph-size-value'); if (label) label.textContent = `${D.brushSize} px`; };
    const brushOpacity = document.getElementById('ph-brush-opacity');
    if (brushOpacity) brushOpacity.oninput = () => { D.brushOpacity = Number(brushOpacity.value); const label = document.getElementById('ph-brush-opacity-value'); if (label) label.textContent = `${Math.round(D.brushOpacity * 100)} %`; };
    const font = document.getElementById('ph-font');
    if (font) font.onchange = () => { D.fontFamily = font.value; };
    const fontSize = document.getElementById('ph-font-size');
    if (fontSize) fontSize.oninput = () => { D.fontSize = Number(fontSize.value); const label = document.getElementById('ph-font-size-value'); if (label) label.textContent = `${D.fontSize} px`; };
  }

  function setTool(tool) {
    D.tool = tool;
    renderOptions();
    updateScrollMode();
  }

  /* ------------------------------------------------------------------ zoom */
  function updateScrollMode() {
    const area = document.getElementById('ph-canvas-area');
    if (!area || !D.canvas) return;
    if (D.zoom === 'fit') {
      area.classList.add('fit');
      const rect = area.getBoundingClientRect();
      const scale = Math.min((rect.width - 42) / D.width, (rect.height - 42) / D.height, 1);
      D.canvas.style.width = `${Math.max(80, D.width * scale)}px`;
      D.canvas.style.height = `${Math.max(45, D.height * scale)}px`;
    } else {
      area.classList.remove('fit');
      const scale = Number(D.zoom) / 100;
      D.canvas.style.width = `${D.width * scale}px`;
      D.canvas.style.height = `${D.height * scale}px`;
    }
    const badge = document.getElementById('ph-zoom-badge');
    if (badge) badge.textContent = D.zoom === 'fit' ? 'Ajusté' : `${D.zoom} %`;
  }

  function setZoom(value) {
    D.zoom = value;
    document.querySelectorAll('[data-zoom]').forEach((button) => button.classList.toggle('active', button.dataset.zoom === String(value)));
    updateScrollMode();
  }

  /* --------------------------------------------------------------- document */
  function timestamp() {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  }

  async function exportPNG() {
    if (!D.canvas) return;
    compose();
    D.canvas.toBlob((blob) => {
      if (!blob) { toast('Export PNG impossible.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Revelation-Photo-${timestamp()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`PNG exporté : ${D.width} × ${D.height}, ${Math.round(blob.size / 1024)} Ko.`);
    }, 'image/png');
  }

  function serialize() {
    return {
      schema: 1,
      name: D.docName,
      width: D.width,
      height: D.height,
      activeId: D.activeId,
      savedAt: Date.now(),
      layers: D.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        blend: layer.blend,
        text: layer.text,
        image: layer.canvas.toDataURL('image/png')
      }))
    };
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('revelation-photo-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('docs')) request.result.createObjectStore('docs'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPut(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('docs', 'readwrite');
      tx.objectStore('docs').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('docs', 'readonly');
      const request = tx.objectStore('docs').get(key);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function saveDocument(quiet) {
    try {
      const payload = serialize();
      await idbPut('last', payload);
      markSaved(`Enregistré ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
      if (!quiet) toast('Composition enregistrée dans le stockage local du navigateur.');
    } catch (error) {
      toast(`Enregistrement impossible : ${error.message}. Utilise l’export PNG ou conserve l’onglet ouvert.`);
    }
  }

  async function hydrate(payload) {
    if (!payload || !Array.isArray(payload.layers) || !payload.layers.length) throw new Error('Document illisible.');
    D.width = Number(payload.width) || 1920;
    D.height = Number(payload.height) || 1080;
    D.docName = payload.name || 'Composition';
    const layers = [];
    for (const item of payload.layers) {
      const layer = makeLayer(item.name, { visible: item.visible, opacity: item.opacity, blend: item.blend, text: item.text });
      if (item.image) {
        await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => { layer.ctx.drawImage(image, 0, 0); resolve(); };
          image.onerror = () => reject(new Error('Image de calque illisible.'));
          image.src = item.image;
        });
      }
      layers.push(layer);
    }
    D.layers = layers;
    D.activeId = payload.activeId && layers.some((layer) => layer.id === payload.activeId) ? payload.activeId : layers[layers.length - 1].id;
    D.loaded = true;
    D.dirty = false;
  }

  async function openDocument() {
    try {
      const payload = await idbGet('last');
      if (!payload) { toast('Aucune composition enregistrée dans ce navigateur.'); return; }
      await hydrate(payload);
      renderAll(true);
      markSaved('Ouvert');
      toast('Composition restaurée.');
    } catch (error) {
      toast(`Ouverture impossible : ${error.message}`);
    }
  }

  function importImage() {
    const input = document.getElementById('ph-file');
    if (input) input.click();
  }

  async function addImportedFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Image illisible.'));
        img.src = url;
      });
      const layer = makeLayer(file.name.replace(/\.[^.]+$/, '').slice(0, 34));
      const scale = Math.min(D.width / image.naturalWidth, D.height / image.naturalHeight, 1);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      layer.ctx.drawImage(image, (D.width - width) / 2, (D.height - height) / 2, width, height);
      D.layers.push(layer);
      D.activeId = layer.id;
      pushHistory({ kind: 'add', layer, index: D.layers.length - 1 }, 'Import image');
      renderLayers();
      renderProperties();
      compose();
      toast(`Image importée : ${image.naturalWidth} × ${image.naturalHeight}.`);
    } catch (error) {
      toast(error.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ------------------------------------------------------------------ view */
  function template() {
    return `<div class="ph-shell">
      <div class="ph-topbar">
        <span class="ph-kicker">ATELIER PHOTO</span>
        <input id="ph-docname" class="ph-docname" maxlength="60" value="${esc(D.docName)}" aria-label="Nom de la composition">
        <span id="ph-save-state" class="ph-save" data-mode="saved">Stockage local</span>
        <span class="ph-spacer"></span>
        <button type="button" class="ph-btn" data-ph="new">Nouveau</button>
        <button type="button" class="ph-btn" data-ph="open">Ouvrir</button>
        <button type="button" class="ph-btn" data-ph="save">Enregistrer</button>
        <button type="button" class="ph-btn" data-ph="import">Importer image</button>
        <button type="button" class="ph-btn ph-btn-primary" data-ph="export">Exporter PNG</button>
      </div>
      <div class="ph-optionsbar">
        <span class="ph-tool-badge" id="ph-tool-badge">${LABELS[D.tool]}</span>
        <div class="ph-tool-options" id="ph-tool-options"></div>
        <span class="ph-spacer"></span>
        <div class="ph-zoom-group">
          <span class="ph-zoom-badge" id="ph-zoom-badge">Ajusté</span>
          <button type="button" class="ph-zoom-btn" data-zoom="fit">Ajuster</button>
          <button type="button" class="ph-zoom-btn" data-zoom="25">25 %</button>
          <button type="button" class="ph-zoom-btn" data-zoom="50">50 %</button>
          <button type="button" class="ph-zoom-btn" data-zoom="100">100 %</button>
        </div>
      </div>
      <div class="ph-body">
        <div class="ph-tools">${TOOLS.map(([id, key, label, icon]) => `<button type="button" class="ph-tool ${D.tool === id ? 'active' : ''}" data-tool="${id}" title="${label} (${key})"><span>${icon}</span><kbd>${key}</kbd></button>`).join('')}</div>
        <div class="ph-canvas-area fit" id="ph-canvas-area"><div class="ph-canvas-frame"><canvas id="ph-canvas"></canvas></div><span class="ph-cursor" id="ph-cursor">0, 0</span></div>
        <aside class="ph-panels">
          <section class="ph-panel">
            <div class="ph-panel-head"><h3>Calques <span id="ph-layer-count">0</span></h3><button type="button" class="ph-mini" id="ph-add-layer" title="Nouveau calque">＋</button></div>
            <div id="ph-layers" class="ph-layers"></div>
          </section>
          <section class="ph-panel">
            <div class="ph-panel-head"><h3>Propriétés</h3></div>
            <div id="ph-props"></div>
          </section>
          <section class="ph-panel">
            <div class="ph-panel-head"><h3>Mémoire</h3><span class="ph-mini-label">⌘Z</span></div>
            <div id="ph-history"></div>
            <div class="ph-history-actions">
              <button type="button" class="secondary" id="ph-undo">Annuler</button>
              <button type="button" class="secondary" id="ph-redo">Rétablir</button>
            </div>
          </section>
        </aside>
      </div>
      <div class="ph-statusbar"><span id="ph-status-left">${D.width} × ${D.height} · RVB · 8 bits</span><span id="ph-status-right">${D.layers.length} calque(s) · ${LABELS[D.tool]}</span></div>
      <input type="file" id="ph-file" accept="image/*" hidden>
    </div>`;
  }

  function renderAll(force) {
    if (!D.canvas || force) {
      D.canvas = document.getElementById('ph-canvas');
      D.ctx = D.canvas ? D.canvas.getContext('2d') : null;
      if (D.canvas) { D.canvas.width = D.width; D.canvas.height = D.height; }
    }
    if (!D.canvas) return;
    D.canvas.width = D.width;
    D.canvas.height = D.height;
    D.ctx = D.canvas.getContext('2d');
    renderOptions();
    renderLayers();
    renderProperties();
    renderHistory();
    compose();
    updateScrollMode();
    const name = document.getElementById('ph-docname');
    if (name) name.value = D.docName;
    const left = document.getElementById('ph-status-left');
    if (left) left.textContent = `${D.width} × ${D.height} · RVB · 8 bits`;
    const right = document.getElementById('ph-status-right');
    if (right) right.textContent = `${D.layers.length} calque(s) · ${LABELS[D.tool]}`;
    renderOptions();
  }

  function bind() {
    const canvas = D.canvas;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', () => { const cursor = document.getElementById('ph-cursor'); if (cursor) cursor.textContent = ''; });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('dblclick', () => {
      const layer = activeLayer();
      if (!layer || !layer.text) return;
      const input = document.getElementById('ph-text-value');
      if (input) { input.focus(); input.select(); }
    });

    document.querySelectorAll('[data-ph]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.ph;
        if (action === 'new') newDocument();
        else if (action === 'open') openDocument();
        else if (action === 'save') saveDocument(false);
        else if (action === 'import') importImage();
        else if (action === 'export') exportPNG();
      };
    });
    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.onclick = () => setTool(button.dataset.tool);
    });
    document.querySelectorAll('[data-zoom]').forEach((button) => {
      button.onclick = () => setZoom(button.dataset.zoom);
    });
    document.getElementById('ph-add-layer').onclick = addLayer;
    document.getElementById('ph-undo').onclick = undo;
    document.getElementById('ph-redo').onclick = redo;
    const file = document.getElementById('ph-file');
    file.onchange = async () => {
      const chosen = Array.from(file.files || []);
      file.value = '';
      for (const item of chosen) await addImportedFile(item);
    };
    const name = document.getElementById('ph-docname');
    name.onchange = () => { D.docName = name.value.trim().slice(0, 60) || 'Composition'; markDirty(); scheduleSave(); };
    const area = document.getElementById('ph-canvas-area');
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => updateScrollMode());
      observer.observe(area);
    }
  }

  function mount(container) {
    nav();
    container.innerHTML = template();
    D.loaded = false;
    if (!D.layers.length) makeDefaultDocument(true);
    renderAll(true);
    bind();
    if (!D.wasOpened) {
      D.wasOpened = true;
      idbGet('last').then((payload) => {
        if (!payload || !document.getElementById('ph-canvas')) return;
        if (D.dirty) return;
        hydrate(payload).then(() => {
          if (!document.getElementById('ph-canvas')) return;
          renderAll(true);
          markSaved('Restauré');
        }).catch(() => {});
      }).catch(() => {});
    }
    markSaved(D.dirty ? 'Modifié' : 'Stockage local');
  }

  function updateKeyHints() {
    const right = document.getElementById('ph-status-right');
    if (right) right.textContent = `${D.layers.length} calque(s) · ${LABELS[D.tool]}`;
    renderOptions();
  }

  document.addEventListener('keydown', (event) => {
    if (typeof page === 'undefined' || page !== 'photo') return;
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (meta && event.key.toLowerCase() === 's') { event.preventDefault(); saveDocument(false); return; }
    if (meta && event.key.toLowerCase() === 'e') { event.preventDefault(); exportPNG(); return; }
    if (meta || event.altKey) return;
    const tool = { v: 'move', b: 'brush', e: 'eraser', r: 'rect', o: 'ellipse', t: 'text', g: 'fill', i: 'picker' }[event.key.toLowerCase()];
    if (tool) { event.preventDefault(); setTool(tool); updateKeyHints(); }
  });

  const baseRender = render;
  render = function () {
    if (page === 'photo') { mount($('#workspace')); return; }
    baseRender();
  };

  const baseNavigate = navigate;
  navigate = function (id) {
    if (page === 'photo' && id !== 'photo' && D.dirty) saveDocument(true);
    baseNavigate(id);
  };

  window.StudioPhoto = {
    newDocument,
    exportPNG: () => { if (page !== 'photo') navigate('photo'); setTimeout(exportPNG, 180); },
    save: saveDocument,
    status: () => `PHOTO · ${D.width}×${D.height} · ${D.layers.length} calque${D.layers.length > 1 ? 's' : ''} · ${LABELS[D.tool]}`,
    _state: D
  };
})();
