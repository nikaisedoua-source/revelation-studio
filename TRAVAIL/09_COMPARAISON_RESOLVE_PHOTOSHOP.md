# Comparaison avec les logiciels d'origine — passe 0.11.0

Ce document compare Révélation Studio aux logiciels auxquels ses espaces sont raccordés : **DaVinci Resolve** (montage, couleur, livraison), **Fairlight** (audio), **Adobe Photoshop** (photo), **Adobe Premiere Pro** (atelier film) et **Adobe After Effects** (motion, VFX, graphiques). L'objectif de la passe 0.11.0 était de réduire les écarts les plus visibles sans jamais simuler une fonction absente.

Date de la comparaison : **2026-11-17**. Version comparée : **0.11.0**.

## 1. Méthode et règles d'honnêteté

Chaque capacité est classée selon ce qui est réellement observable dans l'application :

| Statut | Signification |
| --- | --- |
| **Réel** | L'outil existe dans l'interface, modifie le projet, persiste et produit un résultat vérifiable (moniteur, export, fichier). |
| **Partiel** | L'outil existe et fonctionne, mais sur un sous-ensemble du comportement du logiciel de référence. |
| **Absent** | Le logiciel de référence le propose, Révélation Studio ne le fait pas encore. |
| **Hors périmètre** | Capacité liée à l'écosystème du logiciel (plugins propriétaires, collaboration cloud, matériel dédié) que le projet ne vise pas à court terme. |

Règle appliquée : une fonction présente dans le code mais non exercée dans un vrai navigateur ou un vrai processus est marquée **non vérifiée**, jamais **terminée**. Les preuves de cette passe sont dans [06_TESTS_PREUVES.md](06_TESTS_PREUVES.md).

## 2. Résumé exécutif

La passe 0.10.0 avait rapproché l'**habillage** et les **ponts** (12 espaces reliés, hub réel, heartbeat). La passe 0.11.0 rapproche le **cœur métier** sur cinq manques identifiés face à Resolve et Photoshop :

1. **Transformation de clip** : position, échelle, rotation, avec préréglages Plein / Gauche / Droite.
2. **Fondus entrée/sortie** : visuels sur la timeline (coins) et réellement appliqués à l'image **et** au gain audio.
3. **Formes d'onde audio** : dessinées dans les clips à partir des pics décodés du média.
4. **Scopes de contrôle** : waveform luma et vectorscope Cb/Cr, superposés au moniteur.
5. **Recherche dans le pool média** : filtre par nom, compteur de résultats, état vide explicite.
6. **Édition de texte photo sur canvas** : texte, taille, police et couleur modifiables après création, avec aperçu direct et historique.

Ce qui reste le plus éloigné d'un logiciel professionnel : **transitions**, **keyframes**, **rendu hors ligne**, **courbes/LUT/masques couleur**, **EQ/compresseur audio**, **masques et groupes photo**, **sous-titres**. Le détail est en section 8.

## 3. Tableau de synthèse

| Domaine | Référence | Révélation Studio 0.11.0 | Écart principal |
| --- | --- | --- | --- |
| Pool média | Resolve / Premiere | **Partiel** : import, vignettes, recherche, durée, audio/vidéo/image | pas de bacs, métadonnées, proxies |
| Montage multipiste | Resolve / Premiere | **Partiel** : V2/V1/A1/A2, trim, split, ripple, snap, zoom, undo/redo | pas de transitions, slip/slide, vitesse, multicam |
| Composition image | Resolve | **Partiel** : transform, opacité, fondus, étalonnage par clip | pas de keyframes, fusion avancée, matte |
| Couleur | Resolve | **Partiel** : exposition, contraste, saturation, température, scopes | pas de nœuds, courbes, LUT, qualifier, power windows |
| Audio | Fairlight | **Partiel** : volume, mute, fondus, formes d'onde, lecture WebAudio | pas d'EQ, dynamique, bus, automation, vu-mètres |
| Livraison | Resolve | **Partiel** : MP4/WebM temps réel, progression, annulation | pas de rendu hors ligne, file, ProRes alpha navigateur |
| Calques photo | Photoshop | **Partiel** : calques, opacité, fusion, visibilité, ordre, duplication | pas de masques, groupes, calques de réglage |
| Texte photo | Photoshop | **Partiel** : texte éditable, police, taille, couleur, undo | pas de styles de calque, paragraphe, déformation |
| Peinture / formes | Photoshop | **Partiel** : pinceau, gomme, rectangle, ellipse, remplissage, pipette | pas de sélections, lasso, plume, pinceaux avancés |
| Persistance / export photo | Photoshop | **Partiel** : IndexedDB chiffré, export PNG | pas d'import/export PSD dans l'atelier |
| Motion / VFX | After Effects | **Partiel** : aperçu motion, graphiques, storyboard animé | pas de keyframes, expressions, tracking, 3D caméra |
| Sous-titres | Premiere / Resolve | **Absent** | import/export SRT, édition timeline |
| Rendu hors ligne | Resolve / Premiere | **Absent** | FFmpeg, file d'attente, reprise |
| Ponts temps réel | Resolve / Premiere | **Partiel** : échange par fichiers + heartbeat vérifié | pas de synchronisation live de timeline |

## 4. DaVinci Resolve

### 4.1 Page Média

| Capacité Resolve | État 0.11.0 | Détail |
| --- | --- | --- |
| Import de médias | **Réel** | Vidéo, audio et image importés dans le coffre chiffré ; les fichiers restent locaux. |
| Vignettes et durée | **Réel** | Vignette vidéo/image, durée, type, taille ; aperçu audio avec pics. |
| Recherche dans le pool | **Réel (0.11.0)** | Champ `#ed-media-search` : filtre insensible à la casse sur le nom, compteur `n/total`, message « Aucun média ne correspond à … ». |
| Bacs et bacs intelligents | **Absent** | Le pool est une liste plate. |
| Métadonnées, mots-clés | **Absent** | Pas de colonnes ni de tags. |
| Médias optimisés / proxies | **Absent** | Le média source est utilisé tel quel. |
| Synchronisation audio externe | **Absent** | Pas d'alignement automatique. |

### 4.2 Page Montage

| Capacité Resolve | État 0.11.0 | Détail |
| --- | --- | --- |
| Pistes multiples | **Réel** | V2/V1/A1/A2 avec verrouillage, mute vidéo, mute/solo audio. |
| Déplacement de clip | **Réel** | Glisser-déposer entre pistes du même type. |
| Trim par poignées | **Réel** | Poignées gauche/droite, quantifiées à l'image. |
| Coupe et suppression ripple | **Réel** | `S` pour couper au playhead, `Maj+Suppr` pour supprimer et refermer le trou sur la même piste. |
| Aimantation | **Réel** | Bords de clips et playhead, seuil en pixels converti en temps. |
| Zoom timeline | **Réel** | 8 à 500 px/s, boutons et libellé. |
| Annuler / rétablir | **Réel** | Historique de 150 états complets. |
| Transformation de clip | **Réel (0.11.0)** | Position X/Y, échelle, rotation, préréglages Plein / Gauche / Droite ; appliquée au moniteur et à l'export. |
| Fondus entrée/sortie | **Réel (0.11.0)** | Champs dans l'inspecteur, coins visuels sur la timeline, facteur appliqué à l'opacité image **et** au gain audio. |
| Transitions | **Absent** | Pas de fondu croisé glissé entre deux clips. |
| Trim roll / slip / slide | **Absent** | Seul le trim simple par bord existe. |
| Keyframes | **Absent** | Les valeurs sont constantes sur toute la durée du clip. |
| Vitesse / ralenti | **Absent** | Pas de remappage temporel. |
| Multicam | **Absent** | — |
| Imbrication (nested sequences) | **Absent** | — |
| Sous-titres | **Absent** | — |

### 4.3 Page Couleur

| Capacité Resolve | État 0.11.0 | Détail |
| --- | --- | --- |
| Étalonnage primaire | **Réel** | Exposition, contraste, saturation, température par clip, avec préréglages Neutre / Ambre / Acier / Contraste. |
| Application à l'export | **Réel** | Le filtre canvas est appliqué dans `drawFrame`, donc visible à l'enregistrement. |
| Waveform luma | **Réel (0.11.0)** | Scope dessiné depuis une copie 320 × 180 du moniteur, rafraîchi au plus toutes les 120 ms. |
| Vectorscope Cb/Cr | **Réel (0.11.0)** | Graticule et cibles R/M/B/C/G/Y ; points calculés depuis les pixels du moniteur. |
| Bascule des scopes | **Réel (0.11.0)** | Bouton `#ed-scopes-toggle`, panneau superposé au moniteur, état actif visible. |
| RGB parade / histogramme | **Absent** | Deux scopes seulement. |
| Courbes, LUT | **Absent** | Pas de courbe de transfert ni de LUT 3D. |
| Qualifier / masques couleur | **Absent** | Pas de sélection par teinte. |
| Power windows | **Absent** | Pas de masque géométrique. |
| Nœuds et graphe de couleur | **Absent** | Un seul étage de correction par clip. |
| Suivi de masque | **Absent** | — |

### 4.4 Fairlight

| Capacité Fairlight | État 0.11.0 | Détail |
| --- | --- | --- |
| Lecture audio réelle | **Réel** | WebAudio, horloge `requestAnimationFrame`, pistes synchronisées. |
| Volume par clip | **Réel** | Gain appliqué en direct. |
| Mute piste / clip | **Réel** | Gain forcé à 0. |
| Fondus audio | **Réel (0.11.0)** | Le facteur de fondu multiplie le gain : 0 au début, progression linéaire, 1 au centre. |
| Formes d'onde | **Réel (0.11.0)** | Pics calculés par `decodeAudioData`, dessinés dans le clip et recadrés sur la portion `in…in+durée`. |
| EQ, compresseur, limiteur | **Absent** | Pas de traitement dynamique. |
| Bus, aux, routage | **Absent** | Pas de console de mixage. |
| Automation | **Absent** | Les fondus sont des valeurs fixes, pas des courbes éditables. |
| Vu-mètres temps réel | **Absent** | — |
| Normalisation / loudness | **Absent** | — |

### 4.5 Page Livraison

| Capacité Resolve | État 0.11.0 | Détail |
| --- | --- | --- |
| Export vidéo | **Réel** | `MediaRecorder` sur le canvas + audio, MP4/H.264 si le navigateur le permet, sinon WebM. |
| Progression et annulation | **Réel** | Overlay avec pourcentage, timecode, barre ; annulation qui jette l'enregistrement. |
| Résolution et cadence | **Réel** | 1920×1080, 1280×720, 1080×1920, 1080×1080, 2560×1080 ; 24/25/30/50/60 i/s. |
| Rendu hors ligne | **Absent** | L'export est en temps réel : 10 minutes de montage prennent au moins 10 minutes. |
| File d'attente / reprise | **Absent** | Un export à la fois. |
| ProRes 4444 alpha | **Partiel** | Disponible côté serveur Mac/Python, pas dans le navigateur ni dans Electron. |
| Réglages de codec avancés | **Absent** | Pas de débit, profil, espace colorimétrique exportables. |

## 5. Adobe Photoshop

| Capacité Photoshop | État 0.11.0 | Détail |
| --- | --- | --- |
| Calques raster | **Réel** | Création, import image, duplication, suppression, réordonnancement, renommage. |
| Opacité et fusion | **Réel** | Opacité 0–100 %, modes de fusion canvas. |
| Visibilité | **Réel** | Œil par calque. |
| Pinceau et gomme | **Réel** | Taille, opacité, couleur, tracé continu, gomme en `destination-out`. |
| Formes | **Réel** | Rectangle et ellipse, remplis ou contour. |
| Remplissage et pipette | **Réel** | Remplissage par zone contiguë, pipette avec retour visuel. |
| Déplacement | **Réel** | Déplacement du calque actif, avec undo. |
| Texte éditable | **Réel (0.11.0)** | Champ texte, taille, police, couleur ; modification après création ; aperçu direct ; double-clic sur le canvas pour éditer. |
| Historique | **Partiel** | 10 dernières actions, y compris le texte (bitmap + propriétés restaurées). |
| Persistance | **Réel** | IndexedDB chiffré, restauration au rechargement, export PNG. |
| Sélections, lasso, plume | **Absent** | Pas d'outil de sélection. |
| Masques de fusion | **Absent** | — |
| Groupes de calques | **Absent** | Liste plate. |
| Calques de réglage | **Absent** | — |
| Objets dynamiques | **Absent** | — |
| Import / export PSD | **Absent** dans l'atelier | Une copie PSD existe dans le flux Mac « Texte Photoshop », pas dans l'atelier photo navigable. |
| Filtres, netteté, flou | **Absent** | — |
| Gestion colorimétrique | **Absent** | Saturation/température ne sont pas des profils ICC. |

## 6. Adobe Premiere Pro

| Capacité Premiere | État 0.11.0 | Détail |
| --- | --- | --- |
| Timeline multipiste | **Partiel** | Même moteur que Resolve : V2/V1/A1/A2, trim, split, ripple, snap. |
| Effets par clip | **Partiel** | Étalonnage et transformation seulement. |
| Transitions | **Absent** | — |
| Keyframes | **Absent** | — |
| Essential Graphics | **Absent** | — |
| Sous-titres | **Absent** | — |
| Multicam | **Absent** | — |
| Dynamic Link | **Absent** | Le pont est un échange de fichiers, pas un lien applicatif. |
| Export | **Partiel** | MP4/WebM temps réel. |

L'**atelier film** (scénario, découpage, storyboard, animatique) est un outil propre au Studio, inspiré de l'organisation Premiere mais sans prétendre au moteur Premiere.

## 7. Adobe After Effects

| Capacité After Effects | État 0.11.0 | Détail |
| --- | --- | --- |
| Aperçu motion | **Partiel** | Aperçu vidéo réel des compositions et animatiques. |
| Graphiques et storyboard | **Partiel** | Pages dédiées, exports réels. |
| Transformation animée | **Absent** | La transformation de clip 0.11.0 est fixe, sans keyframes. |
| Expressions | **Absent** | — |
| Masques et track mattes | **Absent** | — |
| Suivi de mouvement | **Absent** | — |
| Caméra 3D | **Absent** | La page 3D délègue à Blender. |
| Précompositions | **Absent** | — |
| Plugins | **Hors périmètre** | — |

## 8. Ce qui a changé en 0.11.0, concrètement

| Ajout | Emplacement technique | Preuve |
| --- | --- | --- |
| Transformation de clip | `web/editor-model.js` (`DEFAULT_TRANSFORM`, `normalizeTransform`), `web/editor.js` (`transformDraw`, inspecteur `#ed-tr-*`) | Échelle 0,5 + X 0,3 enregistrés dans le modèle ; échantillons peints passés de 291 600 à 8 831. |
| Fondus image et audio | `fadeFactor` dans le modèle, `drawFrame` (opacité), `syncAt` (gain), coins `.ed-fade` | Gain audio 0 → 0,5 → 1 ; canvas vide au début du fondu ; undo restaure `fadeIn:0`. |
| Formes d'onde | `paintWaveforms()` + pics `decodeAudioData` | Canvas de clip audio avec 1 764 pixels non transparents. |
| Scopes | `renderScopes()` (luma + vectorscope), overlay `.ed-scopes`, bouton `#ed-scopes-toggle` | Waveform 1 599 pixels allumés, vectorscope 968, panneau visible. |
| Recherche média | `#ed-media-search`, `S.filter`, `renderMedia` | Recherche « plan » → 1/2 ; « zzz » → message vide ; restauration → 2. |
| Texte photo éditable | `drawTextContent`, `snapshotText`, `commitText`, champs `#ph-text-*` | Saisie « STUDIO TEST » en direct, undo restaure « RÉVÉLATION » et le hash exact du canvas. |

Détail des mesures et commandes : [06_TESTS_PREUVES.md](06_TESTS_PREUVES.md), section 8.

## 9. Écarts restants, par priorité

1. **Transitions réelles** (fondu croisé, fondu au noir) : indispensable pour qu'un montage ressemble à un montage. Nécessite un modèle de transition entre clips et un rendu à deux sources.
2. **Keyframes** : opacité, volume, transformation, étalonnage. Sans elles, pas d'animation fine.
3. **Rendu hors ligne** via FFmpeg : supprime la contrainte temps réel, permet ProRes/H.264 et un vrai rendu alpha.
4. **Couleur avancée** : courbes, LUT, RGB parade, histogramme, qualifier.
5. **Audio** : EQ, compresseur, vu-mètres, normalisation.
6. **Photo** : masques, groupes, sélections, import/export PSD.
7. **Sous-titres** : SRT/VTT, édition sur timeline, export incrusté.
8. **Tests E2E en CI** : rejouer les scénarios navigateur à chaque commit.
9. **Ponts Resolve/Premiere** : au-delà du heartbeat, export XML/OTIO ou synchronisation de timeline.
10. **Windows** : construire et tester NSIS/portable sur un runner Windows.

## 10. Ce que l'application ne prétend pas être

- Ce n'est pas un clone de Resolve, Premiere, Photoshop ou After Effects. Ces logiciels représentent des décennies de développement, des moteurs natifs, des formats propriétaires et des écosystèmes de plugins.
- Les habillages par logiciel sont **visuels** ; les états de pont sont **réels** et vérifiés par heartbeat, mais il n'existe pas de synchronisation temps réel de la timeline avec Resolve ou Premiere.
- Les scopes, waveforms et transformations sont calculés dans le navigateur sur des données réelles ; ils ne remplacent pas les moteurs de couleur ou d'audio natifs.
- Toute capacité listée **Absent** ci-dessus doit être considérée comme non disponible, même si un bouton ou un libellé voisin pourrait le suggérer. La règle de la section 1 reste la référence pour les prochaines passes.
