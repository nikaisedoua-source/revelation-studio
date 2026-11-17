# Pont Blender

Le Studio dépose les packs 3D dans la production sur le Samsung T7 :

- `THREE_D_SHOT_SPEC.json` décrit le plan et ses contraintes de continuité ;
- `BLENDER_SCENE.py` crée une scène préparatoire modifiable ;
- `THREE_D_PREVIEW.png` est uniquement une carte de repérage ;
- `BLENDER_README.md` rappelle les contrôles avant rendu.

Pour activer le pont, envoyer un pack 3D depuis **Connexions**, ouvrir
`REVELATION_BRIDGE.py` dans l'espace **Scripting** de Blender et l'exécuter.
Le script écrit `data/ponts/blender/heartbeat.json`, charge une demande à la
fois et écrit `result_<id>.json`. Le Studio ne considère le pont actif qu'après
ce heartbeat; il ne lance pas Blender à distance et ne déclenche pas un rendu
sans validation du réalisateur.

Le script ne lance pas Blender et n’exécute aucune commande à distance. Ouvrir Blender, relire le script et valider caméra, axe, matériaux, textures, licences et éclairage avant de lancer le rendu. Importer ensuite le résultat dans Resolve, Premiere ou After Effects comme média rendu ou séquence d’images.
