/* Software-specific workspace chrome and real bridge hub.
   Identity is cosmetic; every state and action below comes from /api/status and /api/connections. */
(function () {
  'use strict';

  const SUITES = {
    resolve: {
      target: 'resolve', title: 'DaVinci Resolve', short: 'DR', accent: '#f07a45', on: '#1d1108',
      role: 'Montage · étalonnage · livraison',
      pages: [['montage', 'MONTAGE'], ['color', 'COLOR'], ['coverage', 'DELIVER']]
    },
    fairlight: {
      target: 'resolve', title: 'Fairlight', short: 'FL', accent: '#46c6d8', on: '#071a1d',
      role: 'Montage sonore · mixage',
      pages: [['audio', 'MIXAGE']]
    },
    photoshop: {
      target: 'photoshop', title: 'Adobe Photoshop', short: 'Ps', accent: '#4aa3ff', on: '#ffffff',
      role: 'Photo · calques · texte',
      pages: [['photo', 'PHOTO'], ['photoshop', 'TEXTE'], ['storyboard', 'STORYBOARD']]
    },
    aftereffects: {
      target: 'after_effects', title: 'Adobe After Effects', short: 'Ae', accent: '#a58bff', on: '#171020',
      role: 'Motion design · compositing',
      pages: [['motion', 'MOTION'], ['effects', 'VFX'], ['graphics', 'GRAPHIQUES']]
    },
    blender: {
      target: 'blender', title: 'Blender', short: 'Bl', accent: '#ea9a4e', on: '#1c1208',
      role: 'Scènes 3D · rendu',
      pages: [['three_d', '3D']]
    },
    premiere: {
      target: 'premiere', title: 'Adobe Premiere Pro', short: 'Pr', accent: '#c49bff', on: '#191026',
      role: 'Assemblage · chutier',
      pages: [['film', 'ATELIER FILM']]
    }
  };

  const PAGE_SUITE = {
    montage: 'resolve', color: 'resolve', coverage: 'resolve',
    audio: 'fairlight',
    photo: 'photoshop', photoshop: 'photoshop', storyboard: 'photoshop',
    motion: 'aftereffects', effects: 'aftereffects', graphics: 'aftereffects',
    three_d: 'blender',
    film: 'premiere'
  };

  const APPS = {
    resolve: {
      title: 'DaVinci Resolve', short: 'DR', accent: '#f07a45', on: '#1d1108', tagline: 'Montage · étalonnage · Fairlight · livraison',
      role: 'API Python locale : import de médias et titres Fusion dans le projet ouvert. L’espace audio Fairlight passe par la même application.',
      spaces: [['montage', 'MONTAGE'], ['color', 'ÉTALONNAGE'], ['audio', 'FAIRLIGHT'], ['coverage', 'LIVRAISON']],
      help: 'Ouvrir un projet dans Resolve avant d’importer un média. Le test vérifie l’API, il ne modifie aucun projet.'
    },
    photoshop: {
      title: 'Adobe Photoshop', short: 'Ps', accent: '#4aa3ff', on: '#ffffff', tagline: 'Photo · calques · texte',
      role: 'API locale : nouveau document avec texte modifiable, et capture des calques texte pour le motion design.',
      spaces: [['photo', 'PHOTO'], ['photoshop', 'TEXTE'], ['storyboard', 'STORYBOARD']],
      help: 'Le premier test peut demander à macOS l’autorisation de contrôler Photoshop. Aucun document existant n’est modifié pendant le test.'
    },
    after_effects: {
      title: 'Adobe After Effects', short: 'Ae', accent: '#a58bff', on: '#171020', tagline: 'Motion design · compositing',
      role: 'API locale : composition créée avec les textes et les horaires du script. Les calques restent modifiables.',
      spaces: [['motion', 'MOTION'], ['effects', 'VFX'], ['graphics', 'GRAPHIQUES']],
      help: 'Le test crée puis supprime un fichier de contrôle. La composition réelle n’est créée qu’à l’envoi d’une production terminée.'
    },
    blender: {
      title: 'Blender', short: 'Bl', accent: '#ea9a4e', on: '#1c1208', tagline: 'Scènes 3D · rendu',
      role: 'Moteur local : fabrique une scène .blend isolée, puis l’ouvre pour un contrôle caméra, lumière et objets.',
      spaces: [['three_d', 'ANIMATION 3D']],
      help: 'Le test lance Blender en arrière-plan et vérifie sa version. Aucune scène n’est écrasée.'
    },
    premiere: {
      title: 'Adobe Premiere Pro', short: 'Pr', accent: '#c49bff', on: '#191026', tagline: 'Assemblage · chutier',
      role: 'Panneau UXP : dépose les médias d’une production dans le chutier du projet ouvert.',
      spaces: [['film', 'ATELIER FILM'], ['montage', 'MONTAGE']],
      help: 'Premiere exige une action visible : charger le panneau Révélation AI Studio dans Fenêtre → Extensions, puis choisir le dossier du pont. Tant que le panneau n’a pas écrit son heartbeat, le pont reste déclaré inactif.'
    }
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function appRecord(target) {
    const source = (typeof stats !== 'undefined' && stats && stats.apps) || {};
    return source[target] || { installed: false, connected: false };
  }

  function statusInfo(target) {
    const app = appRecord(target);
    const web = typeof boot !== 'undefined' && boot && boot.mode === 'web';
    if (web) return { cls: 'off', label: 'Compagnon Mac requis', detail: 'Les logiciels ne sont joignables que depuis l’application macOS ou le serveur local.', installed: false, connected: false, app };
    if (app.connected) return { cls: 'ok', label: 'Connecté', detail: app.version ? `version ${app.version}` : 'échange récent confirmé', installed: true, connected: true, app };
    if (app.installed) return { cls: 'warn', label: 'Installé · pont inactif', detail: app.last_verified ? 'un test a déjà réussi, à rafraîchir' : 'aucun échange confirmé', installed: true, connected: false, app };
    return { cls: 'off', label: 'Non détecté', detail: app.error || 'vérifier l’emplacement dans la configuration', installed: false, connected: false, app };
  }

  function when(seconds) {
    const value = Number(seconds);
    if (!value || !Number.isFinite(value)) return 'aucun échange récent';
    const date = new Date(value * 1000);
    if (Number.isNaN(date.getTime())) return 'date inconnue';
    return date.toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', dateStyle: 'short', timeStyle: 'short' });
  }

  function directBars(workspace) {
    return Array.from(workspace.children).filter((node) => node.classList && node.classList.contains('wsp-id'));
  }

  function buildIdentityBar(key) {
    const suite = SUITES[key];
    const element = document.createElement('div');
    element.className = 'wsp-id';
    element.dataset.suite = key;
    element.innerHTML = `<div class="wsp-id-app"><span class="wsp-id-logo">${esc(suite.short)}</span><div class="wsp-id-name"><strong>${esc(suite.title)}</strong><small>${esc(suite.role)}</small></div></div>
      <div class="wsp-id-pages">${suite.pages.map(([id, label]) => `<button type="button" class="wsp-id-tab ${page === id ? 'active' : ''}" data-wsp-page="${esc(id)}">${esc(label)}</button>`).join('')}</div>
      <div class="wsp-id-spacer"></div>
      <span class="wsp-id-state off"><i></i><span>Vérification…</span></span>
      <button type="button" class="wsp-id-btn primary" data-wsp-act="test">Tester</button>
      <button type="button" class="wsp-id-btn" data-wsp-act="open">Ouvrir</button>
      <button type="button" class="wsp-id-btn folder" data-wsp-act="folder">Dossier</button>
      <button type="button" class="wsp-id-btn ghost" data-wsp-act="hub">Hub ponts</button>`;
    element.querySelectorAll('[data-wsp-page]').forEach((button) => {
      button.onclick = () => navigate(button.dataset.wspPage);
    });
    element.querySelectorAll('[data-wsp-act]').forEach((button) => {
      button.onclick = () => bridgeAction(button.dataset.wspAct, suite.target, button);
    });
    return element;
  }

  function updateIdentityBar(element, key) {
    const suite = SUITES[key];
    const info = statusInfo(suite.target);
    const state = element.querySelector('.wsp-id-state');
    if (state) {
      state.className = `wsp-id-state ${info.cls}`;
      state.innerHTML = `<i></i><span>${esc(info.label)}</span>`;
      state.title = [info.detail, info.app && info.app.error].filter(Boolean).join(' · ');
    }
    element.querySelectorAll('[data-wsp-act="test"],[data-wsp-act="open"],[data-wsp-act="folder"]').forEach((button) => {
      button.disabled = !info.installed;
      button.title = info.installed ? info.detail : 'Logiciel non détecté sur ce poste';
    });
    element.querySelectorAll('[data-wsp-page]').forEach((button) => {
      button.classList.toggle('active', button.dataset.wspPage === page);
    });
  }

  async function bridgeAction(action, target, button) {
    if (action === 'hub') { navigate('connections'); return; }
    const label = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = action === 'test' ? 'Test…' : action === 'open' ? 'Ouverture…' : '…'; }
    try {
      if (action === 'test') {
        const data = await api(`/api/connections/${target}/activate`, {});
        toast(data.message || data.error || 'Test du pont terminé.');
        await refresh();
        render();
        return;
      }
      if (action === 'open') {
        const data = await api(`/api/connections/${target}/open`, {});
        toast(data.message || 'Ouverture demandée.');
        return;
      }
      if (action === 'folder') {
        const data = await api(`/api/connections/${target}/folder`, {});
        toast(data.message || 'Dossier du pont ouvert.');
      }
    } catch (error) {
      toast(error.message);
    } finally {
      if (button && button.isConnected) { button.disabled = false; button.textContent = label; }
    }
  }

  function flowMarkup(info, title) {
    return `<div class="wsp-hub-flow"><span class="wsp-flow-node ok">STUDIO</span><span class="wsp-flow-arrow">→</span><span class="wsp-flow-node ${info.installed ? 'idle' : 'off'}">PONT LOCAL</span><span class="wsp-flow-arrow">→</span><span class="wsp-flow-node ${info.connected ? 'ok' : info.installed ? 'idle' : 'off'}">${esc(title)}</span></div>`;
  }

  function spaceButtons(spaces) {
    return `<div class="wsp-hub-spaces">${spaces.map(([id, label]) => `<button type="button" class="wsp-space" data-hub-page="${esc(id)}">${esc(label)}</button>`).join('')}</div>`;
  }

  function hubCard(target) {
    const meta = APPS[target];
    const info = statusInfo(target);
    const app = info.app || {};
    const web = typeof boot !== 'undefined' && boot && boot.mode === 'web';
    const actions = ['test', 'open', 'folder'].map((action) => {
      const text = action === 'test' ? 'Tester le pont' : action === 'open' ? 'Ouvrir le logiciel' : 'Dossier du pont';
      const cls = action === 'test' ? ' primary' : '';
      return `<button type="button" class="wsp-id-btn${cls}" data-hub-act="${action}" data-target="${esc(target)}" ${info.installed ? '' : 'disabled'}>${text}</button>`;
    }).join('');
    const version = app.version ? `version ${esc(app.version)}` : 'version non confirmée';
    const mode = app.mode ? esc(app.mode.replaceAll('_', ' ')) : 'mode non confirmé';
    const needs = app.needs_user_action ? `<p class="wsp-hub-note">${esc(meta.help)}</p>` : '';
    const error = app.error ? `<p class="wsp-hub-error">${esc(app.error)}</p>` : '';
    const hint = web ? '<p class="wsp-hub-note">Version navigateur : le hub détecte le compagnon Mac local. Ouvrir cette page depuis l’application macOS ou le serveur local pour tester les ponts.</p>' : (info.installed ? '' : `<p class="wsp-hub-note">${esc(meta.help)}</p>`);
    return `<article class="wsp-hub-card ${info.connected ? 'connected' : ''}" style="--wsp-accent:${meta.accent};--wsp-on-accent:${meta.on}">
      <div class="wsp-hub-head"><span class="wsp-hub-logo">${esc(meta.short)}</span><div class="wsp-hub-title"><strong>${esc(meta.title)}</strong><small>${esc(meta.tagline)}</small></div><span class="wsp-id-state ${info.cls}"><i></i><span>${esc(info.label)}</span></span></div>
      <p class="wsp-hub-role">${esc(meta.role)}</p>
      ${flowMarkup(info, meta.title)}
      ${spaceButtons(meta.spaces)}
      <div class="wsp-hub-meta"><span><strong>${version}</strong></span><span><strong>${mode}</strong></span><span>Dernier test : <strong>${esc(when(app.last_verified))}</strong></span></div>
      <div class="wsp-hub-path">${esc(app.bridge_folder || app.path || 'Emplacement non renseigné')}</div>
      <div class="wsp-hub-actions">${actions}</div>
      ${needs}${error}${hint}
    </article>`;
  }

  function renderHub(workspace) {
    const targets = ['resolve', 'photoshop', 'after_effects', 'blender', 'premiere'];
    const infos = targets.map((target) => statusInfo(target));
    const installed = infos.filter((info) => info.installed).length;
    const connected = infos.filter((info) => info.connected).length;
    const spaces = Object.keys(PAGE_SUITE).length;
    const web = typeof boot !== 'undefined' && boot && boot.mode === 'web';
    workspace.innerHTML = head('PASSERELLES LOGICIELS', 'Chaque logiciel, son espace, sa passerelle.', 'Le Studio parle aux applications installées par leurs API locales. Un pont n’est déclaré actif qu’après une confirmation réelle du logiciel. Les exports et les packs restent disponibles sans pont.', `<button class="secondary" id="wsp-refresh-bridges" type="button">↻ Actualiser</button>`)
      + `<div class="wsp-hub-summary">
        <div class="wsp-sum"><strong>${installed}/5</strong><small>Logiciels détectés</small></div>
        <div class="wsp-sum"><strong>${connected}/5</strong><small>Ponts actifs</small></div>
        <div class="wsp-sum"><strong>${spaces}</strong><small>Espaces reliés</small></div>
        <div class="wsp-sum"><strong>${web ? 'WEB' : 'MAC'}</strong><small>Mode d’exécution</small></div>
      </div>
      <div class="wsp-hub-grid">${targets.map(hubCard).join('')}</div>
      <section class="wsp-hub-section">
        <div class="card card-pad">
          <h3>Comment le pont est vérifié</h3>
          <p class="intro">Le bouton Tester provoque un échange réel avec le logiciel : version Photoshop ou After Effects, version Blender, statut de l’API Resolve, ou heartbeat du panneau Premiere. Le statut revient à « installé · pont inactif » lorsque la confirmation expire : c’est volontaire, pour ne jamais afficher une connexion imaginaire.</p>
          <div class="wsp-hub-legend"><span><i class="wsp-legend-dot ok"></i>échange récent confirmé</span><span><i class="wsp-legend-dot idle"></i>logiciel installé, pont à tester</span><span><i class="wsp-legend-dot off"></i>non détecté ou compagnon requis</span></div>
        </div>
        <p class="wsp-hub-disclaimer">${web ? 'Cette page est servie par la version navigateur. Les cinq applications sont détectées uniquement par le compagnon Mac local ; aucun accès direct au système n’est simulé ici.' : 'Aucun logiciel n’est installé, mis à jour ou modifié automatiquement par le Studio. Les tests peuvent demander une autorisation macOS la première fois. Pour Resolve, ouvrir un projet avant tout import. Pour Premiere, charger le panneau UXP et choisir le dossier du pont.'}</p>
      </section>`;
    const refreshButton = workspace.querySelector('#wsp-refresh-bridges');
    if (refreshButton) refreshButton.onclick = async () => {
      refreshButton.disabled = true;
      try { await refresh(); render(); toast('État des ponts actualisé.'); }
      catch (error) { toast(error.message); }
      finally { refreshButton.disabled = false; }
    };
    workspace.querySelectorAll('[data-hub-page]').forEach((button) => {
      button.onclick = () => navigate(button.dataset.hubPage);
    });
    workspace.querySelectorAll('[data-hub-act]').forEach((button) => {
      button.onclick = () => bridgeAction(button.dataset.hubAct, button.dataset.target, button);
    });
  }

  function syncChrome() {
    const workspace = document.getElementById('workspace');
    if (!workspace || typeof stats === 'undefined' || !stats) return;
    const key = PAGE_SUITE[page];
    const bars = directBars(workspace);
    if (!key) {
      document.body.removeAttribute('data-suite');
      workspace.removeAttribute('data-suite');
      bars.forEach((bar) => bar.remove());
      return;
    }
    const suite = SUITES[key];
    document.body.dataset.suite = key;
    workspace.dataset.suite = key;
    workspace.style.setProperty('--wsp-accent', suite.accent);
    workspace.style.setProperty('--wsp-on-accent', suite.on || '#16120b');
    let bar = bars[0] || null;
    bars.slice(1).forEach((extra) => extra.remove());
    if (!bar) {
      bar = buildIdentityBar(key);
      workspace.prepend(bar);
    } else if (bar.dataset.suite !== key) {
      const replacement = buildIdentityBar(key);
      bar.replaceWith(replacement);
      bar = replacement;
    }
    updateIdentityBar(bar, key);
  }

  const baseRender = render;
  render = function () {
    baseRender();
    const workspace = document.getElementById('workspace');
    if (workspace && page === 'connections' && typeof stats !== 'undefined' && stats) renderHub(workspace);
    syncChrome();
  };

  const workspace = document.getElementById('workspace');
  if (workspace) {
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; syncChrome(); });
    });
    observer.observe(workspace, { childList: true });
  }

  window.StudioWorkspaces = { SUITES, PAGE_SUITE, APPS, syncChrome };
})();
