# Décisions techniques

Chaque décision indique le contexte, le choix, la raison et la conséquence assumée.

## D1 — Timeline avant les autres fonctions

- **Contexte** : l'application savait préparer un film mais ne savait pas l'assembler.
- **Choix** : construire d'abord un éditeur multipiste complet, puis brancher les autres pages autour.
- **Raison** : sans timeline, l'application reste un outil de préproduction, pas un logiciel de montage.
- **Conséquence** : les fonctions IA avancées restent disponibles, mais le cœur vérifiable est le montage.

## D2 — Un seul socle web, trois distributions

- **Contexte** : besoin d'une version web, macOS et Windows sans maintenir trois interfaces.
- **Choix** : source unique `web/`, build statique `web-online/dist/`, servi par PWA, Electron ou Python.
- **Raison** : une seule base de code, un seul jeu de correctifs, un comportement identique.
- **Conséquence** : les différences natives (proxy réseau, ouverture de fichiers externes) passent par des ponts explicites, pas par des forks.

## D3 — Electron + PWA plutôt qu'une application native par plateforme

- **Contexte** : distribuer un vrai exécutable sans réécrire l'interface.
- **Choix** : Electron pour les paquets `.dmg`/`.exe`, PWA pour l'installation navigateur.
- **Raison** : le moteur canvas/WebAudio/MediaRecorder est déjà celui du web ; Electron ajoute le réseau et le système de fichiers.
- **Conséquence** : paquets plus lourds (environ 115 Mo) et signature Apple nécessaire pour une distribution sans avertissement.

## D4 — Coffre local chiffré, pas de compte serveur

- **Contexte** : des projets et des clés API transitent par l'application.
- **Choix** : IndexedDB chiffré par AES-GCM, clé dérivée localement par PBKDF2-SHA256 (310 000 itérations).
- **Raison** : le mot de passe et les clés ne partent pas vers un serveur applicatif ; le mode hors ligne reste complet.
- **Conséquence** : pas de synchronisation automatique entre appareils ; une sauvegarde chiffrée doit être exportée manuellement.

## D5 — FreeLLMAPI comme passerelle configurable, sans URL devinée

- **Contexte** : FreeLLMAPI doit être utilisable, mais aucune adresse officielle stable ne pouvait être certifiée pendant la session.
- **Choix** : connecteur OpenAI-compatible avec `BASE_URL`, `API_KEY`, `MODEL` fournis par l'utilisateur ; HTTPS obligatoire, HTTP toléré uniquement en local.
- **Raison** : éviter une fausse intégration ou une facturation surprise vers un service supposé.
- **Conséquence** : l'utilisateur doit posséder une instance/gateway FreeLLMAPI. Une passerelle locale a servi de preuve de bout en bout.

## D6 — Export via MediaRecorder en temps réel

- **Contexte** : le navigateur ne fournit pas d'encodeur H.264 hors ligne universel.
- **Choix** : `canvas.captureStream` + pistes audio WebAudio + `MediaRecorder`, MP4 si disponible, sinon WebM.
- **Raison** : fonctionne sans serveur ni FFmpeg, produit un vrai fichier lisible.
- **Conséquence** : durée d'export égale à la durée du montage ; l'onglet doit rester au premier plan ; le codec dépend du navigateur.

## D7 — Proxy réseau dans le processus principal Electron

- **Contexte** : les API fournisseurs bloquent souvent les appels navigateur par CORS.
- **Choix** : le renderer appelle `StudioDesktop.fetch`, le processus principal exécute la requête avec validation d'URL et d'en-têtes.
- **Raison** : contourne CORS sans désactiver `webSecurity`, sans exposer Node au renderer.
- **Conséquence** : les secrets traversent l'IPC local ; le proxy applique une liste blanche stricte et ne suit pas les redirections vers des hôtes non autorisés avec les mêmes secrets.

## D8 — Nom de bundle macOS ASCII

- **Contexte** : le paquet `Révélation Studio.app` plantait au démarrage (SIGTRAP), alors que l'ASAR fonctionnait avec Electron de développement.
- **Choix** : `productName: "Revelation Studio"` pour le bundle ; le nom affiché dans l'interface reste « Révélation AI Studio ».
- **Raison** : un nom de bundle accentué déclenchait un crash de signature/renommage des helpers sur macOS.
- **Conséquence** : le nom du fichier `.app` et du menu système est sans accent ; les artefacts et l'interface gardent la marque.

## D9 — Tests navigateur réels, pas seulement unitaires

- **Contexte** : deux bugs critiques (import vide, export bloqué) passaient les tests de modèle.
- **Choix** : exercer l'interface avec un vrai navigateur, un vrai coffre, de vrais médias et un vrai téléchargement.
- **Raison** : les tests de modèle ne voient ni la `FileList`, ni MediaRecorder, ni le DOM.
- **Conséquence** : la procédure de preuve inclut des scénarios manuels automatisés décrits dans `06_TESTS_PREUVES.md`.

## D10 — Dépôt privé séparé, ancien dépôt intact

- **Contexte** : le code historique et les données personnelles ne doivent pas être mélangés.
- **Choix** : nouveau dépôt privé `revelation-studio`, dossier `REVELATION_STUDIO/` comme racine.
- **Raison** : historique propre, périmètre clair, aucun risque de supprimer l'ancien travail.
- **Conséquence** : les deux dépôts coexistent ; ce document décrit uniquement le nouveau.
