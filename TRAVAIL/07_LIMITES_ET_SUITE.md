# Limites honnêtes et suite

## 1. Limites fonctionnelles actuelles

### Export

- L'export navigateur est **en temps réel** (`MediaRecorder`). Un montage de 10 minutes prend au moins 10 minutes.
- Le codec dépend du navigateur : MP4/H.264 si disponible, sinon WebM. Electron peut différer du navigateur système.
- Pas d'export alpha (ProRes 4444) dans le navigateur. Cette capacité reste côté Mac/Python.
- L'onglet doit rester au premier plan ; un onglet throttlé peut ralentir ou interrompre l'enregistrement.
- Pas encore de file d'attente d'export, de rendu hors ligne, ni de reprise après interruption.

### Montage

- Une seule piste vidéo est réellement composée à l'écran ; l'empilement V2/V1 fonctionne, mais il n'y a pas encore de modes de fusion avancés.
- Pas de transitions glissées sur la timeline, pas de keyframes d'opacité/volume/transformation, pas d'effets par clip au-delà de l'étalonnage et de la transformation.
- La transformation (X/Y, échelle, rotation) et les fondus entrée/sortie sont des valeurs **fixes** sur la durée du clip, sans animation.
- L'étalonnage est un filtre canvas global par clip (exposition, contraste, saturation, température) ; pas encore de courbes, LUT, qualifier, masque couleur ni power window.
- Les scopes se limitent à la waveform luma et au vectorscope Cb/Cr ; pas de RGB parade ni d'histogramme.
- Les formes d'onde audio sont dessinées, mais il n'y a ni vu-mètres, ni EQ, ni compression, ni normalisation.
- Pas de trim roll/slip/slide, de remappage de vitesse, de multicam ni d'imbrication.
- Pas de sous-titres ni de chapitres exportés.
- Les images acceptent une durée longue ; les vidéos sont limitées à leur durée source.

### Photo

- L'atelier photo est raster : pas de calques vectoriels, de masques de fusion, de groupes, de calques de réglage ni de formats PSD dans l'atelier.
- Le texte est éditable (contenu, taille, police, couleur), mais il n'y a pas encore de styles de paragraphe, de déformation ni de texte sur un tracé.
- Pas d'outils de sélection, de lasso, de plume ni de pinceaux avancés.
- L'historique est limité aux 10 dernières commandes.
- La composition est locale au navigateur ; elle n'est pas incluse dans l'export `.json` du montage.

### Ponts logiciels et habillages

- Les habillages par logiciel (Resolve, Fairlight, Photoshop, After Effects, Blender, Premiere) sont **visuels** : ils reprennent accents, fonds et organisation d'espaces, mais ne réimplémentent pas les moteurs de ces applications.
- Le hub détecte cinq logiciels sur cette machine. Seul le pont **Blender** a été testé de bout en bout dans cette passe (version 5.2.2 LTS).
- **Resolve, Photoshop, After Effects et Premiere** sont détectés installés mais leurs ponts n'ont pas été lancés : les tests peuvent ouvrir des applications lourdes ou déclencher des demandes d'automatisation macOS. Ils restent affichés « Installé · pont inactif ».
- La connexion est vérifiée par heartbeat de moins de 25 secondes. Passé ce délai, l'état retombe à « installé » : aucune connexion n'est conservée artificiellement.
- En mode PWA/navigateur, les ponts natifs ne sont pas joignables ; l'interface affiche explicitement « Compagnon Mac requis » au lieu d'un faux état connecté.
- L'échange reste **par fichiers** (dossier `ponts/<target>` : demandes, heartbeats, confirmations) et par lancement d'outils ; il n'y a pas encore de synchronisation temps réel de la timeline vers Resolve/Premiere.

### Persistance

- Le coffre est **local par navigateur**. Aucune synchronisation multi-appareils automatique.
- Un mot de passe perdu sans clé de secours rend le coffre inaccessible : c'est le prix du chiffrement local.
- Les quotas IndexedDB dépendent du navigateur et de l'espace disque.
- Le projet `.json` ne contient pas les médias ; il faut les réimporter ou transférer le coffre.

### Fournisseurs IA

- **Audit du 2026-11-17** : seules les clés **Tripo** et **Kling** sont présentes dans le profil réel. Tripo répond avec **0 crédit** ; Kling confirme l'accès. Aucune génération cloud payante n'a été lancée. Détail : [08_IA_ET_COMPTES.md](08_IA_ET_COMPTES.md).
- **Ollama** est le moteur réellement actif : 2 modèles, test de génération réussi en 4,89 s. Il est disponible sur Mac/Electron/serveur Python, pas depuis la PWA publiée.
- FreeLLMAPI nécessite une **passerelle fournie par l'utilisateur**. Le connecteur est câblé et testé, mais aucune URL ni clé n'est configurée dans ce profil.
- En PWA, la passerelle doit autoriser CORS. En Electron, le proxy principal évite cette contrainte.
- Les autres adaptateurs payants (Anthropic, Gemini, Veo, Luma, ElevenLabs, etc.) n'ont pas de clé dans ce profil. Leur état reste « clé requise ».
- Les quotas, droits et conditions de chaque service restent ceux du compte utilisateur.

### Distribution

- Le paquet macOS est **non signé Developer ID et non notarié**. Gatekeeper peut afficher un avertissement ; il faut clic droit → Ouvrir, ou signer/notarier avec un compte Apple.
- Le nom du bundle macOS est ASCII (`Revelation Studio.app`) à cause d'un crash observé avec un nom accentué.
- Les cibles Windows (NSIS + portable) et Linux (AppImage) sont configurées mais **non construites ni testées sur cette machine macOS**. Une construction Windows demande Wine ou un runner Windows.
- La PWA exige un contexte sécurisé (HTTPS ou localhost) pour Web Crypto et l'installation.

## 2. Limites de sécurité

- Le proxy Electron protège contre les URL malformées, les secrets dans l'URL, les redirections vers des hôtes non prévus et les IP privées littérales. Il ne protège pas contre un malware déjà présent sur la machine de l'utilisateur.
- Les clés sont stockées dans le profil utilisateur/coffre. Un attaquant avec accès complet à la session peut les lire ; le chiffrement protège le stockage au repos, pas une session compromise.
- Aucun audit de sécurité externe n'a été réalisé.
- Le serveur Python local reste sur loopback ; ne pas l'exposer sur un réseau public sans authentification et reverse proxy.
- Ne jamais committer `data/`, `.env`, clés, sauvegardes ou médias. Le build vérifie des marqueurs, mais la vigilance humaine reste nécessaire.

## 3. Ce qui est réellement vivant aujourd'hui

- Coquille studio professionnelle : menus, onglets, palette `⌘K`, raccourcis `Alt+1…8`, barre d'état.
- Création/déverrouillage du coffre, import de médias, persistance après rechargement.
- Timeline multipiste, trim, split, suppression ripple, undo/redo, zoom, aimantation.
- Recherche dans le pool média, transformation de clip, fondus image/audio, formes d'onde, scopes luma/vectorscope.
- Étalonnage par clip visible au moniteur et à l'export, avec préréglages et undo/redo.
- Atelier photo à calques : pinceau, gomme, formes, texte éditable, remplissage, pipette, opacité, fusion, calques, undo/redo, persistance, export PNG.
- Lecture temps réel avec audio et rendu canvas.
- Export MP4/WebM téléchargé et relu.
- Export/import de projet JSON.
- 20 pages du studio rendues sans erreur.
- Console IA réelle : Ollama local opérationnel, états Tripo/Kling vérifiés en lecture, FreeLLMAPI configurable.
- Application Electron, serveur local, proxy IPC et paquets `.dmg`/`.zip` macOS.
- Habillages par logiciel sur 12 espaces et hub de connexions réel avec cinq cartes.
- Pont Blender réellement testé (5.2.2 LTS), route `/folder` réelle, état honnête par heartbeat.

## 4. Prochaines étapes recommandées

1. **Rendu hors ligne** via FFmpeg (ou pipeline Python) pour des exports rapides, alpha et codecs maîtrisés.
2. **Transitions et keyframes** : fondus croisés, animation d'opacité, de volume, de transformation et d'étalonnage.
3. **Étalonnage avancé** : courbes, LUT, RGB parade, histogramme, masques couleur.
4. **Photo** : masques, groupes, sélections, import/export PSD.
5. **Audio** : EQ, compresseur, vu-mètres, normalisation, automation.
6. **Sous-titres** : import/export SRT, édition sur timeline.
7. **Récupération** : sauvegarde automatique du projet, reprise après fermeture brutale.
8. **Tests E2E automatisés** dans la CI (Playwright ou Electron + CDP) pour rejouer les scénarios de ce dossier.
9. **Windows** : construire et tester sur un runner Windows ; vérifier NSIS et portable.
10. **Signature Apple** : Developer ID + notarisation pour supprimer l'avertissement Gatekeeper.
11. **IA** : recharger le compte Tripo (0 crédit), lancer une génération Kling contrôlée, puis configurer FreeLLMAPI ou une autre clé si l'utilisateur le souhaite.
12. **Accessibilité** : navigation clavier complète de la timeline, libellés ARIA, contrastes.
13. **Ponts Adobe/Resolve** : tester Resolve, Photoshop, After Effects et Premiere sur une machine dédiée, avec autorisations macOS accordées, puis consigner version et heartbeat réels.
14. **Synchronisation timeline** : aller au-delà du dossier de pont (export XML/OTIO vers Resolve/Premiere, rendu Resolve API) sans simuler une connexion.

## 5. Règle pour la suite

Toute nouvelle fonction doit suivre le même critère : interface réelle, persistance, résultat observable, test dans un vrai navigateur ou un vrai processus. Une fonction seulement présente dans le code mais non exercée doit être marquée « non vérifiée », pas « terminée ».

## 6. Limites de l’assistant projet (0.12.0)

- Les six plans sont **procéduraux** : ce sont de vraies images rendues (Canvas 2D), mais ce ne sont pas des prises de vue générées par un modèle vidéo. Aucun modèle cloud n’est appelé sans consentement.
- La voix dépend des voix installées sur le système. Sans voix, le film est assemblé sans voix et le journal l’explique ; le module ne simule jamais une piste vocale.
- L’édition web autonome sans pont système n’a pas accès à la synthèse vocale native. Elle rend images, titres et musique, et l’indique dans l’interface.
- L’aperçu et l’export utilisent MediaRecorder en temps réel. Un master alpha, ProRes ou un rendu plus rapide que temps réel reste du ressort du serveur Mac/FFmpeg.
- La musique est une composition originale synthétisée ; elle ne remplace pas un habillage sonore professionnel avec échantillons licenciés.
- Le test d’export automatisé capture le blob produit (hash et en-tête) au lieu d’écrire un fichier via la boîte de dialogue système. L’utilisateur, lui, reçoit le téléchargement normal.
