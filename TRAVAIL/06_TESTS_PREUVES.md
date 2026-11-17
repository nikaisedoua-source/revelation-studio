# Tests et preuves

Machine de vérification : macOS arm64, Node v24.18.0, Electron 45.3.4.
Date : 2026-11-17.

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
