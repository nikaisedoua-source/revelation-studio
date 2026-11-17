# Révélation AI Studio — audit avant partage

Date : 25 octobre 2026. Périmètre : sources locales, état GitHub et CI, hébergement de l’édition web, inventaire des moteurs, tests ciblés et vérifications de distribution. Cet audit ne modifie pas les fonctions du logiciel ni les autorisations du site.

## Verdict

Le logiciel est une **bêta privée fonctionnelle de préparation et de création audiovisuelle**, avec un atelier film cohérent, un moteur de titres animés et des exports modifiables. Il n’est pas encore prêt à être distribué comme un studio complet où tous les modèles, comptes et logiciels seraient connectés pour chaque utilisateur.

Les fonctions ajoutées sont de maturités différentes : certaines produisent des fichiers, certaines préparent un travail dans une application, d’autres sont des entrées de catalogue ou des ébauches de connexion. La présentation doit rendre ces distinctions visibles. Les tests réussis ne certifient pas toutes les intégrations annoncées.

## Versions et partage vérifiés

| Élément | État constaté |
|---|---|
| Application Mac / backend | Version 0.5.0 ; serveur local sur 127.0.0.1:8848 |
| Édition navigateur | Version 0.6.0 ; coffre chiffré local au navigateur |
| GitHub | Dépôt privé `nikaisedoua-source/revelation-ai-studio` ; branche principale au commit `bc2fda64b73aaabb8e8887666736d2f74da68b38` |
| CI GitHub | Exécution 40203947630 réussie ; tests et construction web réussis |
| Site hébergé | Actif, version publiée 1 ; projet `appgprj_6add066c06a48191a38477d8d850f8ed` |
| Accès au site | Politique `custom`, un seul utilisateur autorisé : le propriétaire ; aucun groupe |
| Différence locale | `app/server.py` modifié localement pour préparer Google OAuth ; modification non publiée |
| Distribution Mac | Signature ad hoc, aucun TeamIdentifier ; distribution Developer ID et notarisation non établies |

Le lien du site seul ne donne donc pas accès à d’autres personnes. Un partage avec des testeurs demande une décision explicite sur les invitations ou l’audience. Le dépôt source peut rester privé pendant que le logiciel est distribué.

- Site : https://revelation-ai-studio-nikaisedoua.nikaisedoua.chatgpt.site/
- Dépôt : https://github.com/nikaisedoua-source/revelation-ai-studio
- CI : https://github.com/nikaisedoua-source/revelation-ai-studio/actions/runs/40203947630

## État des fonctions

| Domaine | Fonction existante | Limite à annoncer |
|---|---|---|
| Scénario et préproduction | Scènes, actes et temps forts, plans, personnages, décors, accessoires, historique, import Fountain simple | Import incomplet des formats professionnels ; pas d’import général FDX/PDF validé |
| Continuité du film | Identifiants stables, médias associés aux plans, approbations liées au contenu et invalidées après modification | Une bible et des prompts cohérents ne garantissent pas seuls la constance visuelle d’un personnage généré |
| Motion design Mac | Script minuté, typographie animée, aperçu MP4, master ProRes 4444 alpha, sources AE et Fusion | Animations déterministes prévues par le moteur ; pas de réalisation illimitée de tout brief visuel |
| Édition web | Scénario, dossier film, titres animés, animatique d’images, packs Photoshop/couleur/son, sauvegarde chiffrée | Aperçus vidéo navigateur 1280 × 720, 60 secondes maximum ; pas de master alpha natif |
| IA locale | Inventaire de modèles et adaptateurs Ollama/MLX/audio/transcription ; réussites conservées dans des tâches antérieures | Présence des poids et moteur détecté ne prouvent pas qu’une génération complète réussira |
| IA en ligne | Catalogue et variables de configuration de fournisseurs | Les nouveaux services ne sont pas tous câblés ; voir les défauts ci-dessous |
| After Effects | Source JSX et pont local ; création de composition déjà documentée | L’enregistrement et le rendu final du projet hôte restent à contrôler |
| DaVinci Resolve / Fusion | Import de médias par API Resolve ; graphe Fusion `.setting` exporté | Pas de synchronisation générale de toutes les modifications ; conformation Fusion à valider |
| Premiere Pro | Source de panneau UXP et file d’échange préparées | Activation et fonctionnement dans Premiere non validés |
| Photoshop | Document texte éditable par JSX et aperçu PNG | Pas de va-et-vient automatique PSD ↔ Studio pour toutes les modifications |
| Étalonnage | LUT créative Rec.709, CDL et instructions de travail | Pas d’analyse validée de rushs ni d’équilibrage automatique de plans ; gestion colorimétrique à contrôler |
| Transitions et effets | Fondu et surimpressions simples, sources et conseils | Pas de suivi de caméra, rotoscopie, compositing complexe ou bibliothèque complète d’effets |
| 3D | Scène Blender isolée, caméra, lumières, objet et animation de préparation | Le générateur actuel produit un gabarit de cube animé ; il ne transforme pas encore le brief en scène 3D personnalisée |
| Graphiques et cartes | Barres, courbes et carte stylisée animées | Pas de moteur cartographique géographique complet |
| Son | Voix/transcription selon moteur ; fiche de recherche et de licences de sources sonores | Le pack sonore n’est pas une production automatique de bruitages et musique ; moteur musical non opérationnel |
| Hors connexion | Interface web en cache, coffre et travail local après premier chargement | Pas de services distants hors ligne ; navigateur et Mac conservent des espaces distincts |

Les succès dans les logiciels hôtes sont issus des vérifications déjà consignées dans `docs/ETAT_OPERATIONNEL.md`. Cet audit n’a pas relancé les hôtes ni créé de nouveaux documents dans les projets de montage.

## Défauts et priorités

### P0 — éviter une perte de travail dans le navigateur

**Deux onglets peuvent écraser leurs modifications.** Le coffre entier est sauvegardé depuis l’état en mémoire de chaque onglet ; la file de sauvegarde ne protège que son propre contexte JavaScript. Le test isolé a fait créer un projet dans l’onglet A puis un autre dans B : au rechargement, le projet A avait disparu et le projet B subsistait.

Preuves : `web-online/browser-engine.js:11-14` ; reproduction sans données personnelles dans `verification/audit_web_concurrency.cjs`, résultat `verification/audit_web_concurrency.json`.

Correction attendue : verrou d’écriture entre onglets, numéro de révision et détection de conflit au niveau du stockage, relecture avant mutation ou interdiction explicite d’une seconde session d’édition. Un message visuel seul ne suffit pas à garantir la cohérence.

### P0 — ne pas envoyer de clés vers des adresses provisoires

`app/generic_client.py:7-22` contient seulement deux configurations, avec des URL explicitement annotées `Placeholder` pour « Flow IA » et « Adis IA ». Les identités de ces services et leurs interfaces officielles ne sont pas établies par ce connecteur. Aucune clé réelle n’a été envoyée pendant l’audit.

Avant activation : identifier le service exact, utiliser son API officielle et son mode d’authentification documenté. Le service Google Flow du catalogue ne doit pas être assimilé à une adresse API supposée portant un nom voisin.

### P1 — les ajouts cloud sont principalement déclaratifs

L’inventaire contient 13 nouvelles entrées cloud, mais **0 est exécutable par le mécanisme actuel de sélection**. L’inventaire vérifie leur chemin littéral `api` comme s’il s’agissait d’un dossier local et ne dispose pas de moteur correspondant dans son test de disponibilité. Les clés configurées ne corrigent pas ce défaut.

Le connecteur générique ne définit que les deux configurations provisoires citées ci-dessus. Les autres modèles génériques échouent sur « Configuration manquante ». Le statut des fournisseurs vérifie la présence de variables d’environnement, sans prouver une connexion ou un quota utilisable.

Preuves : `app/registry.py:52-68`, `app/generic_client.py:7-22`, `app/providers.py` et sélection de modèle dans `web/studio.js`.

Il faut des adaptateurs explicites par fournisseur : authentification, modèles acceptés, tâche supportée, réponse, téléchargement des fichiers, erreurs, annulation et suivi d’un travail asynchrone. Les crédits gratuits, conditions et droits doivent être vérifiés par service et par compte ; le catalogue ne crée pas de crédit universel.

### P1 — vidéo IA et authentification Google inachevées

Le serveur possède une branche `kind == 'video'`, mais `JobSpec` refuse ce type de tâche avant son exécution. Le connecteur ne définit pas de configuration Veo. La branche ne constitue pas une génération vidéo fonctionnelle.

Preuves : `app/server.py:180-181` et `app/server.py:286` ; validation Pydantic isolée reproduite sans charger le serveur.

L’ajout Google local contient les constantes et les chemins autorisés, mais aucune route de connexion ou de callback. La connexion Google ne fonctionne donc pas actuellement. Une version complète devra traiter le retour fournisseur, la validation des jetons, l’état OAuth et l’association au compte.

### P1 — identifiants de modèles obsolètes

Le client Anthropic demande `claude-3-5-sonnet-20240620`, retiré le 28 octobre 2025. L’entrée Gemini 1.5 Flash correspond à une famille arrêtée le 29 septembre 2025. Un nom commercial affiché ne suffit pas : le modèle réellement demandé doit être supporté et configurable.

Sources officielles consultées :

- Anthropic : https://platform.claude.com/docs/en/about-claude/model-deprecations
- Google : https://ai.google.dev/gemini-api/docs/changelog

### P1 — application Mac dépendante de cette machine

Le lanceur contient le chemin absolu du dossier personnel et du Samsung T7. Le registre et certains ponts contiennent aussi des chemins de cette installation, des versions d’applications Adobe et `/opt/homebrew/bin/python3`. Copier le `.app` sur un autre Mac ne suffit pas à transporter les dépendances, les modèles et la configuration.

Preuves : `MacApp.swift:17-18`, `MacApp.swift:62`, `app/registry.py:4-5`, `app/bridges.py:93`.

Il faut un assistant de premier démarrage, un dossier utilisateur standard, une sélection du disque de modèles, une détection des logiciels et un paquet autonome ou un installateur documenté. La signature actuelle est ad hoc ; une diffusion Mac fluide demande aussi d’établir la stratégie de signature et de notarisation. Aucune validation Windows n’a été réalisée.

### P1 — architecture individuelle à distinguer d’un service collaboratif

Le serveur Mac dispose d’un seul profil. Chaque connexion réinitialise le registre global des sessions. Projets et tâches ne sont pas cloisonnés par utilisateur. Il doit rester un compagnon local individuel tant que l’isolation des comptes n’existe pas.

La version web utilise un coffre local chiffré dans IndexedDB, distinct du profil du Mac : PBKDF2-SHA256, 310 000 itérations, AES-GCM 256. Chaque navigateur a ses données ; il n’existe pas de synchronisation de projets ou de collaboration en temps réel. Le partage du site ne partage pas automatiquement les films.

Le mot de passe du coffre ne dispose pas de récupération validée. L’export chiffré manuel protège une copie mais ne remplace pas le mot de passe. La restauration actuelle est prévue dans un navigateur sans coffre existant. Les médias sont encodés dans l’état complet ; la limite d’un fichier est de 20 Mo et les gros projets nécessitent une autre stratégie de stockage.

Un mot de passe contrôle l’accès au logiciel ou aux données ; il ne rend pas le code JavaScript envoyé au navigateur inaccessible. Garder GitHub privé protège l’accès au dépôt, indépendamment de l’authentification de l’application.

### P2 — régressions du catalogue et contrats de sortie

Les entrées `ace` et `moss_local` présentes dans l’état Git antérieur `b133931` ont disparu du registre actuel. Cela ne prouve aucune suppression de poids sur disque. Vérifier si ce retrait était intentionnel et remettre une indication visible pour les moteurs non pris en charge.

Les fonctions 3D, son, étalonnage et effets doivent indiquer clairement si elles produisent un média final, une source modifiable, une fiche de travail ou une simple proposition. Les intitulés actuels ne doivent pas laisser croire à un moteur de création universel.

## Contrôles et limites de preuve

- 15 tests Python et 4 tests JavaScript réussis pendant cet audit ; CI distante également réussie.
- Tests axés sur conservation du texte, minutage, cohérence des plans, historique, noms de fichiers, manifestes et états de ponts.
- Reproduction supplémentaire de l’écrasement de coffre entre deux contextes JavaScript avec un stockage IndexedDB simulé ; aucun coffre réel touché. Le défaut concerne l’absence de coordination d’écriture ; une validation navigateur complète accompagnera sa correction.
- Inventaire courant : 28 entrées en incluant Ollama ; 13 cloud, 0 cloud exécutable ; 11 entrées locales présentes et 10 déclarées exécutables par le contrôle de configuration. Ces dix déclarations ne sont pas dix générations testées.
- Historique local lu : 20 tâches, dont 16 terminées, 3 échouées et 1 annulée. Cela documente des succès passés et non la disponibilité actuelle de chaque moteur.
- Aucune génération payante ni requête aux connecteurs provisoires. Aucun test de charge, test d’installation sur un autre ordinateur ou audit de sécurité exhaustif.
- Aucun changement d’audience du site, aucune publication, aucune mise à jour des logiciels installés. Aucun dossier Dropbox consulté ou modifié.

## Ordre conseillé pour une version partageable

1. Corriger le conflit entre onglets et tester sauvegarde, restauration, panne et reprise.
2. Retirer ou désactiver les connecteurs provisoires ; vérifier chaque service et remettre les états « catalogue », « configuré », « connexion testée » et « génération validée ».
3. Livrer une première chaîne complète testée : scénario → scène → image → titre animé → export → import dans le logiciel de montage. Commencer avec un fournisseur et un pont réellement validés, puis étendre.
4. Définir la bêta partagée : invitations de testeurs, coffre individuel, limites visibles, sauvegarde et retour d’erreur ; ou choisir une architecture de comptes et de stockage pour un service collaboratif.
5. Rendre le compagnon Mac installable sur une machine vierge, avec détection des applications, dépendances et stockage de modèles ; valider la distribution et sa signature.
6. Compléter ensuite les intégrations avancées : panneau Premiere validé, retour Photoshop, gestion colorimétrique, vidéo IA, scènes 3D personnalisées, bande-son avec preuve de licence.

Critère de sortie : un testeur distinct doit pouvoir accéder au produit, créer et retrouver son projet, produire un résultat, l’ouvrir dans son logiciel et restaurer une sauvegarde, sans utiliser les chemins, les comptes ou les clés du propriétaire.
