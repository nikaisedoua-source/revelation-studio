# Révélation AI Studio

Version 0.8.0 — scénario, storyboard, motion design et **montage vidéo multipiste**.

- **Éditeur timeline** : médias chiffrés, pistes V2/V1/A1/A2, trim, split, ripple, aimantation, undo/redo, lecture temps réel et export MP4/WebM.
- **Édition Mac** : serveur Python local, rendu ProRes alpha, modèles installés et ponts After Effects, Photoshop, Resolve, Premiere et Blender selon leur configuration.
- **Édition navigateur / PWA** : atelier film, références, historique, exports de projet, aperçu motion vidéo, animatique d’images et sources modifiables. Les projets restent dans un coffre chiffré propre au navigateur.
- **Applications Electron** : le même socle web est servi localement, avec un proxy réseau dans le processus principal pour joindre les API sans contrainte CORS.

La version web privée est hébergée séparément du dépôt de code. Aucun projet personnel, mot de passe, média ou poids IA n’est inclus dans ce dépôt.

**Documentation de construction et de vérification : [TRAVAIL/00_SOMMAIRE.md](TRAVAIL/00_SOMMAIRE.md).**

## Démarrer sur Mac

L’installation existante de Révélation AI Studio reste disponible. Pour une nouvelle installation, créer un environnement Python puis installer `requirements.txt` ; les moteurs MLX et leurs modèles sont optionnels et nécessitent leurs adaptateurs propres.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.server:app --host 127.0.0.1 --port 8848
```

Ouvrir <http://127.0.0.1:8848>. Les applications sont détectées dans /Applications et ~/Applications. Les chemins de modèles, données, productions et FFmpeg peuvent être configurés avec les variables documentées dans `.env.example`. Le lanceur Mac trouve le projet à côté du `.app` ou dans ses ressources. Un autre Mac a encore besoin de Python et des dépendances du compagnon ; la signature Developer ID et la notarisation ne sont pas fournies. Le binaire FFmpeg fourni est celui de l’installation Mac ; sur une autre plateforme, utiliser un binaire compatible.

## Montage vidéo

Ouvrir la page **Montage vidéo** : importer des médias, les glisser sur la timeline (V1 pour la vidéo de base, V2 pour l’image/incrustation, A1/A2 pour le son), rogner par les poignées, couper avec `S`, supprimer avec `Maj+Suppr`, lire avec `Espace`, exporter avec **Exporter la vidéo**. Le projet et les médias restent dans le coffre chiffré ; **Projet .json** permet de transférer la structure.

L’export navigateur est en temps réel : garder l’onglet actif. Le format est MP4 si le codec est disponible, sinon WebM. Guide détaillé : [TRAVAIL/05_GUIDE_MONTAGE.md](TRAVAIL/05_GUIDE_MONTAGE.md).

## Applications Electron et PWA

```sh
npm install
npm run web:build
npm run desktop          # lance l'application Electron
npm run dist:mac         # produit release/*.dmg et release/*.zip
npm run dist:win         # cible Windows (NSIS + portable, à construire sur Windows ou avec Wine)
```

Le paquet macOS est non signé/non notarié et son bundle est volontairement nommé `Revelation Studio.app` (nom ASCII ; l’interface affiche « Révélation »). Pour la PWA, servir `web-online/dist/` en HTTPS ou sur localhost : le service worker et le manifeste permettent l’installation.

## Construire la version web manuellement

```sh
python3 scripts/build_web.py
python3 -m http.server 8860 --bind 127.0.0.1 --directory web-online/dist
```

Ouvrir <http://127.0.0.1:8860>. Le navigateur doit supporter Web Crypto, IndexedDB, Canvas et, pour la vidéo, MediaRecorder. Conserver la page au premier plan pendant l’export. Le master ProRes 4444 alpha reste produit sur le Mac.

## Confidentialité et sauvegarde

Le dépôt doit rester privé. Le site publié garde son audience privée. Le coffre navigateur utilise PBKDF2-SHA256 et AES-GCM ; son mot de passe n’est pas envoyé à un serveur. Le profil web est indépendant du profil Mac. Télécharger une sauvegarde du coffre chiffré depuis l’espace de travail pour transférer les données entre appareils. Créer une clé de secours depuis Compte & sauvegarde. Elle permet de remplacer le mot de passe en conservant le coffre. Les anciens coffres sont migrés après un changement de mot de passe. Sans mot de passe ni clé préalablement créée, le coffre chiffré reste inaccessible.

Les dossiers `data/`, `.venv/`, les productions et les secrets sont exclus de la publication. L’interface web ne contacte pas automatiquement les logiciels ni les modèles locaux. Le bouton compagnon ouvre uniquement l’adresse locale du Studio sur l’appareil où il est installé.

## Connexions IA et échanges

La page **IA & quotas** contient les formulaires des adaptateurs officiels. Chaque utilisateur fournit ses propres identifiants. Les clés du propriétaire ne sont jamais intégrées à l’édition web. Le compagnon conserve les clés dans un fichier privé du profil, mode 0600, exclu de Git. Le navigateur les conserve dans son coffre chiffré. « Configuré » et « génération vérifiée » sont deux états distincts.

Texte : Anthropic, Gemini, Groq, Mistral, OpenRouter, Cloudflare, Cohere et **FreeLLMAPI**. Image : Gemini Image. Vidéo : Veo, Kling et Luma. Voix : ElevenLabs. 3D : Tripo. Les modèles peuvent être changés dans les formulaires ; le compte du fournisseur doit autoriser leur utilisation. Les crédits d’une application web ne sont pas nécessairement ceux de son API. Certains navigateurs peuvent refuser une requête API distante ; l’application Electron et le compagnon exécutent les requêtes hors de cette contrainte CORS.

FreeLLMAPI est une passerelle OpenAI-compatible configurable : renseigner `FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY` et `FREELLMAPI_MODEL` dans **IA & quotas**, puis lancer **Tester · courte génération**. HTTPS est requis pour une adresse publique ; HTTP n’est accepté que sur `127.0.0.1`/`localhost`. L’URL est normalisée vers `…/v1/chat/completions`.

Le mode OpenCode local utilise le composant 2.1.4 installé séparément dans `data/tools/opencode`, avec Ollama. La politique de cette exécution refuse les outils : il fournit des propositions à relire, sans modifier le projet. Le composant n’est pas inclus dans le dépôt.

Dans **Images & vidéo IA**, choisir projet et plan, préparer le prompt avec sa bible et ajouter les références. Une production terminée peut être associée au plan. Les références Veo demandent 8 secondes. Dans **Texte Photoshop**, capturer les calques texte actifs puis lancer leur animation : PNG avec styles, copie PSD modifiable, aperçu MP4 et master alpha. Chaque capture crée une nouvelle version.

Le son de secours est procédural : souffle, impact, montée et nappe WAV, sans prétendre à une inférence musicale. Une scène 3D locale produit un fichier Blender et un rendu de contrôle quand Blender est installé. Tripo produit un vrai GLB si le compte possède les crédits nécessaires.

Le Studio Mac est individuel et reste sur loopback. L’édition web est un coffre par navigateur, sans collaboration ou synchronisation serveur automatique. Le partage du site doit être configuré séparément ; cette version conserve son audience privée.

## Documentation et contrôles

- [Dossier de travail](TRAVAIL/00_SOMMAIRE.md) — audit, architecture, décisions, journal, guide de montage, preuves, limites
- [Guide général](LIRE_MOI.md)
- [Atelier film](docs/ATELIER_FILM.md)
- [Motion et logiciels](docs/UTILISER_LE_STUDIO.md)
- [État opérationnel daté](docs/ETAT_OPERATIONNEL.md)

```sh
npm test                 # 32 tests Node
npm run verify           # syntaxe + tests + build
.venv/bin/python -m unittest discover -s tests -v
```

GitHub Actions vérifie la syntaxe de l’éditeur, les tests et la construction web. Aucune mise à jour des logiciels de création n’est lancée par ce projet. Dropbox est exclu de son périmètre de travail.
