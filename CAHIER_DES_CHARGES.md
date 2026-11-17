# Cahier des charges — Révélation AI Studio

## Intention

Construire un studio local et web de préproduction, génération, motion design
et postproduction qui garde une chaîne cohérente du scénario au master. La
grammaire du cinéma est la règle commune : intention, axe des 180 degrés,
raccord de regard et de mouvement, échelle de plan, focale, lumière motivée,
montage, son, couleur, effets et validation humaine.

## Couverture fonctionnelle

| Besoin | Module | Preuve ou état |
| --- | --- | --- |
| Chaîne écriture → storyboard → production inspirée de ScreenWeaver | Atelier film | Identifiants stables, plan par plan, médias associés, historique, Fountain, animatique réelle |
| Écrire le scénario et débloquer la page blanche | Projet & bible, Scénario & découpage | Modèles locaux, texte source séparé |
| Partir des trois chapitres précédents avant l'annonce | Import teaser Kacou 180–183 | Titres officiels, sources et découpage 30 s préservés |
| Écrire les paroles des personnages | Bible et fiches de scène | Dialogue exact conservé dans JSON/CSV |
| Associer une image à chaque scène | Storyboard & animatique | Prompts, planche et tâches par fournisseur |
| Garder les personnages jusqu'à la fin | Verrous de continuité | Âge, costume, accessoire, regard, axe et palette |
| Générer des titres et du motion design | Motion design | PNG, ProRes 4444 alpha, JSX After Effects, Fusion |
| Créer cartes, graphiques et données animées | Cartes & graphiques | MOV alpha, JSON des données, JSX |
| Préparer les transitions et VFX | Transitions & VFX | Packs inspectables, limites explicites du tracking |
| Préparer Photoshop puis le montage | Texte Photoshop | JSX/UXP, pont local, fichiers éditables |
| Préparer l'étalonnage | Étalonnage | LUT Rec.709, CDL ASC, pipeline et notes Resolve |
| Créer voix, transcription et son | Voix & son | Qwen-TTS validé, Qwen-ASR/OCR, licences sonores |
| Créer une musique ou une mélodie | ACE-Step, Lyria, Suno, Udio | Adaptateur et droits à valider avant rendu final |
| Faire de la 3D et de l'animation | Blender, Tripo, Meshy, Rokoko | Script Blender et fiche caméra/lumière |
| Connecter les agents IA | Catalogue + `connecteurs/providers` | États explicites, aucune clé dans Git |
| Utiliser After Effects, Premiere, Photoshop et Resolve | Passerelles locales | Sources livrées, validation dans chaque logiciel |
| Fonctionner hors ligne | Modèles du Samsung T7 + serveur local | File un moteur lourd à la fois |
| Préparer une version web/GitHub | Dépôt et page statique | `data/`, clés et médias privés exclus du dépôt |
| Protéger le code et l'identité | Session locale | Hash scrypt, profil réalisateur, token local |
| Contrôler la qualité avant livraison | Cahier des charges + diagnostic | Dix contrôles pondérés, preuves locales, actions restantes |
| Rendre chaque pack traçable | Manifeste de production | `PRODUCTION_MANIFEST.json`, SHA-256, checklist de conformation |

## Règle de cohérence

Une production n'est finale que lorsque le dialogue source, les images, les
personnages, le son, les droits, l'espace couleur, le montage et la
conformation ont été contrôlés. Le Studio peut préparer, générer ou ouvrir un
connecteur ; il ne présente jamais une maquette, un prompt ou une offre web
comme un master validé.
