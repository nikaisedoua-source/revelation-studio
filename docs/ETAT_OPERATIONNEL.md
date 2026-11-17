# État opérationnel vérifié — 24 octobre 2026

Le parcours « script → plan minuté → rendu → sources modifiables » a été testé dans l’interface avec un profil jetable, distinct du profil du réalisateur. La version locale 0.4.0 a ensuite été relancée sur 127.0.0.1:8848 ; l’écran de connexion du profil habituel est visible. Le mot de passe n’a pas été modifié.

| Domaine | Preuve de cette finalisation | Limite actuelle |
|---|---|---|
| Motion design | Deux cartons rendus depuis l’interface ; exemple Kacou 180–183 de 30 s, 750 images à 25 i/s, MP4 et ProRes 4444 décodés intégralement, alpha 0–255 vérifié | Animation typographique déterministe ; pas de génération de prises de vues vidéo par ce moteur |
| After Effects 26.0 | Composition Kacou 180–183 créée avec textes et images clés ; présence confirmée dans l’interface après correction des dimensions de l’échelle du zoom | Enregistrer le projet et relire le rendu natif avant livraison |
| Photoshop 27.6.0 | Nouveau document avec texte éditable et effet de calque confirmé par l’API locale | Enregistrer le PSD depuis Photoshop ; pas de synchronisation bidirectionnelle automatique des modifications |
| Resolve 21.1.1 | Projet distinct « Révélation Studio — Réception » créé ; un master motion de 30 s importé par l’API | Placer le média sur une timeline et enregistrer le montage |
| Fusion | Source .setting multi-cartons produite avec textes, fondus et mouvements | Graphe natif fourni ; conformation visuelle dans Fusion encore à valider |
| Blender 5.2.2 | Moteur exécuté ; fichier REVELATION_SCENE.blend fabriqué dans un processus isolé | Scène de préparation ; rendu final et choix artistiques à contrôler |
| Premiere 26.0 | Source du panneau UXP et file d’échange préparées ; mémorisation du dossier par jeton UXP | Panneau non validé dans l’hôte ; activation manuelle encore requise, aucun import automatique confirmé |
| Assistant local | Ollama qwen2.5-coder:1.5b a répondu et a terminé une proposition motion dans le Studio | Les propositions doivent être relues ; les autres familles de modèles nécessitent leurs propres essais |
| IA en ligne | Catalogue de services, conditions et états de configuration | Le catalogue ne crée pas les comptes ni les clés. Les services sans adaptateur ou sans API disponible ne sont pas connectés automatiquement |
| Classement | Arborescence 01–10, liens vers les productions sans déplacement des sources ; stockage local de secours | Les sorties locales restent locales après rebranchement du disque, sans transfert automatique |
| Accès | Bootstrap public 200 ; tâches sans session 403 ; hôte/origine tiers 403 ; auth.json permissions 0600 | Le réalisateur doit saisir son mot de passe pour ouvrir sa session |

Huit tests ciblés sont passés : conservation du texte, minutage aux images, chevauchements et bornes, lisibilité, échappement des sources AE, heartbeat invalide, classement sans déplacement, absence de fausse validation de rendu. Le parcours réel dans le navigateur a produit son MP4 et son master alpha. Une erreur volontaire de script AE a aussi été capturée sans boîte de dialogue bloquante.

Le Samsung T7 a été indisponible puis rebranché pendant les contrôles. Les fichiers existants n’ont pas été déplacés. Aucune mise à jour des logiciels de montage ou de création n’a été exécutée. Aucun dossier Dropbox n’a été consulté ou modifié.

Exemple principal : `/Volumes/Samsung T7/IA_STUDIO_2026/productions_revelation/e2426ee02da1/`.
Guide : `docs/UTILISER_LE_STUDIO.md`.

## Extension 0.5.0 — Atelier film

Le concept de chaîne connectée de ScreenWeaver a été intégré localement : éditeur par scène, actes/temps forts, réorganisation des scènes avec leurs plans, bible, paramètres de plans, médias associés, canevas, assistant local contextuel, historique avec restauration et contrôle de révision, import Fountain simple et exports liés par identifiants. Le site et sa documentation MCP ont été consultés le 24 octobre 2026. Le service distant est recensé mais sa connexion OAuth n’est pas active.

Les 15 tests ciblés passent. Le contrôle dans le navigateur a confirmé écriture → sauvegarde → préparation de plan → ajout d’image → approbation → animatique terminée. La modification de la scène a ramené le plan à revoir tout en conservant son image ; la restauration a retrouvé l’approbation et conservé la version modifiée. L’assistant qwen2.5-coder:1.5b a terminé une proposition avec le contexte du film, sans remplacer le scénario. Les productions affichent la révision du projet utilisée.

Le serveur habituel sert désormais la version 0.5.0 sur 127.0.0.1:8848. Les routes film et tâches sans session renvoient 403. La version 0.5.0 est visible sur l’écran de connexion du navigateur intégré. Une fenêtre Mac déjà ouverte peut conserver l’ancienne interface : quitter puis rouvrir le Studio pour recharger les nouveaux fichiers. Guide : `docs/ATELIER_FILM.md`.
