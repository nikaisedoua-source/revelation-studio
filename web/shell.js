/* Professional workspace shell: menus, workspace tabs, command palette, status bar. */
(function () {
  'use strict';

  const WORKSPACES = [
    ['workspace', 'MÉDIA', '▦'],
    ['montage', 'MONTAGE', '▷'],
    ['photo', 'PHOTO', '◧'],
    ['color', 'ÉTALONNAGE', '◐'],
    ['effects', 'VFX', '✧'],
    ['audio', 'AUDIO', '♫'],
    ['media', 'IA MÉDIA', '✳'],
    ['coverage', 'LIVRAISON', '✓']
  ];

  const MENUS = [
    ['Fichier', [
      ['Nouveau montage', 'newMontage', '⌘N'],
      ['Ouvrir un projet…', 'openProject', '⌘O'],
      ['Enregistrer le montage', 'saveProject', '⌘S'],
      ['Exporter le projet .json', 'exportProject', ''],
      ['Exporter la vidéo', 'exportVideo', '⌘E'],
      ['-', ''],
      ['Nouvelle composition photo', 'newPhoto', ''],
      ['Exporter la composition PNG', 'exportPhoto', ''],
      ['-', ''],
      ['Actualiser les connexions', 'refresh', '⌘R']
    ]],
    ['Édition', [
      ['Annuler', 'undo', '⌘Z'],
      ['Rétablir', 'redo', '⇧⌘Z'],
      ['-', ''],
      ['Couper au playhead', 'split', 'S'],
      ['Supprimer le clip', 'delete', 'Suppr'],
      ['Dupliquer le clip', 'duplicate', '']
    ]],
    ['Affichage', [
      ['Espace de travail', 'page:workspace', ''],
      ['Atelier film', 'page:film', ''],
      ['Montage vidéo', 'page:montage', 'Alt+2'],
      ['Atelier photo', 'page:photo', 'Alt+3'],
      ['Étalonnage', 'page:color', 'Alt+4'],
      ['Livraison', 'page:coverage', 'Alt+8']
    ]],
    ['Outils', [
      ['IA & quotas', 'page:providers', ''],
      ['Images & vidéo IA', 'page:media', ''],
      ['Motion design', 'page:motion', ''],
      ['Texte Photoshop', 'page:photoshop', ''],
      ['Animation 3D', 'page:three_d', ''],
      ['Voix & son', 'page:audio', 'Alt+6'],
      ['Modèles locaux', 'page:models', '']
    ]],
    ['Aide', [
      ['Palette de commandes', 'palette', '⌘K'],
      ['Raccourcis clavier', 'shortcuts', ''],
      ['État des moteurs IA', 'aiStatus', ''],
      ['À propos du Studio', 'about', '']
    ]]
  ];

  const ICONS = { 'Nouveau montage': '＋', 'Ouvrir un projet…': '↥', 'Enregistrer le montage': '▣', 'Exporter le projet .json': '{ }', 'Exporter la vidéo': '▶', 'Nouvelle composition photo': '◧', 'Exporter la composition PNG': '⤓', 'Actualiser les connexions': '↻' };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function buildMenus() {
    const slot = document.getElementById('menubar-slot');
    if (!slot) return;
    slot.innerHTML = MENUS.map(([title, items]) => `<div class="menu-wrap" data-menu="${esc(title)}"><button class="menu-btn" type="button">${esc(title)}</button><div class="menu-pop">${items.map(([label, action, key]) => action === '-'
      ? '<div class="menu-sep"></div>'
      : `<button type="button" data-action="${esc(action)}"><span>${label}</span><kbd>${esc(key)}</kbd></button>`).join('')}</div></div>`).join('');
    slot.querySelectorAll('.menu-wrap').forEach((wrap) => {
      const button = wrap.querySelector('.menu-btn');
      button.onclick = (event) => {
        event.stopPropagation();
        const open = wrap.classList.contains('open');
        closeMenus();
        if (!open) wrap.classList.add('open');
      };
      wrap.querySelectorAll('[data-action]').forEach((item) => {
        item.onclick = () => { closeMenus(); runAction(item.dataset.action); };
      });
    });
  }

  function closeMenus() {
    document.querySelectorAll('.menu-wrap.open').forEach((wrap) => wrap.classList.remove('open'));
  }

  function runAction(action) {
    if (!action) return;
    if (action.startsWith('page:')) { navigate(action.slice(5)); return; }
    if (action === 'refresh') { refresh().then(() => { render(); toast('État des connexions actualisé.'); }).catch((error) => toast(error.message)); return; }
    if (action === 'palette') { openPalette(); return; }
    if (action === 'shortcuts') {
      toast('Espace lecture · S couper · ⌘Z annuler · ⌘K commandes · Alt+1–8 espaces · B pinceau · E gomme · T texte dans Photo.');
      return;
    }
    if (action === 'aiStatus') { showAiStatus(); return; }
    if (action === 'about') {
      toast('Révélation AI Studio 0.12.0 · assistant projet intégré : plans, titres, musique, voix système, assemblage et export sans quitter le Studio.');
      return;
    }
    if (action === 'newPhoto') {
      navigate('photo');
      setTimeout(() => window.StudioPhoto && window.StudioPhoto.newDocument(), 180);
      return;
    }
    if (action === 'exportPhoto') {
      if (page !== 'photo') navigate('photo');
      setTimeout(() => window.StudioPhoto && window.StudioPhoto.exportPNG(), 180);
      return;
    }
    if (action === 'newMontage') {
      ensureEditor(() => window.StudioEditor.newProject());
      return;
    }
    if (action === 'openProject') {
      ensureEditor(() => window.StudioEditor.commands.openProjectPicker());
      return;
    }
    if (action === 'saveProject') {
      ensureEditor(() => window.StudioEditor.commands.saveProject(true).catch((error) => toast(error.message)));
      return;
    }
    if (action === 'exportProject') {
      ensureEditor(() => window.StudioEditor.commands.exportProjectJSON());
      return;
    }
    if (action === 'exportVideo') {
      ensureEditor(() => window.StudioEditor.commands.exportVideo());
      return;
    }
    const editorCommands = { undo: 'undo', redo: 'redo', split: 'splitAtPlayhead', delete: 'deleteSelected', duplicate: 'duplicateSelected' };
    if (action in editorCommands) {
      ensureEditor(() => {
        const command = editorCommands[action];
        if (command === 'deleteSelected') window.StudioEditor.commands.deleteSelected(false);
        else window.StudioEditor.commands[command]();
      });
    }
  }

  function ensureEditor(callback) {
    if (page !== 'montage') {
      navigate('montage');
      setTimeout(callback, 260);
      return;
    }
    setTimeout(callback, 30);
  }

  function buildTabs() {
    const slot = document.getElementById('workspace-tabs');
    if (!slot) return;
    slot.innerHTML = WORKSPACES.map(([id, label, icon], index) => `<button type="button" class="ws-tab ${page === id ? 'active' : ''}" data-ws="${esc(id)}" title="${esc(label)} · Alt+${index + 1}"><span>${icon}</span> ${esc(label)}</button>`).join('');
    slot.querySelectorAll('[data-ws]').forEach((tab) => {
      tab.onclick = () => navigate(tab.dataset.ws);
    });
  }

  const originalNav = nav;
  nav = function () {
    const source = typeof pages !== 'undefined' ? pages : [];
    const groups = typeof navGroups !== 'undefined' ? navGroups : {};
    const navSlot = document.getElementById('nav');
    if (navSlot) {
      navSlot.innerHTML = source.map(([id, icon, name]) => `${groups[id] ? `<div class="nav-group">${esc(groups[id])}</div>` : ''}<button class="nav-item ${page === id ? 'active' : ''}" data-page="${esc(id)}" title="${esc(name)}"><span>${icon}</span><em style="font-style:normal">${esc(name)}</em></button>`).join('');
      navSlot.querySelectorAll('[data-page]').forEach((button) => {
        button.onclick = () => navigate(button.dataset.page);
      });
    }
    const current = source.find((item) => item[0] === page);
    const nameSlot = document.getElementById('section-name');
    if (nameSlot && current) nameSlot.textContent = current[2];
    buildTabs();
    syncShell();
  };

  function configuredProviders() {
    const statuses = (typeof stats !== 'undefined' && stats && stats.provider_status) || {};
    return Object.values(statuses).filter((item) => item.configured);
  }

  function ollamaModels() {
    const models = (typeof stats !== 'undefined' && stats && stats.models) || [];
    return models.filter((model) => model.engine === 'ollama');
  }

  function syncShell() {
    const project = window.StudioEditor && window.StudioEditor._debug && window.StudioEditor._debug.state.project;
    const projectSlot = document.getElementById('mb-project');
    if (projectSlot) projectSlot.textContent = project ? project.name : 'Révélation Studio · sélectionne un module';
    const providers = configuredProviders();
    const local = ollamaModels();
    const ai = document.getElementById('mb-ai');
    if (ai) {
      ai.classList.toggle('on', providers.length > 0 || local.length > 0);
      ai.classList.toggle('off', providers.length === 0 && local.length === 0);
      ai.innerHTML = `<i></i> IA · ${local.length ? `Ollama ${local.length}` : 'local'}${providers.length ? ` · ${providers.length} clés` : ' · 0 clé cloud'}`;
    }
    const right = document.getElementById('status-right');
    if (right) {
      const verified = providers.filter((item) => item.last_verified).length;
      right.innerHTML = `<span class="${providers.length ? 'ok' : 'warn'}">IA ${providers.length} cloud configuré${providers.length > 1 ? 's' : ''}</span> · Ollama ${local.length} modèle${local.length > 1 ? 's' : ''} · ${verified} génération${verified > 1 ? 's' : ''} vérifiée${verified > 1 ? 's' : ''}`;
    }
    const left = document.getElementById('status-left');
    if (left) left.textContent = `${(typeof boot !== 'undefined' && boot.mode === 'web') ? 'WEB' : 'MAC'} · 127.0.0.1 · ${page.toUpperCase()}`;
    const middle = document.getElementById('status-mid');
    if (middle) {
      if (window.StudioEditor && window.StudioEditor.isMounted() && window.StudioEditor._debug.state.project) {
        const state = window.StudioEditor._debug.state;
        const M = window.StudioEditor._debug.M;
        const project = state.project;
        middle.textContent = `${project.width}×${project.height} · ${project.fps} i/s · ${M.timecode(state.playhead, project.fps)} · ${project.clips.length} clip${project.clips.length > 1 ? 's' : ''}`;
      } else if (window.StudioPhoto && page === 'photo') {
        middle.textContent = window.StudioPhoto.status();
      } else {
        middle.textContent = 'STUDIO LOCAL · PROJET PRIVÉ';
      }
    }
    const disk = document.getElementById('disk-state');
    if (disk) disk.textContent = (typeof stats !== 'undefined' && stats && stats.external_mounted) ? 'stockage externe monté' : 'stockage local du Studio';
  }

  function showAiStatus() {
    const providers = configuredProviders();
    const local = ollamaModels();
    const names = providers.map((item) => item.state).join(' · ');
    toast(`IA locale : ${local.length ? local.map((model) => model.name).join(', ') : 'aucun modèle Ollama détecté'}. Cloud : ${providers.length ? `${providers.length} service(s) configuré(s) — ${names}` : 'aucune clé cloud active'}.`);
  }

  /* ----------------------------------------------------------- command palette */
  const palette = document.getElementById('cmd-palette');
  const input = document.getElementById('cmd-input');
  const results = document.getElementById('cmd-results');
  let commandList = [];
  let activeIndex = 0;

  function buildCommands() {
    const list = [];
    ((typeof pages !== 'undefined' ? pages : [])).forEach(([id, icon, name]) => list.push({ label: `Aller à ${name}`, hint: 'module', icon, run: () => navigate(id) }));
    MENUS.flatMap(([, items]) => items).filter(([label, action]) => action && action !== '-').forEach(([label, action]) => {
      list.push({ label, hint: 'action', icon: ICONS[label] || '⌘', run: () => runAction(action) });
    });
    list.push({ label: 'Nouvelle composition photo 1920×1080', hint: 'action', icon: '◧', run: () => runAction('newPhoto') });
    list.push({ label: 'Vérifier les moteurs IA', hint: 'diagnostic', icon: '◌', run: showAiStatus });
    commandList = list;
  }

  function openPalette() {
    if (!palette) return;
    buildCommands();
    input.value = '';
    renderCommands('');
    palette.hidden = false;
    setTimeout(() => input.focus(), 20);
  }

  function closePalette() {
    if (palette) palette.hidden = true;
  }

  function renderCommands(query) {
    const needle = query.trim().toLowerCase();
    const filtered = commandList.filter((command) => !needle || command.label.toLowerCase().includes(needle) || command.hint.toLowerCase().includes(needle));
    activeIndex = 0;
    results.innerHTML = filtered.length
      ? filtered.map((command, index) => `<button type="button" class="cmd-item ${index === 0 ? 'active' : ''}" data-index="${index}"><span>${command.icon} ${esc(command.label)}</span><small>${esc(command.hint)}</small></button>`).join('')
      : '<div class="cmd-empty">Aucune commande ne correspond.</div>';
    results.querySelectorAll('[data-index]').forEach((button) => {
      button.onclick = () => { const command = filtered[Number(button.dataset.index)]; closePalette(); if (command) command.run(); };
    });
    results._filtered = filtered;
  }

  function moveActive(delta) {
    const items = Array.from(results.querySelectorAll('.cmd-item'));
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach((item, index) => item.classList.toggle('active', index === activeIndex));
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  /* ----------------------------------------------------------------- wiring */
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.menu-wrap')) closeMenus();
    if (event.target === palette) closePalette();
  });

  document.addEventListener('keydown', (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); return; }
    if (!palette.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        const command = (results._filtered || [])[activeIndex];
        closePalette();
        if (command) command.run();
      }
      return;
    }
    if (event.key === 'Escape') { closeMenus(); return; }
    if (event.altKey && !meta && /^[1-8]$/.test(event.key)) {
      const target = WORKSPACES[Number(event.key) - 1];
      if (target) { event.preventDefault(); navigate(target[0]); }
      return;
    }
    if (meta && !event.shiftKey && event.key.toLowerCase() === 'n') { event.preventDefault(); runAction('newMontage'); return; }
    if (meta && event.key.toLowerCase() === 'r') { event.preventDefault(); runAction('refresh'); }
  });

  if (input) input.oninput = () => renderCommands(input.value);
  const cmdButton = document.getElementById('cmd-open');
  if (cmdButton) cmdButton.onclick = openPalette;

  /* --------------------------------------------------------------- lifecycle */
  buildMenus();
  const originalRender = render;
  render = function () {
    originalRender();
    syncShell();
  };
  setInterval(syncShell, 1400);
  window.StudioShell = { openPalette, syncShell, WORKSPACES, runAction };
})();
