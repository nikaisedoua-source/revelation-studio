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
| `web/editor-model.js` | modèle pur UMD : pistes, clips, trim, split, ripple, undo, quantification par frame |
| `web/editor.js` | interface DOM de l'éditeur, lecture, coffre, export |
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
- Un clip porte : `mediaId`, `trackId`, `start`, `duration`, `in`, `volume`, `opacity`, `kind`.
- Toute position est quantifiée à la frame (`1 / fps`) par le modèle.
- Opérations : déplacement, trim gauche/droite, split au playhead, suppression simple ou ripple, duplication, aimantation, zoom.
- L'historique conserve des instantanés complets ; `Ctrl/⌘+Z` et `Ctrl/⌘+Shift+Z` restaurent l'état.

## 4. Persistance

Deux bases IndexedDB distinctes :

| Base | Contenu |
| --- | --- |
| `revelation-studio-web-v1` | coffre du studio : projets métier, médias, historique, clés fournisseurs, sauvegardes |
| `revelation-editor-v1` | projets de montage, médias importés, métadonnées de l'éditeur |

Le coffre est chiffré par AES-GCM. La clé est dérivée du mot de passe par PBKDF2-SHA256, 310 000 itérations. Les gros médias sont découpés en blocs chiffrés. Le schéma 2 emballe la clé maître avec le mot de passe, ce qui permet le changement de mot de passe et la clé de secours sans réécrire tous les médias.

L'éditeur sauvegarde le projet à chaque modification (debounce), et l'indicateur de la barre supérieure montre l'état réel (`Enregistrement…`, `Enregistré à …`).

## 5. Lecture et export

**Lecture** : pour chaque clip vidéo/audio actif, un élément `<video>`/`<audio>` caché est synchronisé sur l'horloge `requestAnimationFrame`. Le rendu vidéo est dessiné dans un canvas ; le son passe par un gain WebAudio maître et un `MediaStreamDestination`.

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

## 7. Sécurité

- **Renderer Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, navigation et `window.open` restreints à l'origine locale.
- **Serveur statique** : chemins résolus sous la racine, refus des traversées, liste blanche MIME, GET/HEAD seulement, fichiers cachés refusés, CSP stricte.
- **Proxy** : URL sans identifiants, HTTPS obligatoire hors loopback, IP privées littérales refusées, en-têtes en liste blanche, refus CRLF, redirections limitées à 5 avec suppression des secrets en changement d'origine, plafond de 512 Mo, délai maximal.
- **Coffre** : secrets classés par nom (`*_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`) et jamais renvoyés en clair par les routes de statut.
- **Build** : `build_web.py` vérifie les marqueurs de secrets et n'inclut pas `data/`, `.env`, clés ou sauvegardes.

## 8. Distribution

- PWA : `manifest.webmanifest`, icônes 180/192/512, service worker versionné `revelation-web-0.8.0`.
- Electron : `electron-builder` produit `.dmg` + `.zip` macOS arm64, et configure NSIS + portable Windows ainsi qu'AppImage Linux.
- Le nom du bundle macOS est volontairement **ASCII** (`Revelation Studio.app`) ; l'interface et le titre restent « Révélation ». Un bundle accentué provoquait un crash au démarrage sur la machine de test.
