# Édition navigateur 0.6.0

Le code est conservé dans le dépôt GitHub privé `nikaisedoua-source/revelation-ai-studio`. Le site privé publie uniquement les onze fichiers statiques contrôlés par `scripts/build_web.py`. Aucun contenu de `data/`, aucun média personnel, aucun modèle et aucune clé n’est inclus.

## Utilisation

Ouvrir le site privé avec le compte propriétaire, puis créer le coffre de ce navigateur. Le mot de passe web est choisi par le réalisateur et ne quitte pas le navigateur. Il est distinct de celui du compagnon Mac. Le coffre utilise PBKDF2-SHA256 (310 000 itérations) et AES-GCM. Les données sont conservées dans IndexedDB ; exporter régulièrement le coffre chiffré depuis l’espace de travail.

Le site ne synchronise pas les projets automatiquement entre appareils. Une sauvegarde de coffre peut être restaurée dans un navigateur sans coffre existant. Conserver son mot de passe : une sauvegarde chiffrée ne permet pas de le retrouver.

## Fonctions web

- Écriture des scènes, bible, découpage, médias associés, historique et restauration.
- Export du scénario Fountain, projet JSON, prompts et découpage CSV.
- Aperçu motion en MP4 ou WebM, 1280 × 720, selon les codecs du navigateur ; source After Effects modifiable.
- Animatique à partir des images associées, limitée à 60 secondes dans cette édition.
- Source texte Photoshop, LUT créative Rec.709 et fiche de recherche sonore.
- Cache de l’interface pour un usage hors ligne après chargement réussi.

Les fonctions nécessitant un modèle local, une API externe non configurée, un master ProRes alpha, un gros rush ou un logiciel natif donnent une indication vers le compagnon Mac. Aucun logiciel installé n’est accessible automatiquement depuis le site. Le bouton compagnon ouvre l’adresse locale sur l’appareil courant.

Les aperçus vidéo sont enregistrés en temps réel. Garder la page au premier plan ; ce mode n’a pas la précision image par image du rendu FFmpeg du Mac. Les médias importés sont limités à 20 Mo dans le coffre web. Le navigateur peut demander de libérer de l’espace : la sauvegarde chiffrée permet de conserver les projets indépendamment de ses données locales.

## Développement

`python3 scripts/build_web.py` prépare les fichiers publiables par liste blanche. L’hébergement privé Sites utilise `web-online/.openai/hosting.json`. La publication de ce site ne modifie pas la visibilité du dépôt GitHub.

Les contrôles comprennent quinze tests Python et quatre tests JavaScript, plus un essai navigateur de connexion, vidéo MP4, écriture, découpage et export de dossier. Les données de test sont isolées dans `verification/`, exclu de Git et du site.
