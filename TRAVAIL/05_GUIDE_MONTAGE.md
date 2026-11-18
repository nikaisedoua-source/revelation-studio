# Guide d'utilisation — Montage vidéo

## 1. Ouvrir le studio

- **Electron** : lancer `Revelation Studio` (paquet macOS) ou `npm run desktop` en développement.
- **PWA / navigateur** : servir `web-online/dist/` avec un serveur HTTP local, puis ouvrir l'adresse.
- **Python local** : `uvicorn app.server:app --host 127.0.0.1 --port 8848`.

Au premier lancement, créer un mot de passe de **12 caractères minimum**. Il protège le coffre local ; il n'est jamais envoyé à un serveur. Aux lancements suivants, le même mot de passe déverrouille projets, médias et clés.

## 2. Importer des médias

1. Aller sur **Montage vidéo**.
2. Cliquer **＋ Importer** dans le panneau Médias.
3. Choisir un ou plusieurs fichiers vidéo, audio ou image.

Les fichiers sont stockés dans le coffre chiffré du navigateur. La vignette et la durée apparaissent. Un média reste disponible après rechargement et reconnexion. Le champ de recherche au-dessus du pool filtre par nom ; le compteur indique le nombre de résultats et un message explicite remplace la liste quand rien ne correspond.

Formats acceptés : ceux que le navigateur/Electron sait décoder (MP4/H.264, WebM, MP3, WAV, PNG, JPEG, etc.). Un format non décodable est signalé par une vignette ou une lecture absente.

## 3. Poser un clip

- **Glisser-déposer** un média sur une piste compatible.
- Ou cliquer le bouton **＋** d'un média : il est ajouté au playhead sur la première piste libre (V1 pour vidéo/image, A1 pour audio).
- **＋ Piste vidéo** / **＋ Piste audio** ajoutent une piste.
- **Ajuster** (ou `F`) cadre la timeline sur le montage.

Pistes par défaut, de haut en bas : **V2, V1, A1, A2**. Une vidéo sur V2 masque V1 quand les deux se chevauchent.

## 4. Sélectionner et éditer un clip

Cliquer un clip : l'inspecteur affiche son nom, sa piste, son début, sa durée, son point d'entrée, son opacité, son volume, une case muet, ses **fondus entrée/sortie**, sa **transformation** (X/Y, échelle, rotation) et son étalonnage.

| Action | Geste |
| --- | --- |
| Déplacer | glisser le corps du clip |
| Rogner à gauche | poignée gauche (modifie le point d'entrée) |
| Rogner à droite | poignée droite (allonge jusqu'à la fin du média) |
| Couper au playhead | bouton **Couper** ou touche `S` |
| Dupliquer | bouton **Dupliquer** |
| Supprimer | bouton **Supprimer** ou `Suppr` |
| Supprimer et fermer le trou | bouton **Supprimer et fermer** ou `Maj+Suppr` |
| Changer de piste | liste **Piste** de l'inspecteur |
| Ajuster précisément | champs **Début**, **Durée**, **Entrée source** |

Toutes les valeurs sont quantifiées à la frame. Le statut `Enregistré à …` confirme la sauvegarde locale.

## 5. Lire le montage

- **Espace** ou bouton ▶ : lecture/pause.
- La tête de lecture avance en temps réel, le canvas affiche le clip actif, l'audio est mixé.
- La barre de transport affiche le timecode et la durée totale.

Raccourcis :

| Touche | Effet |
| --- | --- |
| `Espace` | lecture / pause |
| `←` / `→` | une image |
| `Maj+←` / `Maj+→` | une seconde |
| `Début` / `Fin` | début / fin |
| `+` / `−` | zoom timeline |
| `F` | ajuster la timeline |
| `S` | couper au playhead |
| `Suppr` | supprimer |
| `Maj+Suppr` | supprimer avec ripple |
| `Ctrl/⌘+Z` | annuler |
| `Maj+Ctrl/⌘+Z` ou `Ctrl/⌘+Y` | rétablir |

## 6. Exporter la vidéo

1. Cliquer **Exporter la vidéo**.
2. L'overlay affiche le pourcentage et le timecode.
3. À la fin, le fichier est téléchargé : MP4 si le codec est disponible, sinon WebM.

L'export est **en temps réel** : un montage de 5 secondes prend environ 5 secondes. Garder l'onglet au premier plan. Le bouton **Arrêter** annule et jette l'enregistrement partiel.

## 7. Sauvegarder / transférer un projet

- **Projet .json** télécharge la structure du montage et les métadonnées des médias.
- **Ouvrir un projet** recharge un `.json`. Les médias sont reliés par identifiant ou par nom ; les médias absents sont signalés « à réimporter ».
- Le projet complet (clips + médias chiffrés) reste dans le coffre local. Pour changer d'appareil, exporter aussi une sauvegarde du coffre depuis **Compte & sauvegarde**, ou copier les fichiers sources et réimporter.

## 8. Connecter FreeLLMAPI

1. Ouvrir **IA & quotas**.
2. Dans le formulaire **freellmapi**, renseigner :
   - `FREELLMAPI_BASE_URL` : par exemple `https://votre-passerelle.example` ou `http://127.0.0.1:8899` en local ;
   - `FREELLMAPI_API_KEY` : la clé de la passerelle ;
   - `FREELLMAPI_MODEL` : le modèle à utiliser.
3. **Enregistrer**, puis **Tester · courte génération**.

Le test envoie réellement une requête `POST …/v1/chat/completions` avec `Authorization: Bearer …` et affiche la réponse. En PWA, la passerelle doit autoriser CORS ; en Electron, le proxy principal s'en charge.

## 9. Bonnes pratiques

- Travailler avec des médias courts pour les essais, l'export étant en temps réel.
- Nommer les clips et les médias avant un montage long.
- Vérifier l'état de sauvegarde avant de fermer l'onglet.
- Ne jamais partager le mot de passe du coffre dans un projet ou un écran.
- Pour une diffusion professionnelle, prévoir un rendu hors ligne (montage final) avec un encodeur dédié ; l'export navigateur est un aperçu/master léger, pas un substitut à un pipeline de diffusion.

## 10. Habillage studio et navigation

La barre supérieure contient les menus **Fichier / Édition / Affichage / Outils / Aide**, le nom du projet et l'état IA. Les onglets d'espaces de travail ouvrent directement :

| Onglet | Raccourci | Usage |
| --- | --- | --- |
| Média | `Alt+1` | production et bibliothèque |
| Montage | `Alt+2` | timeline multipiste |
| Photo | `Alt+3` | atelier à calques |
| Étalonnage | `Alt+4` | outils couleur |
| VFX | `Alt+5` | effets et compositing |
| Audio | `Alt+6` | son |
| IA Média | `Alt+7` | images et clips IA |
| Livraison | `Alt+8` | contrôle et export |

`⌘K` (ou `Ctrl+K`) ouvre la **palette de commandes** : taper `photo`, `montage`, `export`, `annuler`, etc. filtre les actions et permet de les exécuter au clavier. `Échap` ferme la palette ou un menu.

Les menus appellent les mêmes fonctions que les boutons de l'éditeur : **Nouveau montage** (`⌘N`), **Ouvrir un projet** (`⌘O`), **Enregistrer** (`⌘S`), **Exporter la vidéo** (`⌘E`), **Actualiser** (`⌘R`). Aucun élément de menu n'est décoratif.

## 11. Étalonnage par clip

1. Sélectionner un clip sur la timeline.
2. Dans l'inspecteur, section **Étalonnage**, régler **Exposition**, **Contraste**, **Saturation** et **Température**.
3. Le moniteur se met à jour en direct ; l'export utilise le même rendu.
4. Les boutons **Neutre / Ambre / Acier / Contraste** appliquent des préréglages complets.
5. `⌘Z` annule le dernier réglage (une entrée d'historique par relâchement de curseur), `⌘⇧Z` le rétablit.

Valeurs positives : exposition et contraste éclaircissent/renforcent, saturation intensifie les couleurs, température réchauffe (sépia). Valeurs négatives : assombrissent, adoucissent, désaturent, refroidissent (rotation de teinte).

## 12. Transformation, fondus, formes d'onde et scopes

### 12.1 Transformation

1. Sélectionner un clip vidéo ou image.
2. Dans l'inspecteur, section **Transformation**, régler **Position X**, **Position Y**, **Échelle** (5–300 %) et **Rotation** (−180…180°).
3. Le moniteur se met à jour en direct ; les boutons **Plein / Gauche / Droite** appliquent un cadrage complet.
4. Relâcher le curseur crée une entrée d'historique unique ; `⌘Z` revient à l'état précédent.

### 12.2 Fondus

- **Fondu entrée** et **Fondu sortie** sont des durées en secondes, bornées à la durée du clip.
- Le coin du clip se dessine sur la timeline.
- Le fondu agit sur l'**opacité image** et sur le **gain audio** : un clip audio baisse réellement au début et à la fin.
- Après une coupe, chaque moitié conserve le fondu de son bord.

### 12.3 Formes d'onde

Les clips audio affichent une forme d'onde calculée depuis les pics du média décodé. Elle suit la portion réellement utilisée (`Entrée source … Entrée + Durée`). Elle est informative : elle ne modifie ni le son ni le niveau.

### 12.4 Scopes

Le bouton **Scopes** du moniteur affiche ou masque deux contrôles calculés depuis l'image affichée :

- **Waveform luma** : répartition de la luminance ;
- **Vectorscope Cb/Cr** : saturation et teinte, avec cibles R/M/B/C/G/Y.

Le rendu est rafraîchi au plus toutes les 120 ms. Les scopes sont un contrôle d'aperçu, pas un moteur colorimétrique : ils n'altèrent pas l'export.

## 13. Atelier photo à calques

1. Ouvrir l'onglet **Photo**. Une composition de bienvenue 1920 × 1080 est fournie.
2. Choisir un outil dans le rail : déplacement (`V`), pinceau (`B`), gomme (`E`), rectangle, ellipse, texte, remplissage, pipette.
3. Régler taille, opacité et couleur dans la barre d'options.
4. Dessiner directement sur le canvas ; les formes se contraignent avec `Maj`.
5. Gérer les calques à droite : visibilité, vignette, renommage (double-clic), opacité, mode de fusion, ordre, duplication, suppression.
6. **Annuler / Rétablir** restaure chaque geste, ajout ou propriété.
7. La composition est sauvegardée automatiquement dans le navigateur ; **Enregistrer** force la sauvegarde, **Ouvrir** recharge la dernière composition.
8. **Exporter PNG** télécharge le rendu composé réel (tous les calques visibles, opacité et fusion comprises).

Les calques texte sont créés par un clic dans l'image. Le panneau de propriétés permet de modifier le **contenu**, la **taille**, la **police** et la **couleur** ; le canvas se met à jour en direct. Un double-clic sur le canvas place le curseur dans le champ texte du calque actif. **Importer image** ajoute un fichier comme nouveau calque. Les modifications de texte sont annulables et rétablissables.

## 14. Comprendre l'état IA

Le bandeau et la page **IA & quotas** affichent l'état réel, pas un décor :

- **Ollama** : modèles locaux détectés, test de génération court sans clé ni coût.
- **Services cloud configurés** : clés présentes dans le profil.
- **Générations vérifiées** : au moins un test réel réussi.

Dans le profil audité le 2026-11-17, seules les clés **Tripo** et **Kling** sont présentes. Tripo confirme l'accès mais affiche **0 crédit** ; Kling confirme l'accès. Les autres fournisseurs, dont **FreeLLMAPI**, restent configurables mais ne sont pas connectés. Le détail est dans [08_IA_ET_COMPTES.md](08_IA_ET_COMPTES.md).

## 15. Assistant projet — fabriquer un film complet dans le Studio

1. Ouvrir **Montage**, puis **Assistant projet** dans la barre d'outils.
2. Choisir le **style** (Ambre, Acier, Nuit, Néon), la **durée** (12 à 120 s), le **sujet**, la **signature finale** et la **voix**.
3. Laisser cochés **plans cinématiques**, **titres transparents**, **musique originale** et **voix off**. L'aperçu de droite est un rendu réel du premier plan et de son titre.
4. Cliquer **Générer le projet**. Le journal indique chaque étape : rendu des six plans, titres, musique, six phrases de voix, import, assemblage.
5. Le Studio crée un nouveau montage : six images sur **V1**, six titres sur **V2**, la musique sur **A1**, les voix sur **A2**. La durée est exacte (ex. 30,000 s à 30 i/s).
6. Lire avec `Espace`, retoucher les clips si besoin, puis **Exporter la vidéo**.

Les voix utilisées sont celles du système :

- macOS : `say` puis conversion WAV par `afconvert` ;
- Windows : PowerShell + `System.Speech` (SAPI) ;
- Linux : `espeak-ng`.

Aucune clé, aucun compte et aucune connexion réseau ne sont nécessaires. Si le poste ne propose aucune voix, le film est tout de même assemblé avec images, titres et musique, et le journal explique pourquoi la voix manque. L'édition web autonome sans pont système suit la même règle.
