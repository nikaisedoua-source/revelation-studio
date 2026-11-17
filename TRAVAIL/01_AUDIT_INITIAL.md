# Audit initial et périmètre

Date : 2026-11-17
Base inspectée : application Révélation AI Studio historique (serveur Python + interface web), plus le runtime navigateur `web-online/`.

## 1. Ce qui existait

| Élément | État constaté |
| --- | --- |
| `app/server.py` | serveur FastAPI local, 48 décorateurs de routes, orienté studio Mac |
| `app/cloud_client.py` | adaptateurs IA officiels (texte, image, vidéo, voix, 3D) |
| `web/` | interface du studio, atelier film, storyboard, motion, fournisseurs |
| `web-online/` | runtime navigateur, coffre chiffré, moteur de production web |
| `bin/`, `MacApp.swift`, `connecteurs/` | lanceur et ponts logiciels Mac |
| `data/`, productions | données personnelles, exclues du dépôt |

L'application n'avait **pas d'éditeur timeline**. Le « montage » s'arrêtait à la préparation de plans et à des aperçus motion. Il n'existait ni pistes, ni trim, ni lecture multi-clips, ni export d'un montage complet.

## 2. Problèmes concrets relevés

1. **Import de médias silencieux** : le gestionnaire vidait `input.value` avant de lire `input.files`, ce qui vidait la `FileList` vivante. Aucun média n'était importé et aucun message ne l'expliquait.
2. **Mauvaise piste par défaut** : une vidéo pouvait être posée sur V2 au lieu de V1, contrairement à la convention de montage.
3. **Export vidéo bloqué** : l'export activait `S.exporting` avant d'appeler `play()`, or `play()` refusait de démarrer pendant un export. L'enregistrement restait à 0 %.
4. **Nom de bundle macOS accentué** : le paquet `Révélation Studio.app` construit par electron-builder plantait au démarrage (SIGTRAP). L'ASAR était sain ; le renommage ASCII du bundle a corrigé le lancement.
5. **Absence de passerelle FreeLLMAPI** alors que le service devait être utilisable.
6. **Pas de socle desktop** : aucune fenêtre Electron, aucun pont réseau hors CORS, aucun paquet installable.

## 3. Périmètre retenu

- Consolider **uniquement le dossier de code** dans `REVELATION_STUDIO/`. Les dossiers de médias, projets et productions restent hors dépôt.
- Construire d'abord un **éditeur timeline réel**, utilisable immédiatement, avant d'étendre les autres pages.
- Distribuer le même socle web sous trois formes : **PWA installable**, **application Electron** (macOS/Windows/Linux), **serveur Python local optionnel**.
- Créer un **nouveau dépôt GitHub privé** `revelation-studio` sans toucher à l'ancien dépôt.
- Rendre chaque fonction visible réellement opérationnelle : importer, monter, écouter, exporter, configurer un fournisseur, tester une connexion.

## 4. Ce qui n'a pas été fait volontairement

- Aucun média, projet, mot de passe ou clé API n'a été copié dans le dépôt.
- Aucun quota ni compte fournisseur n'a été acheté ou utilisé pendant les tests : les appels réels ont été simulés par une passerelle OpenAI-compatible locale pour FreeLLMAPI, et les autres adaptateurs n'ont pas été facturés.
- Aucune synchronisation multi-appareils n'a été inventée : le coffre reste local par navigateur, avec export de sauvegarde.
- Aucun certificat Developer ID Apple n'étant disponible, le paquet macOS est non signé/non notarié ; Gatekeeper peut demander une confirmation.

## 5. Critère de réussite utilisé

Une fonction est considérée « vivante » seulement si :

1. elle possède une interface réelle dans l'application ;
2. elle écrit ou lit des données persistées ;
3. elle produit un résultat observable (fichier, média, réponse, état) ;
4. elle a été exercée dans un vrai navigateur ou un vrai processus Electron, pas seulement testée en unité.
