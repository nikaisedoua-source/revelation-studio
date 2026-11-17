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

Les fichiers sont stockés dans le coffre chiffré du navigateur. La vignette et la durée apparaissent. Un média reste disponible après rechargement et reconnexion.

Formats acceptés : ceux que le navigateur/Electron sait décoder (MP4/H.264, WebM, MP3, WAV, PNG, JPEG, etc.). Un format non décodable est signalé par une vignette ou une lecture absente.

## 3. Poser un clip

- **Glisser-déposer** un média sur une piste compatible.
- Ou cliquer le bouton **＋** d'un média : il est ajouté au playhead sur la première piste libre (V1 pour vidéo/image, A1 pour audio).
- **＋ Piste vidéo** / **＋ Piste audio** ajoutent une piste.
- **Ajuster** (ou `F`) cadre la timeline sur le montage.

Pistes par défaut, de haut en bas : **V2, V1, A1, A2**. Une vidéo sur V2 masque V1 quand les deux se chevauchent.

## 4. Sélectionner et éditer un clip

Cliquer un clip : l'inspecteur affiche son nom, sa piste, son début, sa durée, son point d'entrée, son opacité, son volume et une case muet.

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
