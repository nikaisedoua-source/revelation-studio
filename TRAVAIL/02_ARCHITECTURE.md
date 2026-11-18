# Architecture

## 1. Vue d'ensemble

```
                 ┌────────────────────────────────────────────┐
                 │                web/ (source)               │
                 │ studio.js · editor.js · editor-model.js    │
                 │ film.js · integrations.js · styles          │
                 └──────────────────┬─────────────────────────┘
                                    │ npm run web:build
                                    ▼
                 ┌────────────────────────────────────────────┐
                 │           web-online/dist/ (statique)      │
                 │ index.html · PWA · service worker          │
                 │ browser-engine.js · cloud-runtime.js       │
                 └───────┬───────────────┬────────────────────┘
                         │               │
          navigateur/PWA │               │ Electron
                         ▼               ▼
        ┌──────────────────────┐  ┌──────────────────────────────┐
        │ IndexedDB chiffré    │  │ desktop/static-server.cjs    │
        │ StudioVault AES-GCM  │  │ http://127.0.0.1:41888       │
        │ fetch direct + CORS  │  │ préload → IPC → proxy réseau │
        └──────────────────────┘  └──────────────┬───────────────┘
                                                 │ HTTPS
                                                 ▼
                                        fournisseurs IA

        Serveur Python optionnel : app/server.py + app/cloud_client.py
        (fonctions natives Mac, adaptateurs sans contrainte CORS)
```

## 2. Rôles des dossiers

| Chemin | Rôle |
| --- | --- |
| `web/` | source de l'interface et de l'éditeur timeline |
| `web/editor-model.js` | modèle pur UMD : pistes, clips, trim, split, ripple, undo, quantification par frame, étalonnage normalisé |
| `web/editor.js` | interface DOM de l'éditeur, lecture, coffre, export, inspecteur d'étalonnage |
| `web/shell.js` | coquille studio : menus, onglets d'espaces, palette `⌘K`, raccourcis, barre d'état, état IA |
| `web/studio-pro.css` | habillage dense du studio professionnel (menubar, rail, onglets, statusbar, console IA) |
| `web/workspaces-pro.js` | habillages par logiciel, barre d'identité d'espace, hub de connexions réel, actions de pont |
| `web/workspaces-pro.css` | variables d'accent par suite (Resolve, Fairlight, Photoshop, After Effects, Blender, Premiere) et styles du hub |
| `web/photo-editor.js` | atelier photo à calques : outils, composition, historique, IndexedDB, export PNG |
| `web/photo.css` | habillage de l'atelier photo |
| `web/studio.js` | navigation et pages du studio (20 pages) |
| `web-online/browser-engine.js` | moteur local navigateur : coffre, projets, médias, routes `/api/*` simulées |
| `web-online/cloud-runtime.js` | adaptateurs fournisseurs côté navigateur |
| `web-online/dist/` | build statique servi par PWA ou Electron (non versionné) |
| `desktop/main.cjs` | cycle de vie Electron, fenêtre, IPC, proxy |
| `desktop/static-server.cjs` | serveur HTTP local du build, CSP, anti-traversée |
| `desktop/provider-proxy.cjs` | proxy réseau principal, validation d'URL et d'en-têtes |
| `desktop/preload.cjs` | `contextBridge` minimal : `fetch`, `openExternal`, plateforme |
| `app/` | serveur FastAPI et fonctions natives Mac (optionnel) |
| `tests/` | tests Node du modèle, du stockage, du runtime desktop ; tests Python historiques |
| `scripts/build_web.py` | construction reproductible du site et contrôle des secrets |
| `TRAVAIL/` | cette documentation |

## 3. Modèle de l'éditeur

- Projet : `fps`, `width`, `height`, `tracks[]`, `clips[]`.
- Pistes par défaut : **V2, V1, A1, A2** (vidéo en haut, audio en bas).
- Un clip porte : `mediaId`, `trackId`, `start`, `duration`, `in`, `volume`, `opacity`, `kind`, `grade`, `transform`, `fadeIn`, `fadeOut`.
- Toute position est quantifiée à la frame (`1 / fps`) par le modèle.
- `grade` normalise `exposure`, `contrast`, `saturation`, `temperature` dans `[-100, 100]`.
- `transform` normalise `x`, `y` dans `[-1, 1]`, `scale` dans `[0.05, 5]` et `rotation` dans `[-180, 180]`.
- `fadeIn` et `fadeOut` sont quantifiés à la frame et bornés à la durée du clip ; `fadeFactor(clip, t)` renvoie 0 au bord, 1 au centre.
- Opérations : déplacement, trim gauche/droite, split au playhead, suppression simple ou ripple, duplication, aimantation, zoom. Le trim et le split conservent les fondus sur le bon bord.
- L'historique conserve des instantanés complets (150 états) ; `Ctrl/⌘+Z` et `Ctrl/⌘+Shift+Z` restaurent l'état.

## 4. Persistance

Trois bases IndexedDB distinctes :

| Base | Contenu |
| --- | --- |
| `revelation-studio-web-v1` | coffre du studio : projets métier, médias, historique, clés fournisseurs, sauvegardes |
| `revelation-editor-v1` | projets de montage, médias importés, métadonnées de l'éditeur |
| `revelation-photo-v1` | composition photo à calques (bitmaps PNG, ordre, opacité, fusion, nom) |

Le coffre est chiffré par AES-GCM. La clé est dérivée du mot de passe par PBKDF2-SHA256, 310 000 itérations. Les gros médias sont découpés en blocs chiffrés. Le schéma 2 emballe la clé maître avec le mot de passe, ce qui permet le changement de mot de passe et la clé de secours sans réécrire tous les médias.

L'éditeur sauvegarde le projet à chaque modification (debounce), et l'indicateur de la barre supérieure montre l'état réel (`Enregistrement…`, `Enregistré à …`). L'atelier photo déclenche une sauvegarde 2,5 s après la dernière modification.

## 5. Lecture et export

**Lecture** : pour chaque clip vidéo/audio actif, un élément `<video>`/`<audio>` caché est synchronisé sur l'horloge `requestAnimationFrame`. Le rendu vidéo est dessiné dans un canvas ; le son passe par un gain WebAudio maître et un `MediaStreamDestination`. L'étalonnage est appliqué au moment du dessin avec `ctx.filter` (luminosité, contraste, saturation, sépia/rotation de teinte), donc le moniteur et l'enregistrement utilisent exactement le même rendu.

**Export** :
1. le canvas est capturé via `canvas.captureStream(fps)` ;
2. les pistes audio WebAudio sont ajoutées au flux ;
3. `MediaRecorder` enregistre en temps réel (MP4 si le codec est disponible, sinon WebM) ;
4. le blob est téléchargé sous le nom du projet.

Conséquence assumée : un montage de 5 minutes prend au moins 5 minutes à exporter, et l'onglet doit rester actif.

## 6. Fournisseurs et FreeLLMAPI

Trois chemins équivalents :

| Contexte | Chemin réseau |
| --- | --- |
| PWA / navigateur | `fetch` direct depuis la page, CORS du fournisseur requis |
| Electron | `window.StudioDesktop.fetch` → IPC `studio:net` → proxy principal (CORS contourné) |
| Python local | `app/cloud_client.py` → `urllib` |

FreeLLMAPI est traité comme une **passerelle OpenAI-compatible configurable** :

- `FREELLMAPI_BASE_URL` : HTTPS public, ou HTTP uniquement sur `127.0.0.1` / `localhost` / `::1` ;
- `FREELLMAPI_API_KEY` : en-tête `Authorization: Bearer …` ;
- `FREELLMAPI_MODEL` : transmis tel quel ;
- l'URL est normalisée vers `…/v1/chat/completions`, sans interpolation de paramètres non validés.

Aucune adresse d'API n'est devinée : si le service change d'URL, l'utilisateur la fournit.

**Ollama local** : le serveur Python expose une lecture réelle des modèles installés et un test de génération :

| Route | Effet |
| --- | --- |
| `GET /api/local/ollama` | lit `http://127.0.0.1:11434/api/tags` et renvoie les noms de modèles |
| `POST /api/local/ollama/test` | envoie un court prompt à `/api/generate` (`num_predict: 8`) et renvoie la réponse et la durée |

La console **IA & quotas** affiche trois compteurs (modèles Ollama, services cloud configurés, générations vérifiées) et un bouton **Tester les moteurs actifs**. Le test Tripo/Kling est une **lecture de compte**, jamais une génération payante.

## 7. Espaces raccordés et hub de connexions (0.10.0)

`web/workspaces-pro.js` s'exécute après `shell.js` et enveloppe la fonction globale `render`. À chaque rendu, il applique l'identité du logiciel lié à la page :

| Page studio | Suite visuelle | Logiciel cible |
| --- | --- | --- |
| `montage`, `color`, `coverage` | Resolve (orange `#f07a45`) | `resolve` |
| `audio` | Fairlight (cyan `#46c6d8`) | `resolve` |
| `photo`, `photoshop`, `storyboard` | Photoshop (bleu `#4aa3ff`) | `photoshop` |
| `motion`, `effects`, `graphics` | After Effects (violet `#a58bff`) | `after_effects` |
| `three_d` | Blender (ambre `#ea9a4e`) | `blender` |
| `film` | Premiere Pro (lilas `#c49bff`) | `premiere` |

Mécanique :

1. `syncChrome()` pose `data-suite` sur `<body>` et `#workspace`, règle `--wsp-accent`, puis injecte une **barre d'identité** sticky (logo, nom du logiciel, onglets de pages, état du pont, boutons Tester / Ouvrir / Dossier / Hub).
2. Un `MutationObserver` sur `#workspace` réinjecte la barre quand une page remplace son contenu (éditeur, photo, film).
3. `renderHub()` remplace la page Connexions par cinq cartes alimentées par `stats.apps` : état, version, chemin du dossier de pont, dernier test et boutons réels.
4. `statusInfo(target)` ne prétend jamais qu'un pont est actif : en mode web il affiche « Compagnon Mac requis » ; côté Mac il distingue `connected` (heartbeat < 25 s via `api_status.json` + `heartbeat.json`), `installed`, et `absent`.

Routes serveur ajoutées ou utilisées par le hub :

| Route | Effet |
| --- | --- |
| `POST /api/connections/{target}/activate` | lance le test réel du pont (AppleScript Adobe, processus Blender, API Resolve, panneau UXP Premiere) et écrit le heartbeat |
| `POST /api/connections/{target}/open` | ouvre l'application détectée |
| `POST /api/connections/{target}/folder` | crée puis ouvre le dossier `ponts/<target>` (demandes, heartbeats, confirmations) |

Les habillages sont **cosmétiques** ; les états et les actions sont **réels**. C'est le compromis explicite : ressembler à Resolve/Photoshop sans inventer de connexion.

## 8. Sécurité

- **Renderer Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, navigation et `window.open` restreints à l'origine locale.
- **Serveur statique** : chemins résolus sous la racine, refus des traversées, liste blanche MIME, GET/HEAD seulement, fichiers cachés refusés, CSP stricte.
- **Proxy** : URL sans identifiants, HTTPS obligatoire hors loopback, IP privées littérales refusées, en-têtes en liste blanche, refus CRLF, redirections limitées à 5 avec suppression des secrets en changement d'origine, plafond de 512 Mo, délai maximal.
- **Coffre** : secrets classés par nom (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`) et jamais renvoyés en clair par les routes de statut.
- **Build** : `build_web.py` vérifie les marqueurs de secrets et n'inclut pas `data/`, `.env`, clés ou sauvegardes.

## 9. Distribution

- PWA : `manifest.webmanifest`, icônes 180/192/512, service worker versionné `revelation-web-0.11.1`.
- Electron : `electron-builder` produit `.dmg` + `.zip` macOS arm64, et configure NSIS + portable Windows ainsi qu'AppImage Linux.
- Le nom du bundle macOS est volontairement **ASCII** (`Revelation Studio.app`) ; l'interface et le titre restent « Révélation ». Un bundle accentué provoquait un crash au démarrage sur la machine de test.

## 10. Pipeline de rendu 0.11.0

### 10.1 Image

`drawFrame(time)` compose les pistes actives du bas vers le haut. Pour chaque clip visible :

1. la source est dessinée dans un canvas hors écran à sa taille native ;
2. `ctx.filter` applique l'étalonnage (`exposure`, `contrast`, `saturation`, `temperature`) ;
3. `alpha = clip.opacity × fadeFactor(clip, time)` module la transparence ;
4. `transformDraw` centre le clip, applique l'échelle, la translation normalisée et la rotation.

Le même chemin sert au moniteur et à l'export `MediaRecorder` : aucun rendu séparé ne peut diverger.

### 10.2 Audio

`syncAt(time)` calcule le gain de chaque source WebAudio :

```text
gain = piste muette ? 0 : volume du clip × (clip muet ? 0 : 1) × fadeFactor(clip, time)
```

Les fondus sont donc audibles en lecture et inclus dans le flux audio capturé par l'export.

### 10.3 Formes d'onde

À l'import audio, `decodeAudioData` produit un tableau de 1 600 pics normalisés stocké avec le média. Après chaque rendu de timeline, `paintWaveforms()` dessine, pour chaque clip audio visible, la portion `in … in + durée` des pics dans un `<canvas class="ed-wave">` de la largeur du clip. Le dessin est purement visuel et ne modifie pas le média.

### 10.4 Scopes

`renderScopes(force)` copie le moniteur dans un canvas hors écran 320 × 180, puis :

- la **waveform luma** place chaque pixel sur une colonne X et une hauteur Y proportionnelle à sa luminance ;
- le **vectorscope** calcule Cb/Cr et place les pixels autour du centre, avec graticule et cibles R/M/B/C/G/Y.

Le rendu est limité à un rafraîchissement toutes les 120 ms. Le panneau `.ed-scopes` est superposé au moniteur et basculé par `#ed-scopes-toggle` (`S.scopesOpen`).

### 10.5 Pool média

`S.filter` filtre les entrées par nom (insensible à la casse) dans `renderMedia`. Le compteur affiche `n/total` et un message explicite remplace la liste quand aucun média ne correspond. Le filtre est réinitialisé à la fermeture de l'éditeur.

### 10.6 Texte photo

Un calque texte conserve ses propriétés dans `layer.text` (contenu, taille, police, couleur) et son rendu dans le bitmap du calque. `snapshotText()` capture propriétés et pixels ; `commitText()` restaure le bitmap, applique les nouvelles propriétés, redessine et pousse une entrée d'historique `text`. L'undo restaure à la fois le bitmap et les propriétés, ce qui garantit un retour exact même après plusieurs modifications.

### 11. Assistant projet intégré (0.12.0)

Le parcours « fabriquer un film sans sortir du Studio » est réparti en trois couches :

| Couche | Fichier | Rôle |
| --- | --- | --- |
| Génération locale | `web/project-assistant.js` | plans procéduraux, titres PNG, musique WAV, plan de montage |
| Assemblage | `web/editor.js` | assistant modal, import des fichiers, création des clips V1/V2/A1/A2, sauvegarde |
| Voix système | `desktop/system-tts.cjs`, `app/system_tts.py` | synthèse macOS (`say` + `afconvert`), Windows (SAPI), Linux (`espeak-ng`) |

`project-assistant.js` est un module UMD sans dépendance, utilisable dans le navigateur, Electron et Node. `buildPlan` calcule un total de frames exact (`round(duration × fps)`), répartit le reste sur les premières scènes et expose `shots`, `overlays`, `voices` et la musique. Le rendu des plans utilise un PRNG déterministe (FNV + mulberry32) : le même sujet et le même style produisent le même film, ce qui rend les tests reproductibles. Les couleurs viennent de quatre palettes (`ambre`, `acier`, `nuit`, `neon`).

La musique est entièrement synthétisée (pad, basse, arpège, impacts, risers), écrêtée en douceur et normalisée, puis encodée en PCM 16 bits stéréo RIFF/WAVE à 44,1 ou 48 kHz. Aucun échantillon tiers n'est utilisé.

La voix suit deux canaux réels, jamais simulés :

1. **Electron** : `preload.cjs` expose `ttsVoices` et `ttsRender` ; `main.cjs` appelle `system-tts.cjs`. La voix reste sur le poste, sans clé ni réseau.
2. **Serveur local** : `GET /api/tts/system/voices` et `POST /api/tts/system` (protégés par `X-Studio-Token`) utilisent `app/system_tts.py`.

L'édition web autonome sans pont système affiche la raison de l'indisponibilité et continue avec les images, titres et musique. Le module ne prétend jamais avoir produit une voix absente.

L'assemblage se fait après import de tous les fichiers : si un import échoue, le projet courant n'est pas remplacé. Les noms incluent un jeton temporel pour éviter tout relink accidentel. Les durées audio passent par `M.fitDuration` afin de ne jamais dépasser la source après quantification.
