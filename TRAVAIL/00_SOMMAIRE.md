# Révélation Studio — dossier de travail

Version documentée : **0.12.0**
Date de cette passe : **2026-11-18**
Dossier de code : `REVELATION_STUDIO/`

Ce dossier explique ce qui a été construit, pourquoi, comment le vérifier et ce qui reste limité. Il s'adresse à toute personne qui reprend le code sans avoir participé à la session.

## Sommaire

| Fichier | Contenu |
| --- | --- |
| [01_AUDIT_INITIAL.md](01_AUDIT_INITIAL.md) | état de départ, problèmes constatés, périmètre consolidé |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | rôles des dossiers, flux de données, sécurité |
| [03_DECISIONS.md](03_DECISIONS.md) | décisions techniques et alternatives écartées |
| [04_JOURNAL_2026-11-17.md](04_JOURNAL_2026-11-17.md) | journal daté de la construction et des corrections |
| [05_GUIDE_MONTAGE.md](05_GUIDE_MONTAGE.md) | mode d'emploi réel de l'éditeur timeline, de l'étalonnage et de l'atelier photo |
| [06_TESTS_PREUVES.md](06_TESTS_PREUVES.md) | commandes exécutées et résultats observés |
| [07_LIMITES_ET_SUITE.md](07_LIMITES_ET_SUITE.md) | limites honnêtes, risques, prochaines étapes |
| [08_IA_ET_COMPTES.md](08_IA_ET_COMPTES.md) | audit daté des moteurs IA réellement actifs et des clés présentes |
| [09_COMPARAISON_RESOLVE_PHOTOSHOP.md](09_COMPARAISON_RESOLVE_PHOTOSHOP.md) | comparaison honnête avec Resolve, Photoshop, Premiere, After Effects et Fairlight |

## Ce que fait l'application

- **Habillage studio professionnel** : barre de menus, onglets d'espaces de travail (Média, Montage, Photo, Étalonnage, VFX, Audio, IA Média, Livraison), palette de commandes `⌘K`, barre d'état et raccourcis `Alt+1…8`, dans l'esprit d'un DaVinci Resolve / Photoshop.
- **Habillages par logiciel (0.10.0)** : 12 espaces raccordés à leur logiciel — Resolve (montage, couleur, livraison), Fairlight (mixage), Photoshop (photo, texte, storyboard), After Effects (motion, VFX, graphiques), Blender (3D), Premiere Pro (atelier film). Chaque espace porte une barre d'identité avec l'état réel du pont (`Connecté`, `Installé · pont inactif`, `Non détecté`, `Compagnon Mac requis`), la version détectée et les actions Tester / Ouvrir / Dossier / Hub.
- **Hub de connexions réel** : la page Connexions remplace l'ancien tableau par cinq cartes logicielles alimentées par `stats.apps` ; chaque action appelle une route réelle (`/activate`, `/open`, `/folder`). Aucun pont n'est affiché connecté sans heartbeat récent.
- **Éditeur timeline réel** : médias importés, **recherche dans le pool**, pistes V2/V1/A1/A2, déplacement, coupe, découpe, suppression avec ripple, aimantation, zoom, annuler/rétablir, lecture temps réel, export vidéo MP4/WebM.
- **Transformation et fondus (0.11.0)** : position X/Y, échelle, rotation par clip avec préréglages ; fondus entrée/sortie visibles sur la timeline et appliqués à l'image comme au gain audio.
- **Audio outillé (0.11.0)** : formes d'onde dessinées depuis les pics décodés, volume, mute et fondus par clip.
- **Correctif d'import (0.11.1)** : la durée d'un média audio/vidéo est désormais arrondie **vers le bas** quand l'arrondi frame dépasserait la source ; un fichier de 2,086893 s devient 2,066667 s et s'insère sans être refusé. Un projet de démonstration de 30 s (6 plans, 6 voix, musique, 14 clips) a servi de test réel et a été exporté en MP4 1920 × 1080. Voir [06_TESTS_PREUVES.md](06_TESTS_PREUVES.md#9-passe-0111--correctif-dimport-et-projet-30-s).
- **Étalonnage et scopes réels (0.11.0)** : exposition, contraste, saturation et température par clip, appliqués au moniteur **et** à l'export, avec préréglages Neutre/Ambre/Acier/Contraste, **waveform luma** et **vectorscope Cb/Cr** superposés au moniteur.
- **Atelier photo à calques** : pinceau, gomme, formes, texte, remplissage, pipette, déplacement, opacité, modes de fusion, visibilité, réordonnancement, duplication, historique, persistance IndexedDB et export PNG réel. **Le texte est éditable après création** (contenu, taille, police, couleur, aperçu direct, undo du bitmap).
- **Studio de production** : 20 pages fonctionnelles (atelier film, scénario/découpage, storyboard, images et vidéo IA, motion, graphiques, 3D, Photoshop, étalonnage, effets, audio, fournisseurs, modèles locaux, connexions, contrôle, compte).
- **Trois exécutions avec le même socle web** :
  1. site statique / PWA installable (`web-online/dist/`) ;
  2. application Electron macOS/Windows/Linux (`desktop/`) ;
  3. serveur Python local historique pour les fonctions natives Mac (`app/`).
- **Assistant projet intégré** : `web/project-assistant.js` + fenêtre **Assistant projet** dans Montage. Six plans, titres, musique et voix système, puis assemblage V1/V2/A1/A2 et export, sans quitter l’application. Voir [05_GUIDE_MONTAGE.md](05_GUIDE_MONTAGE.md).
- **Coffre local chiffré** : IndexedDB + PBKDF2-SHA256 (310 000 itérations) + AES-GCM. Les clés et projets ne partent pas vers un serveur applicatif.
- **Fournisseurs IA** : adaptateurs officiels + **FreeLLMAPI** configurable via une passerelle OpenAI-compatible (`FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY`, `FREELLMAPI_MODEL`) + **Ollama local** réellement interrogeable.
- **État IA honnête** : voir [08_IA_ET_COMPTES.md](08_IA_ET_COMPTES.md). Dans le profil audité, seules les clés Tripo et Kling sont présentes ; Tripo répond avec **0 crédit**, Kling confirme l'accès. Ollama fonctionne localement (2 modèles). Les autres moteurs restent câblés mais attendent une clé.

## Démarrage rapide

```sh
cd REVELATION_STUDIO
npm install                 # Electron et electron-builder

npm run web:build           # construit web-online/dist/
npm run desktop             # construit puis lance l'application Electron
npm test                    # 45 tests Node
npm run verify              # syntaxe + tests + build
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'   # 29 tests Python
npm run dist:mac            # .dmg et .zip macOS
```

Pour le serveur Python historique :

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.server:app --host 127.0.0.1 --port 8848
```

## Règle de confidentialité

Le dépôt ne contient **aucun** média personnel, projet, mot de passe, clé API ni modèle lourd. Les dossiers `data/`, `verification/`, `release/`, `.venv/`, `.env*` et les secrets sont exclus par `.gitignore`. Les preuves de test décrites ici sont des résultats de commandes, pas des données privées.
