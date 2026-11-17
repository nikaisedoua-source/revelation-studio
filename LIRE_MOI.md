# Révélation AI Studio

Version locale 0.5.0 : [Atelier film connecté](docs/ATELIER_FILM.md), puis [guide du parcours script → motion design](docs/UTILISER_LE_STUDIO.md). Le classement et le stockage de secours sont décrits dans ce guide.

Révélation AI Studio est un poste de préproduction et de postproduction local pour Révélation Studio. Il garde l'intention de l'auteur, les paroles source, la continuité des personnages et les fichiers techniques au même endroit. Il prépare des rendus utilisables dans After Effects, Photoshop, Premiere Pro et DaVinci Resolve/Fusion.

L'application Mac est [Révélation AI Studio.app](./Révélation%20AI%20Studio.app). Le serveur local écoute uniquement sur `127.0.0.1:8848`. Les productions sont écrites sur le Samsung T7 dans `IA_STUDIO_2026/productions_revelation`, ou dans `data/productions_locales` lorsque le disque est absent. Le stockage actif est affiché dans le Studio. Le dossier `data/` contient les projets, les tâches, les imports et les ponts locaux.

## Première ouverture

Au premier lancement, le Studio demande une identité et un mot de passe d'au moins douze caractères. Le mot de passe est dérivé avec `scrypt` versionné dans `data/auth.json`; il n'est pas récupérable à partir du projet et aucune clé de fournisseur n'est mise dans Git. Le serveur accepte les anciens profils avec leurs paramètres historiques, mais toute nouvelle création applique la politique renforcée. Les sessions locales expirent après huit heures d'inactivité et cinq échecs rapprochés déclenchent un verrouillage temporaire. Le mot de passe choisi doit être conservé par le réalisateur.

En cas d'oubli, il n'existe volontairement pas de route web anonyme pour contourner la protection. Fermer le serveur puis lancer `bin/reset_local_access.py`, taper `RESET` à la demande, et relancer l'application. Le script sauvegarde l'ancien hash dans `data/auth_backups/` avec des permissions privées, ne touche pas aux projets ni aux productions, puis affiche à nouveau l'écran de création du profil. Cette récupération exige un accès local au Mac.

Le profil par défaut connaît déjà le dossier `/Users/decassan/Documents/Révélation Studio`, le teaser Kacou 183 sans voix off et les ressources de motion design précédemment préparées. La bible reste modifiable dans la page **Projet & bible**.

## Chaîne de fabrication

1. **Projet & bible** : titre, identité, personnages, costume, accessoires, voix, références et scènes. Le bouton **Charger Kacou 180–183** importe les titres officiels et la direction du teaser existant depuis `TEASER_KACOU_183/V2_CINEMA`, avec ses liens de source et une annonce 183 explicitement marquée comme telle.
2. **Scénario & découpage** : logline, intention, progression, dialogues source et découpage plan par plan.
3. **Storyboard & animatique** : une fiche par scène, prompt image, planche de continuité, EDL et prévisualisation à partir des images importées.
4. **Motion design** : titres animés avec aperçu PNG, MOV ProRes 4444 alpha, source After Effects et source Fusion.
5. **Cartes & graphiques** : cartes stylisées, courbes et barres animées avec transparence et données JSON.
6. **Transitions & VFX** : fondu entre deux plans, overlay de lumière motivée et fiches d'intégration. Un overlay n'est jamais présenté comme un tracking ou une reconstruction 3D.
7. **Texte Photoshop** : aperçu, texte éditable et script de style de calque.
8. **Voix & son** : Qwen-TTS local pour la voix séparée, transcription, OCR, feuille de banque sonore et vérification de licence.
9. **Étalonnage** : LUT Rec.709 créative, CDL ASC et pipeline explicite. La conversion Log/ACES et l'équilibrage plan par plan restent à faire dans Resolve ou Lumetri avec les images de référence.
10. **Connexions** : ponts locaux pour After Effects, Photoshop, Premiere Pro et Resolve. Les fichiers sont d'abord déposés dans `data/ponts/<logiciel>/inbox` afin de rester inspectables.

Toutes les demandes et tous les packs reçoivent `CHARTE_CINEMA.txt` et `REFERENCES.json`. La charte impose l'intention, l'axe des 180 degrés, la continuité des regards et des accessoires, les valeurs de plans, les mouvements motivés, la lumière, le montage, le son, le pipeline couleur et le contrôle humain. Les paroles fournies restent séparées des ajouts proposés par le moteur.

## Contrôle qualité et livraison

La page **Cahier des charges** calcule un score sur dix à partir de dix
preuves locales : bible, paroles source, continuité, storyboard, rendu,
couleur, son et droits, ponts logiciels, moteurs exécutables et sécurité. Le
Studio ne transforme pas un catalogue ou un fichier préparé en validation : un
pont Adobe, Resolve ou Blender doit écrire son heartbeat ou son résultat. Les
actions restantes apparaissent dans la colonne « prochaine action ».

Chaque production terminée contient `PRODUCTION_MANIFEST.json`, avec les
paramètres et l'empreinte SHA-256 de chaque fichier livré, ainsi que
`VALIDATION_CHECKLIST.md`. Le manifeste prouve ce qui a été écrit sur disque;
il ne remplace pas la relecture du master dans le logiciel cible, le contrôle
des scopes, la continuité des personnages ou la vérification des licences.

## IA locales déjà inventoriées

Les poids téléchargés sont dans `/Volumes/Samsung T7/IA_STUDIO_2026/modeles`. Le Studio repère Gemma 4, Qwen3-TTS, Qwen3-ASR, PaddleOCR-VL, MOSS-TTS, ACE-Step, Qwen 3.8, gpt-oss, Qwythos, Kokoro, faster-whisper et les modèles Ollama. La file lance un seul moteur lourd à la fois pour préserver les 24 Go de mémoire partagée du Mac. Qwen3-TTS a été validé après déplacement des métadonnées AppleDouble `._*` qui empêchaient le tokenizer de lire ses poids.

ACE-Step est conservé comme modèle musical local. Son paquet actuel est la variante `mlx-serve`; il faut installer et tester le serveur officiel MLX-Serve avant d'activer un rendu musical. Le Studio ne fabriquera pas une mélodie et ne lui attribuera pas de droits sans moteur et licence confirmés.

## Services gratuits recensés

La page **IA à quota gratuit** contient un catalogue daté du 23 octobre 2026 : Google Flow (50 crédits quotidiens annoncés pour les comptes sans abonnement), Gemini API, Groq, Cloudflare Workers AI (10 000 Neurons par jour), Adobe Firefly (générations gratuites quotidiennes limitées), Runway (125 crédits initiaux), Luma Dream Machine (gratuit limité), OpenCode, ainsi que Pixabay, Mixkit et Freesound filtré CC0 pour le son. GitHub Models est marqué retiré au 30 juillet 2026 afin d'éviter une fausse intégration.

Les services web sont des connecteurs à ton compte : le Studio prépare les prompts, les références et la fiche de droits, mais ne contourne aucun quota, ne crée aucune clé à ta place et ne stocke pas de secret. Les variables d'environnement attendues pour les futurs appels API sont indiquées par le statut du fournisseur (`GEMINI_API_KEY`, `GROQ_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPENCODE_API_KEY`).

Le catalogue couvre maintenant plusieurs familles : agents (OpenCode, Claude Code, Gemini CLI, OpenHands), workflows locaux (ComfyUI, InvokeAI), image (FLUX, OpenAI Images, Ideogram, Leonardo, Stability), vidéo (Kling, Pika, Hailuo/MiniMax, Wan local, Runway, Flow/Veo, Luma), voix et transcription (ElevenLabs, Deepgram), musique (Lyria, Suno, Udio), 3D et animation (Blender, Tripo, Meshy, Rokoko), restauration (Topaz Video AI) et avatar/doublage (HeyGen). La liste est extensible : une entrée signifie « connecteur décrit et état suivi », pas « compte ouvert » ni « rendu déjà exécuté ».

Le contrat technique commun est documenté dans [`connecteurs/providers/README.md`](connecteurs/providers/README.md). Le cahier complet, avec la matrice besoin → module → preuve, est [`CAHIER_DES_CHARGES.md`](CAHIER_DES_CHARGES.md).

## Utiliser les passerelles

- **After Effects** : charger `connecteurs/after_effects/REVELATION_BRIDGE.jsx` via Fichier > Scripts, puis appliquer la demande déposée dans l'inbox.
- **Photoshop et Premiere Pro** : charger leur `manifest.json` dans l'UXP Developer Tool officiel. Les panneaux lisent uniquement le pont local et écrivent un résultat vérifiable.
- **DaVinci Resolve/Fusion** : ouvrir Resolve, activer l'accès aux scripts externes puis tester la connexion. Le bouton d'envoi importe les médias ou prépare un titre Fusion dans le projet ouvert.
- **Blender** : envoyer un pack 3D vers le pont, ouvrir `connecteurs/blender/REVELATION_BRIDGE.py` dans l'espace Scripting et l'exécuter. Le heartbeat puis `result_<id>.json` donnent la preuve de l'échange; le rendu reste sous le contrôle du réalisateur.

Les API locales After Effects et Photoshop ont été testées avec création de composition/document le 24 octobre 2026. Resolve a répondu par son API et le moteur Blender a fabriqué un .blend. Le panneau Premiere UXP demande encore son activation dans l’hôte. Le guide 0.4.0 précise les procédures actuelles.

## Hors ligne et version web

Le mode local fonctionne sans compte distant avec les modèles présents et le Samsung T7. La page web servie sur `127.0.0.1:8848` est la même interface que l'application Mac. Une publication GitHub Pages peut héberger les fichiers statiques et le catalogue, mais elle ne doit pas recevoir `data/auth.json`, les clés API, les rushes ou les productions. Pour conserver les générations locales, lancer le serveur sur le Mac et ouvrir son adresse locale ; pour une version web distante, ajouter un backend authentifié séparé avant de synchroniser des médias.

Le dossier est prêt à être initialisé comme dépôt Git. Aucun remote GitHub n'était configuré au moment de la création, donc aucune donnée n'a été poussée en ligne.

## Sources de méthode et de droits

Le Studio conserve les références publiques AFI et Columbia pour le montage, ACES et ARRI pour le pipeline couleur et Blackmagic pour Resolve. Les liens de licences Pixabay, Mixkit et Freesound sont écrits dans chaque fiche sonore. Toujours garder l'URL de la licence et la date de téléchargement avec le média choisi.
