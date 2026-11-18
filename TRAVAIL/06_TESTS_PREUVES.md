# Tests et preuves

Machine de vérification : macOS arm64, Node v24.18.0, Electron 45.3.4.
Version courante : **0.12.0** (2026-11-18). La section 1 conserve les résultats 0.11.1 ; la section 2 documente la passe courante.

## 1. Tests automatisés

```sh
cd REVELATION_STUDIO
npm test
```

Résultat vérifié :

```
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ duration_ms 444.71025
```

Les tests couvrent :

- quantification frame et timecode ;
- ajout/déplacement/trim/split/ripple ;
- historique complet (undo/redo) ;
- normalisation et rejet de projets invalides ;
- duplication et placement des pistes V1/V2/A1 ;
- stockage navigateur et chiffrement ;
- serveur statique desktop : service, CSP, refus de traversée, méthode non autorisée ;
- proxy : validation d'URL, assainissement d'en-têtes, JSON/binaire, suppression des secrets lors d'une redirection cross-origin.

Vérification complète :

```sh
npm run verify
```

Résultat : syntaxe OK, 32 tests OK, build OK — **20 fichiers, 346 840 octets**.

Tests Python (environnement `.venv` créé avec `requirements.txt`) :

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

```
Ran 29 tests in 0.046s
OK
```

Un test FreeLLMAPI a été adapté pour fournir une `BASE_URL` HTTPS de test ; le serveur Python a aussi été corrigé (deux imports et un décorateur indentés hors bloc, qui empêchaient sa compilation).

## 2. Scénario navigateur réel

Environnement : `http://127.0.0.1:8870/`, coffre de test local, médias de test courts (3 s de vidéo, image, 1,5 s d'audio).

| Étape | Résultat observé |
| --- | --- |
| Création du coffre + reconnexion | OK |
| Import de 3 médias | 3 vignettes, persistance après rechargement |
| Pose des clips | image V2, vidéo V1, audio A1 (découpé 0–1 s et 1–1,5 s) |
| Trim droit par poignée réelle | durée vidéo **3 s → 1 s** |
| Undo via bouton ↶ | **1 s → 3 s** |
| Lecture | tête de lecture 0 → 5 s en temps réel, pause automatique à la fin |
| Rendu moniteur | pixel non vide pendant la lecture |
| Export vidéo | MP4 `ftyp isom`, **74 929 octets**, **5,0016 s**, **1 920 × 1 080**, téléchargé |
| Export projet JSON | 4 clips, 3 médias, clés `app/schema/exportedAt/project/media` |
| Import du JSON modifié | nom « Montage importé test », 4 clips, **0 média manquant** |
| Parcours des 20 pages | toutes rendues, aucune erreur console |

Le trim a été testé avec de vrais événements `pointerdown`/`pointermove`/`pointerup` sur la poignée du clip, pas par appel direct au modèle. L'export a été instrumenté en interceptant `URL.createObjectURL` pour relire le blob avec un élément `<video>`.

Aucun média de test n'est versionné dans le dépôt.

## 3. FreeLLMAPI de bout en bout

Une passerelle locale OpenAI-compatible a été lancée sur `127.0.0.1:8899` avec CORS. Le formulaire **IA & quotas** a été rempli avec :

- `FREELLMAPI_BASE_URL=http://127.0.0.1:8899`
- `FREELLMAPI_API_KEY=mock-key-123456` (clé de test factice)
- `FREELLMAPI_MODEL=mock-model`

Le bouton **Tester** a affiché :

```
connexion vérifiée par la passerelle locale
```

Requête reçue côté passerelle :

```json
{
  "method": "POST",
  "url": "/v1/chat/completions",
  "auth": "Bearer mock-ke...",
  "body": {
    "model": "mock-model",
    "messages": [{ "role": "user", "content": "Réponds seulement : connexion vérifiée." }],
    "max_tokens": 64,
    "stream": false
  }
}
```

Cela prouve : formulaire réel → coffre chiffré → runtime fournisseur → normalisation `/v1/chat/completions` → en-tête Bearer → réponse affichée.

## 4. Electron

### 4.1 Serveur local

Lancement :

```sh
npx electron . --remote-debugging-port=9333
```

Réponse :

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; …
```

### 4.2 Pont IPC et proxy

Évaluation dans la fenêtre Electron via CDP :

- `window.StudioDesktop` : objet présent, `isDesktop: true`, `platform: "darwin"` ;
- `StudioDesktop.fetch` vers la passerelle locale : **HTTP 200**, JSON `choices[0].message.content` reçu ;
- `StudioDesktop.fetch` vers `http://10.0.0.1/secret` : refusé, message « HTTP sans TLS est réservé à localhost. ».

### 4.3 Paquet macOS

```sh
npx electron-builder --mac dmg zip
```

Artefacts :

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.8.0-arm64.dmg` | 115 Mo | `a5e090d54acbd290cc2caa17a40932325bcc29fecd17e6aa72ce857c7dd23e3f` |
| `release/Revelation-Studio-0.8.0-arm64.zip` | 112 Mo | `ede967f1667e5e7e908f43c64577f4e675e3cbe5e323844e055b517ec239ecc5` |

Le binaire du paquet a été lancé directement : processus vivant, serveur `127.0.0.1:41888` répondant **200**. L'application packagée utilise le nom ASCII `Revelation Studio.app` (voir D8).

## 5. Reproduire les preuves

```sh
# 1. tests et build
npm ci
npm test
npm run verify

# 2. site local
python3 -m http.server 8870 --bind 127.0.0.1 --directory web-online/dist

# 3. Electron
npx electron .

# 4. paquet macOS
npm run dist:mac
```

Pour le test FreeLLMAPI, toute passerelle OpenAI-compatible avec CORS convient. Une clé de test locale suffit ; ne jamais versionner une vraie clé.

## 6. Passe 0.9.0 — vérifications réelles

Toutes les preuves ci-dessous ont été observées dans un navigateur réel, sur un serveur local isolé (`127.0.0.1:8871`, profil de test).

### 6.1 Suites automatisées

```sh
node --check web/shell.js
node --check web/photo-editor.js
node --check web/editor.js
node --check web/integrations.js
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run web:build
```

Résultats :

| Commande | Résultat |
| --- | --- |
| `node --check` (éditeur, coquille, photo, intégrations) | aucun message |
| `npm test` | **32 tests, 32 succès, 0 échec** |
| Tests Python | **29 tests, OK** |
| `npm run web:build` | **24 fichiers, 438 641 octets** |

### 6.2 Atelier photo

Scénario exécuté par événements pointeur et clics réels :

1. trait de pinceau sur le calque actif : pixel passé de `[0,0,0,0]` à `[226,192,122,255]` ;
2. **Annuler** : pixel revenu exactement à `[0,0,0,0]` ;
3. **Rétablir** : pixel de nouveau `[226,192,122,255]` ;
4. **Nouveau calque** : 3 → 4 calques ; annuler → 3 ; rétablir → 4 ;
5. opacité réglée à **0,5**, fusion **multiply** ;
6. **Exporter PNG** : téléchargement réel `Revelation-Photo-20261117-2236.png`, **85 Ko**, 1920 × 1080 ;
7. rechargement complet de la page puis reconnexion : composition restaurée avec **4 calques**, opacité **0,5**, fusion **multiply**, `dirty: false`.

### 6.3 Étalonnage dans le montage

1. import d'un PNG de test 320 × 180 ;
2. ajout au playhead, clip présent sur V1 ;
3. exposition réglée à **+70** : le pixel du moniteur passe de `[240,224,176,255]` à `[255,255,255,255]` ;
4. modèle mis à jour : `{ exposure: 70, contrast: 0, saturation: 0, temperature: 0 }` ;
5. libellé de l'inspecteur : `+70` ;
6. **correctif undo** : exposition −50 → −40, `Annuler` restaure −50, `Rétablir` remet −40.

### 6.4 Export vidéo

- `Montage-sans-titre.mp4` téléchargé par un vrai clic de lien ;
- overlay d'export refermé ;
- `exporting: false`, `playing: false` après la fin ;
- durée d'enregistrement observée : environ 5 s pour un clip image de 5 s.

### 6.5 Coquille studio

- menus **Fichier** ouverts avec 10 entrées réelles, fermeture par `Échap` ;
- palette `⌘K` ouverte, filtre `photo` → résultats « Aller à Atelier photo », « Nouvelle composition photo », etc., fermeture par `Échap` ;
- onglets d'espaces présents : Média, Montage, Photo, Étalonnage, VFX, Audio, IA Média, Livraison.

### 6.6 Console IA

Diagnostic **Tester les moteurs actifs** observé :

```text
tripo : accès confirmé · solde 0 crédits
kling : accès confirmé
Ollama qwen2.5-coder:1.5b : OK (4.89 s)
```

Cartes affichées : **2 modèles Ollama**, **2 services cloud** (`kling`, `tripo`), **0 génération vérifiée**. Détail et limites dans [08_IA_ET_COMPTES.md](08_IA_ET_COMPTES.md).

### 6.7 Réseau et secrets

- Aucune clé affichée dans les preuves ; les états viennent de `providers.status()`.
- Les profils de test et leurs données ont été isolés de `data/`.
- Le serveur de test est resté sur `127.0.0.1`. Les captures ne contiennent aucun secret.

### 6.8 Paquet macOS 0.9.0

```sh
npm run dist:mac
```

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.9.0-arm64.dmg` | 120 813 736 octets | `7d41faba588c6b578f5adf5ea92f1cc9a66b05c44af3d41485f4a42e53cf0170` |
| `release/Revelation-Studio-0.9.0-arm64.zip` | 117 308 681 octets | `bf74cdb5978c5e710ccdc749012d3a9999099f91e0b41413d3578f2c8d4acd51` |

Le binaire packagé a été lancé directement : le serveur local `127.0.0.1:41888` a répondu **HTTP 200**, puis le processus a été arrêté. Le paquet reste non signé/non notarié (aucune identité Developer ID disponible).

## 7. Passe 0.10.0 — espaces raccordés et hub réel

Serveur isolé `127.0.0.1:8871`, données de test dans `/tmp/revelation-wsp-test`, profil `Test Workspaces`. Aucune donnée personnelle utilisée, aucun secret affiché.

### 7.1 Suites automatisées

| Commande | Résultat |
| --- | --- |
| `npm test` | **32 tests, 32 succès, 0 échec** |
| `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'` | **29 tests, OK** |
| `npm run verify` | syntaxe + tests + build OK |
| `npm run web:build` | **26 fichiers, 469 249 octets** |

### 7.2 Habillages et barres d'identité

Les 12 pages ont été parcourues dans un vrai navigateur et inspectées par script :

| Page | Suite appliquée | Barre d'identité |
| --- | --- | --- |
| `montage`, `color`, `coverage` | `resolve` | DaVinci Resolve |
| `audio` | `fairlight` | Fairlight |
| `photo`, `photoshop`, `storyboard` | `photoshop` | Adobe Photoshop |
| `motion`, `effects`, `graphics` | `aftereffects` | Adobe After Effects |
| `three_d` | `blender` | Blender |
| `film` | `premiere` | Adobe Premiere Pro |

- `document.body.dataset.suite` et `#workspace[data-suite]` correspondaient à chaque page ;
- la barre affichait logo, nom, onglets et état ; le bouton « Tester » n'était plus étiré sur toute la largeur ;
- `connections` n'affiche aucune barre (elle porte le hub) ;
- aucune erreur console observée pendant la navigation.

### 7.3 Hub de connexions

Avant test :

```text
5/5 LOGICIELS DÉTECTÉS
0/5 PONTS ACTIFS
12 ESPACES RELIÉS
MAC MODE D’EXÉCUTION
```

Cinq cartes réelles : DaVinci Resolve, Adobe Photoshop, Adobe After Effects, Blender, Adobe Premiere Pro, avec version détectée, rôle, dossier de pont et boutons.

### 7.4 Test réel du pont Blender

1. clic **Tester** dans la barre 3D ;
2. réponse serveur : « Moteur Blender testé. Les scènes sont fabriquées dans un processus séparé puis ouvertes en .blend. » ;
3. barre passée à **Connecté · version 5.2.2 LTS**, classe `wsp-id-state ok`, point vert ;
4. hub recalculé à **1/5 PONTS ACTIFS**, carte Blender `version 5.2.2 LTS`, `moteur local`, dernier test `17/11/2026 23:00` ;
5. chemin du pont : `/private/tmp/revelation-wsp-test/ponts/blender`.

### 7.5 Route dossier

- clic **Dossier du pont** sur la carte Blender ;
- réponse : « Dossier du pont ouvert. Les demandes, heartbeats et confirmations y sont conservés. » ;
- Finder ouvert sur le dossier réel ;
- aucune erreur console.

### 7.6 Non testé dans cette passe

Resolve, Photoshop, After Effects et Premiere sont détectés **installés** mais leurs ponts n'ont pas été lancés (ils peuvent ouvrir des applications lourdes ou demander des autorisations macOS). Leur état reste « Installé · pont inactif », jamais « Connecté ».

### 7.7 Paquet macOS 0.10.0

```sh
npm run dist:mac
```

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.10.0-arm64.dmg` | 120 830 618 octets | `283d9883dedf526bf4dfc89e58b31a93149fe5b9e3d3ae8929ecebf725d2d069` |
| `release/Revelation-Studio-0.10.0-arm64.zip` | 117 316 854 octets | `2c867bcc538fe3ce4673b134f1e9017eb004c49be6592b65d86bff56f6c1bb13` |

Le binaire packagé a été lancé directement : le serveur local `127.0.0.1:41888` a répondu **HTTP 200**, puis le processus a été arrêté. Le paquet reste non signé/non notarié (aucune identité Developer ID disponible).

## 8. Passe 0.11.0 — preuves des nouveaux outils

### 8.1 Tests automatisés

```sh
npm test
```

```text
ℹ tests 35
ℹ pass 35
ℹ fail 0
```

Les trois nouveaux cas couvrent :

- normalisation de `transform`, `fadeIn`, `fadeOut` et aller-retour dans un projet sérialisé ;
- rampe de `fadeFactor` : 0 au bord, 0,5 à mi-fondu, 1 au centre ;
- conservation des fondus sur le bon bord après `splitClip` et `trimClipTo`.

```sh
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

```text
Ran 29 tests in 0.056s
OK
```

### 8.2 Fondu image

Scénario navigateur : un clip image sur V1, fondu entrée réglé, playhead déplacé.

| Position | Échantillons peints sur le moniteur |
| --- | --- |
| Avant fondu, milieu du clip | 291 600 |
| t = 0 (début du fondu) | 0 |
| t = moitié du fondu | 35 332 |

Le coin de fondu gauche est présent dans le DOM du clip. L'opacité suit donc réellement la rampe, elle n'est pas seulement affichée.

### 8.3 Transformation

Réglage : échelle 0,5 et X = 0,3. La valeur est relue dans le modèle après transaction. Les échantillons peints passent de 291 600 à **8 831**, ce qui confirme un changement visuel réel et non un simple stockage.

### 8.4 Forme d'onde audio

Un clip audio importé affiche un `<canvas class="ed-wave">` de la largeur du clip. Comptage des pixels non transparents : **1 764**. La forme d'onde est donc dessinée depuis les pics du média, pas un motif décoratif.

### 8.5 Scopes

Après activation du bouton **Scopes** :

| Scope | Pixels allumés |
| --- | --- |
| Waveform luma | 1 599 |
| Vectorscope Cb/Cr | 968 |

Le panneau `.ed-scopes` est visible et superposé au moniteur ; le bouton porte la classe active. Le rafraîchissement est limité à 120 ms.

### 8.6 Recherche média

| Action | Résultat observé |
| --- | --- |
| Saisie « plan » | 1 résultat sur 2, compteur `1/2` |
| Saisie « zzz » | 0 résultat, message « Aucun média ne correspond à « zzz ». » |
| Effacement | 2 résultats restaurés |

### 8.7 Fondu audio

Gain mesuré sur la source WebAudio pendant la lecture d'un clip avec fondu entrée de 1 s :

| Temps | Gain |
| --- | --- |
| 0 s | 0 |
| 0,5 s | 0,5 |
| 1,5 s | 1 |

Après undo, `fadeIn` revient à 0. Le fondu agit donc sur le son réellement joué et exporté.

### 8.8 Texte photo

1. calque texte initial « RÉVÉLATION » ;
2. saisie de « STUDIO TEST » dans le champ : le canvas est mis à jour en direct ;
3. une entrée d'historique **Texte** est créée ;
4. **Annuler** restaure le texte « RÉVÉLATION » **et** le hash exact du canvas d'origine (`undoRestored: true`).

### 8.9 Syntaxe et build

```sh
node --check web/editor.js
node --check web/photo-editor.js
```

Aucun message.

```sh
npm run verify
```

```text
tests 35 · pass 35 · fail 0
{"files": 26, "bytes": 490910}
```

Le build 0.11.0 contient 26 fichiers pour 490 910 octets.

### 8.10 Paquet macOS 0.11.0

```sh
npm run dist:mac
```

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.11.0-arm64.dmg` | 120 832 452 octets | `7fcf35ec537bdef8b692546f9ba38edeab39d1e12eef7b001f2c3f262af40c7f` |
| `release/Revelation-Studio-0.11.0-arm64.zip` | 117 321 607 octets | `bc57fe743d9dc04584fc75f8f58809b15b367a58909125fd14ab47a4fca7b5a0` |

Le binaire packagé a été lancé directement avec `REVELATION_PORT=41911` : le serveur local a répondu **HTTP 200** et `version.json` a renvoyé `0.11.0`. Le processus a ensuite été arrêté. Le paquet reste non signé/non notarié (aucune identité Developer ID disponible).

### 8.11 Test navigateur du build 0.11.0

Service statique local sur `127.0.0.1:8860`, build `web-online/dist/` servi tel quel :

| Contrôle | Résultat |
| --- | --- |
| Éditeur chargé | canvas, timeline, 6 clips et 4 médias restaurés |
| Inspecteur clip | champs `#ed-clip-fadein`, `#ed-clip-fadeout`, `#ed-tr-x`, `#ed-tr-scale`, `#ed-tr-rotation` présents |
| Scopes | panneau masqué au départ, visible après clic, bouton actif, canvas alimentés (`waveLit` 31 200, `vectorLit` 14 640) |
| Recherche | 4 médias → saisie « zzz » → 0 + message vide → effacement → 4 restaurés |
| Photo | 3 calques restaurés, 8 outils, champs `#ph-text-value`, `#ph-text-size`, `#ph-text-font`, `#ph-text-color` présents |

Aucun de ces contrôles n'est décoratif : chacun est relié au modèle ou au rendu décrit dans [02_ARCHITECTURE.md](02_ARCHITECTURE.md).

## 9. Passe 0.11.1 — correctif d'import et projet 30 s

### 9.1 Test de régression

```sh
npm test
```

```text
✔ fitDuration never exceeds the source media after frame quantization
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

Le test rejoue les durées réelles qui ont échoué à l'import :

| Durée source | Ancien comportement | `fitDuration` |
| --- | --- | --- |
| 2,086893 s | 2,1 s → refusé | 2,066667 s |
| 2,96 s | 2,966667 s → refusé | 2,933333 s |
| 1,959 s | 1,966667 s → refusé | 1,933333 s |
| 2,796 s | 2,8 s → refusé | 2,766667 s |
| 29,999 s | 30,0 s → refusé | 29,966667 s |

Contrainte vérifiée : `in + duration ≤ mediaDuration` après normalisation.

### 9.2 Tests, syntaxe et build

```sh
npm run verify
```

```text
tests 36 · pass 36 · fail 0
{"files": 26, "bytes": 491201}
```

Tests Python :

```text
Ran 29 tests in 0.064s
OK
```

### 9.3 Export réel du projet 30 s

Le projet **Révélation — 30 secondes** a été monté puis exporté depuis l'onglet Montage, avec un récepteur HTTP local pour récupérer les fichiers téléchargés.

| Livrable | Taille | Vérification |
| --- | --- | --- |
| `Revelation-30-secondes.montage.json` | 13 590 octets | 14 clips, 4 pistes, 14 médias |
| `Revelation-30-secondes.mp4` | 17 694 486 octets | `mdls` : H.264 + AAC, 1920 × 1080, 30,095 s |

Répartition des clips dans le JSON exporté :

```text
V2 : overlay.png@0 +30
V1 : 6 plans à 0/5/10/15/20/25, 5 s chacun
A1 : 6 voix à 0,8/5,8/10,8/15,8/20,8/25,4
A2 : musique.wav@0 +30
```

Les fichiers sont conservés hors dépôt dans `../Projet_30s_Revelation/`.

### 9.4 Paquet macOS 0.11.1

```sh
npm run dist:mac
```

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.11.1-arm64.dmg` | 120 832 592 octets | `544bc53d3c69a9b4d8ceacc30c1cc8a3b160ad57f29c7504bc4418235d3f4145` |
| `release/Revelation-Studio-0.11.1-arm64.zip` | 117 321 695 octets | `64cefca62edaf53bc1da82a73a9c8177c806bcd75d810335f364f8f7e749bd47` |

Le binaire packagé a été lancé avec `REVELATION_PORT=41912` : **HTTP 200** et `version.json` a renvoyé `0.11.1`. Le processus a été arrêté ensuite. Le paquet reste non signé/non notarié.

## 2. Version 0.12.0 — assistant intégré et voix système

Machine : macOS arm64, Node v24.18.0, Electron 45.3.4. Date : 2026-11-18.

```sh
npm test          # 45 tests Node, 0 échec
npm run verify    # syntaxe + 45 tests + build web
```

Nouveaux tests (`tests/project_assistant_test.cjs`) :

- plan de 30 s à 25 i/s : 6 plans, 750 frames, commence à 0 ;
- durée non divisible (31 s à 25 i/s) : total exact de 775 frames ;
- déterminisme du PRNG et changement avec le sujet ;
- repli des styles inconnus et des durées hors bornes ;
- musique stéréo finie, longueur = durée × fréquence ;
- en-tête RIFF/WAVE, canaux, fréquence, taille des données ;
- rendu des **six motifs × quatre styles** sans couleur indéfinie (régression `filmFrame`) ;
- statut TTS toujours honnête (booléen + raison si indisponible).

Preuves dans l'application réelle (Electron, profil neuf, port de test) :

| Vérification | Résultat |
| --- | --- |
| Voix détectées | 70, voix par défaut `Jacques` (fr_FR) |
| Génération complète | 6,9 s pour 30 s de film |
| Timeline | 19 clips : 6 V1, 6 V2, 1 A1, 6 A2 |
| Durée | 30,000 s à 30 i/s |
| Lecture | timecode avance, 7 médias audio `readyState = 4` |
| Export | MP4 16 490 444 octets, `ftyp isom` |
| Sortie audio | 1 piste dans le flux MediaRecorder |
| SHA-256 du MP4 | `0ab5fe202806ac005341daf44326b4033b466189bbc3fc33e03acb90486a5340` |

Le MP4 a été capturé depuis le blob réel produit par l'export, sans dialogue de sauvegarde, pour automatiser la vérification. Le hash et l'en-tête prouvent un fichier vidéo effectivement encodé.

Captures : `TRAVAIL/preuves/0.12.0-assistant.png`, `TRAVAIL/preuves/0.12.0-timeline-30s.png`.

Vérification de la synthèse système hors application :

```sh
python3 -c "from app import system_tts; import base64; r=system_tts.render({'text':'Le studio fonctionne sans sortir du logiciel.','voice':'Jacques','rate':175}); d=base64.b64decode(r['data']); print(r['mime'], r['voice'], r['backend'], r['bytes'], d[:4], d[8:12])"
# audio/wav Jacques macos 247692 b'RIFF' b'WAVE'
```

### 2.1 Paquet macOS 0.12.0

```sh
npm run dist:mac
```

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `release/Revelation-Studio-0.12.0-arm64.dmg` | 120 854 603 octets | `9a59b4a9cf6a2bcc4dd3a788770a95a0de549b2fe2ca5ee09c305a2cd419ccc7` |
| `release/Revelation-Studio-0.12.0-arm64.zip` | 117 338 754 octets | `b77f15c3bbf6d56aef035fb71c93efedea7b30e820c14fc2f7d48ef0a4b63192` |

Contrôles dans le paquet :

- `release/mac-arm64/Revelation Studio.app/Contents/Resources/app.asar` contient `desktop/system-tts.cjs` et les 27 fichiers du build web, dont `web-online/dist/project-assistant.js` ;
- le fichier `project-assistant.js` extrait de l'asar est **octet pour octet identique** à `web/project-assistant.js` ;
- application packagée lancée avec `--remote-debugging-port`, profil neuf : `StudioDesktop.ttsVoices` et `StudioDesktop.ttsRender` présents ;
- `ttsVoices()` renvoie `available: true`, backend `macos`, **70 voix** ;
- `ttsRender({text, voice:'Jacques', rate:180})` renvoie `audio/wav`, backend `macos`, **266 060 octets**, en-tête base64 décodé `RIFF…WAVE`.

Hashes des sources livrées :

| Fichier | SHA-256 |
| --- | --- |
| `web/project-assistant.js` | `57f5672a113b0e6d424bdf448b84fc302038256422a20d23261aef6fabfce8e8` |
| `desktop/system-tts.cjs` | `ff324981ac91ffd6615d39290c1343d399f2fa0518e552f9622a4a528d48f8b9` |
| `app/system_tts.py` | `74b87043758723eaedb800dbc15cd9833c9c212cc6bf83c9096a7541a4f3f89a` |

Le paquet reste non signé/non notarié (aucune identité Developer ID sur la machine).

### 2.2 Version web publique

| Vérification | Résultat |
| --- | --- |
| Workflow | `Mettre la version web en ligne`, exécution `44265034607`, build et deploy verts |
| URL | https://nikaisedoua-source.github.io/revelation-studio/ |
| `version.json` | `0.12.0`, édition `browser` |
| Module assistant | `window.StudioProjectAssistant` = objet chargé |
| Service worker | actif, portée `/revelation-studio/`, cache `revelation-web-0.12.0` |
| Console | aucune erreur |
| Parcours | coffre créé sur l'origine publique, espace de travail puis Montage avec V2/V1/A1/A2 |

Le déploiement se refait automatiquement à chaque poussée sur `main` via `.github/workflows/pages.yml`.
