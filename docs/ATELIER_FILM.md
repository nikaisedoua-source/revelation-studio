# Atelier film — version locale 0.5.0

Le Studio dispose d’un espace connecté **Écriture → Storyboard → Production**, inspiré du principe présenté sur [ScreenWeaver](https://www.screenweaver.ai/). Le code, les données et les médias de cet atelier restent propres à Révélation Studio ; aucun projet n’est envoyé à ScreenWeaver.

## Parcours

1. Ouvrir **Atelier film** et choisir le projet. Le projet et la bible des autres pages utilisent le même fichier JSON.
2. Dans **Écriture**, ajouter une scène, renseigner l’acte/séquence et le temps fort, puis écrire actions et dialogues. Les flèches déplacent la scène avec ses plans et ses médias. Enregistrer le projet.
3. L’assistant d’écriture local reçoit le contexte de la scène et de la bible. Il renvoie une proposition distincte dans les productions ; reprendre uniquement les passages choisis dans le scénario.
4. Dans **Storyboard**, préparer les scènes sans plans puis compléter cadre, angle, focale, mouvement, lumière, action et durée. Ce bouton crée un plan de départ, sans inventer un découpage professionnel à la place du réalisateur. Ajouter les plans nécessaires manuellement.
5. Associer une image ou un clip à chaque plan, renseigner son origine et ses droits, puis choisir sa validation. Les médias sont stockés dans la médiathèque locale du Studio et restent liés par identifiant.
6. Dans **Production**, suivre les étapes de chaque plan et lire le prompt incluant ses paramètres, son scénario et les personnages de la bible. Les cases absentes indiquent ce qui reste à fournir ; un prompt ne compte pas comme image ou vidéo.
7. Exporter le dossier du film ou assembler l’animatique des médias. Le rendu utilise chaque durée, la cadence et le format du projet. Il est silencieux ; une image fixe reste fixe. Les intentions de caméra servent au découpage et aux prompts, sans prétendre animer l’intérieur d’une photo.
8. Envoyer le MP4 à Resolve ou à la file d’échange Premiere pour poursuivre le montage. L’activation du panneau Premiere reste nécessaire sur ce poste.

## Cohérence et versions

Les identifiants de scène et de plan traversent le scénario, le storyboard, les prompts et les exports. Modifier une scène rend ses plans à revoir sans détacher les médias. Modifier un costume ou une référence d’un personnage utilisé, la direction artistique ou les paramètres d’un plan déjà approuvé invalide aussi son approbation. Le réalisateur peut approuver à nouveau après relecture.

Chaque sauvegarde conserve la version précédente dans `data/history`. La restauration crée une nouvelle révision et garde l’état courant. Deux fenêtres ne peuvent pas enregistrer silencieusement par-dessus la même ancienne révision : le Studio demande de recharger le projet en cas de conflit.

Les productions conservent un instantané du projet utilisé. Une animatique d’une ancienne version reste disponible avec son numéro de version ; elle n’est pas remplacée quand le scénario évolue.

## Import et exports

L’import local prend un texte Fountain simple avec en-têtes INT., EXT., I/E. ou titres forcés par un point, et numéros de scène facultatifs. La prévisualisation est obligatoire avant l’ajout. Il ajoute les scènes sans remplacer celles du projet ; le texte importé d’origine et son SHA-256 sont conservés. Le parser ne prétend pas gérer tous les éléments avancés du standard Fountain, Final Draft ou les PDF scannés.

Le pack contient :

- `SCENARIO.fountain` : scénario et identifiants stables.
- `PROJET_FILM.json` : bible, scènes, plans, références et révision.
- `PLAN_TOURNAGE.csv` : paramètres et positions des plans dans le temps.
- `FILM_TIMELINE.json` : ordre, durées et liens médias.
- `PRODUCTION_CANVAS.json` : étapes, prompts et points à relire.
- `PROMPTS_PAR_PLAN.txt` : consignes à utiliser avec un moteur choisi.
- `FILM_ANIMATIQUE.mp4`, si demandé et si chaque plan dispose d’un média.
- `RENDER_VALIDATION.json`, pour le décodage et le comptage des images du rendu.

## Service ScreenWeaver optionnel

Le [MCP officiel](https://www.screenweaver.ai/mcp) est recensé dans le catalogue avec son URL et son état non connecté. Selon cette documentation consultée le 24 octobre 2026, il demande OAuth et une offre Auteur ou Studio. L’atelier local ne constitue pas une connexion à ce compte et n’active aucun abonnement. Les générations distantes et les échanges bidirectionnels avec leur service restent à connecter séparément.

## Vérifications de cette livraison

15 tests ciblés passés, plus un contrôle dans le navigateur : création d’une scène, enregistrement, préparation d’un plan, import d’une image, approbation, rendu d’une animatique, modification de la source avec invalidation du plan, restauration de la version approuvée. Un assemblage réel de deux références a aussi été décodé avec exactement 100 images, soit 4 secondes à 25 i/s.

Les logiciels de création n’ont pas été mis à jour. Dropbox reste exclu de tout accès.
