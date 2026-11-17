# Révélation Studio — dossier de travail

Version documentée : **0.8.0**
Date de cette passe : **2026-11-17**
Dossier de code : `REVELATION_STUDIO/`

Ce dossier explique ce qui a été construit, pourquoi, comment le vérifier et ce qui reste limité. Il s'adresse à toute personne qui reprend le code sans avoir participé à la session.

## Sommaire

| Fichier | Contenu |
| --- | --- |
| [01_AUDIT_INITIAL.md](01_AUDIT_INITIAL.md) | état de départ, problèmes constatés, périmètre consolidé |
| [02_ARCHITECTURE.md](02_ARCHITECTURE.md) | rôles des dossiers, flux de données, sécurité |
| [03_DECISIONS.md](03_DECISIONS.md) | décisions techniques et alternatives écartées |
| [04_JOURNAL_2026-11-17.md](04_JOURNAL_2026-11-17.md) | journal daté de la construction et des corrections |
| [05_GUIDE_MONTAGE.md](05_GUIDE_MONTAGE.md) | mode d'emploi réel de l'éditeur timeline |
| [06_TESTS_PREUVES.md](06_TESTS_PREUVES.md) | commandes exécutées et résultats observés |
| [07_LIMITES_ET_SUITE.md](07_LIMITES_ET_SUITE.md) | limites honnêtes, risques, prochaines étapes |

## Ce que fait l'application

- **Éditeur timeline réel** : médias importés, pistes V2/V1/A1/A2, déplacement, coupe, découpe, suppression avec ripple, aimantation, zoom, annuler/rétablir, lecture temps réel, export vidéo MP4/WebM.
- **Studio de production** : 20 pages fonctionnelles (atelier film, scénario/découpage, storyboard, images et vidéo IA, motion, graphiques, 3D, Photoshop, étalonnage, effets, audio, fournisseurs, modèles locaux, connexions, contrôle, compte).
- **Trois exécutions avec le même socle web** :
  1. site statique / PWA installable (`web-online/dist/`) ;
  2. application Electron macOS/Windows/Linux (`desktop/`) ;
  3. serveur Python local historique pour les fonctions natives Mac (`app/`).
- **Coffre local chiffré** : IndexedDB + PBKDF2-SHA256 (310 000 itérations) + AES-GCM. Les clés et projets ne partent pas vers un serveur applicatif.
- **Fournisseurs IA** : adaptateurs officiels + **FreeLLMAPI** configurable via une passerelle OpenAI-compatible (`FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY`, `FREELLMAPI_MODEL`).

## Démarrage rapide

```sh
cd REVELATION_STUDIO
npm install                 # Electron et electron-builder

npm run web:build           # construit web-online/dist/
npm run desktop             # construit puis lance l'application Electron
npm test                    # 32 tests Node
npm run verify              # syntaxe + tests + build
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
