# Révélation AI Studio — guide de fabrication

## Première animation

1. Ouvrir l’application Révélation AI Studio puis se connecter avec son mot de passe habituel.
2. **Espace de travail → Ouvrir le motion design**.
3. Coller les textes à afficher, un carton par ligne. Pour contrôler les horaires :

```
0-6 | PREMIER TEXTE | Sous-titre | fondu
6-13 | DEUXIÈME TEXTE | Sous-titre | montee
13-21 | TROISIÈME TEXTE | Sous-titre | zoom
21-30 | ANNONCE FINALE | Bientôt disponible | fondu
```

4. Choisir durée, cadence, style et couleur. **Préparer le minutage** signale les chevauchements, les horaires invalides et les temps de lecture courts.
5. **Générer aperçu + master transparent**. Attendre « Terminé », lire l’aperçu MP4 et télécharger ou retrouver les sources.
6. Envoyer la composition dans After Effects, ou le média transparent dans Resolve. Pour Premiere, activer le panneau UXP puis appliquer la demande déposée dans le pont.

Une ligne libre est un texte à afficher. Les consignes de réalisation se placent dans l’aide IA. La proposition IA reste séparée : la relire puis copier les lignes choisies dans le script.

## Fichiers fournis

- APERCU_MOTION.mp4 : aperçu H.264 avec fond sombre.
- MOTION_TRANSPARENT.mov : ProRes 4444 avec transparence, Full HD, à superposer dans le montage.
- motion_after_effects.jsx : composition avec calques de texte et images clés modifiables.
- motion_fusion.setting : graphe TextPlus, mouvements et fondus modifiables. Configurer la composition sur la durée/cadence du plan puis relier Resultat à MediaOut.
- SCRIPT_SOURCE.txt / MOTION_PLAN.json : texte original et minutage.
- RENDER_VALIDATION.json : décodage complet, nombre d’images et contrôle alpha.
- PRODUCTION_MANIFEST.json : paramètres et empreintes des fichiers.

Le script ne déclenche aucune exécution de code utilisateur. Le rendu et les sources natives utilisent des moteurs typographiques différents : relire la composition native avant de livrer le master.

## Classement

Avec le T7 connecté : `IA_STUDIO_2026/ESPACE_DE_TRAVAIL` et `productions_revelation`.
Sans le T7 : `REVELATION_AI_STUDIO/data/ESPACE_DE_TRAVAIL` et `data/productions_locales` sur le Mac. Le Studio indique le stockage actif. Rebrancher le disque pour accéder aux productions et modèles qui s’y trouvent. Les fichiers locaux ne sont pas déplacés automatiquement au rebranchement.

Les dossiers 01 à 10 suivent écriture, références, storyboard, motion, 3D, Photoshop, son, postproduction, montage et livraisons. Les liens pointent vers le dossier original de chaque génération. Aucun rush existant n’est déplacé. Le dossier 10 accueille les masters approuvés manuellement.

## Logiciels

- **After Effects** : « Activer le pont » vérifie l’API locale. Le bouton Composition After Effects crée une nouvelle composition dans le projet ouvert, sans l’enregistrer automatiquement. Enregistrer le projet depuis After Effects.
- **Photoshop** : la même API crée un nouveau document avec texte modifiable. Enregistrer son PSD depuis Photoshop.
- **Resolve** : ouvrir un projet, tester la connexion, puis envoyer le rendu. Il arrive dans le chutier ; placer le clip sur la piste appropriée.
- **Blender** : tester le moteur puis envoyer un pack 3D. Le Studio fabrique un .blend dans un processus isolé et demande son ouverture dans une autre fenêtre. Contrôler la scène et lancer le rendu final dans Blender.
- **Premiere** : le panneau fourni est dans `connecteurs/premiere`. Son chargement UXP est encore requis sur ce poste. Une fois visible, choisir `data/ponts/premiere`, puis **Importer dans le chutier**. Le dossier choisi est mémorisé via un jeton UXP. Un envoi en attente ne prouve pas que Premiere a importé le média.

Les boutons de test font un échange local. « Dernier test réussi » ne garantit pas qu’une application fermée répond encore. Aucun de ces ponts ne met à jour les logiciels Adobe, Resolve ou Blender.

## IA

La page Modèles distingue présence des poids, moteur configuré et génération réussie. Le modèle local rapide qwen2.5-coder:1.5b peut aider à structurer une proposition. Un modèle texte ne produit pas une vidéo à lui seul. Les modèles conservés sur le T7 nécessitent le disque.

Les services web du catalogue demandent un compte personnel, une clé et un adaptateur lorsque le service expose une API. Un lien vers un service gratuit ne représente pas une connexion automatique. Le catalogue conserve les dates et les conditions observées ; vérifier le quota auprès du service avant usage. Les moteurs image/vidéo/musique non démarrés restent indiqués à configurer.

La protection du Studio garde ton mot de passe local. Le profil de test utilisé pour les contrôles est isolé et ne change pas ton identité ni ton mot de passe.

## Atelier film connecté

La version 0.5.0 ajoute le parcours Écriture → Storyboard → Production. Voir [le guide Atelier film](ATELIER_FILM.md) pour les scènes, les plans liés, les médias, l’historique et les exports.
