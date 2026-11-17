# Limites honnêtes et suite

## 1. Limites fonctionnelles actuelles

### Export

- L'export navigateur est **en temps réel** (`MediaRecorder`). Un montage de 10 minutes prend au moins 10 minutes.
- Le codec dépend du navigateur : MP4/H.264 si disponible, sinon WebM. Electron peut différer du navigateur système.
- Pas d'export alpha (ProRes 4444) dans le navigateur. Cette capacité reste côté Mac/Python.
- L'onglet doit rester au premier plan ; un onglet throttlé peut ralentir ou interrompre l'enregistrement.
- Pas encore de file d'attente d'export, de rendu hors ligne, ni de reprise après interruption.

### Montage

- Une seule piste vidéo est réellement composée à l'écran ; l'empilement V2/V1 fonctionne, mais il n'y a pas encore de modes de fusion avancés.
- Pas de transitions glissées sur la timeline, pas de keyframes d'opacité/volume, pas d'effets par clip.
- Pas de waveform audio dessinée dans les clips.
- Pas de sous-titres ni de chapitres exportés.
- Les images acceptent une durée longue ; les vidéos sont limitées à leur durée source.

### Persistance

- Le coffre est **local par navigateur**. Aucune synchronisation multi-appareils automatique.
- Un mot de passe perdu sans clé de secours rend le coffre inaccessible : c'est le prix du chiffrement local.
- Les quotas IndexedDB dépendent du navigateur et de l'espace disque.
- Le projet `.json` ne contient pas les médias ; il faut les réimporter ou transférer le coffre.

### Fournisseurs IA

- FreeLLMAPI nécessite une **passerelle fournie par l'utilisateur**. Aucune URL officielle n'a été inventée.
- En PWA, la passerelle doit autoriser CORS. En Electron, le proxy principal évite cette contrainte.
- Les adaptateurs payants (Anthropic, Gemini, Veo, Kling, Luma, Tripo, ElevenLabs, etc.) n'ont pas été testés avec de vrais comptes pendant cette session. Leur état reste « configuré » tant qu'une génération réelle n'a pas réussi.
- Les quotas, droits et conditions de chaque service restent ceux du compte utilisateur.

### Distribution

- Le paquet macOS est **non signé Developer ID et non notarié**. Gatekeeper peut afficher un avertissement ; il faut clic droit → Ouvrir, ou signer/notarier avec un compte Apple.
- Le nom du bundle macOS est ASCII (`Revelation Studio.app`) à cause d'un crash observé avec un nom accentué.
- Les cibles Windows (NSIS + portable) et Linux (AppImage) sont configurées mais **non construites ni testées sur cette machine macOS**. Une construction Windows demande Wine ou un runner Windows.
- La PWA exige un contexte sécurisé (HTTPS ou localhost) pour Web Crypto et l'installation.

## 2. Limites de sécurité

- Le proxy Electron protège contre les URL malformées, les secrets dans l'URL, les redirections vers des hôtes non prévus et les IP privées littérales. Il ne protège pas contre un malware déjà présent sur la machine de l'utilisateur.
- Les clés sont stockées dans le profil utilisateur/coffre. Un attaquant avec accès complet à la session peut les lire ; le chiffrement protège le stockage au repos, pas une session compromise.
- Aucun audit de sécurité externe n'a été réalisé.
- Le serveur Python local reste sur loopback ; ne pas l'exposer sur un réseau public sans authentification et reverse proxy.
- Ne jamais committer `data/`, `.env`, clés, sauvegardes ou médias. Le build vérifie des marqueurs, mais la vigilance humaine reste nécessaire.

## 3. Ce qui est réellement vivant aujourd'hui

- Création/déverrouillage du coffre, import de médias, persistance après rechargement.
- Timeline multipiste, trim, split, suppression ripple, undo/redo, zoom, aimantation.
- Lecture temps réel avec audio et rendu canvas.
- Export MP4/WebM téléchargé et relu.
- Export/import de projet JSON.
- 20 pages du studio rendues sans erreur.
- Configuration FreeLLMAPI et test de génération réels.
- Application Electron, serveur local, proxy IPC et paquets `.dmg`/`.zip` macOS.

## 4. Prochaines étapes recommandées

1. **Rendu hors ligne** via FFmpeg (ou pipeline Python) pour des exports rapides, alpha et codecs maîtrisés.
2. **Transitions et composition** : fondus, incrustation, modes de fusion, keyframes.
3. **Audio** : formes d'onde, vu-mètres, normalisation, fondus.
4. **Sous-titres** : import/export SRT, édition sur timeline.
5. **Récupération** : sauvegarde automatique du projet, reprise après fermeture brutale.
6. **Tests E2E automatisés** dans la CI (Playwright ou Electron + CDP) pour rejouer les scénarios de ce dossier.
7. **Windows** : construire et tester sur un runner Windows ; vérifier NSIS et portable.
8. **Signature Apple** : Developer ID + notarisation pour supprimer l'avertissement Gatekeeper.
9. **FreeLLMAPI** : documenter une passerelle de référence et un exemple CORS, sans intégrer de clé.
10. **Accessibilité** : navigation clavier complète de la timeline, libellés ARIA, contrastes.

## 5. Règle pour la suite

Toute nouvelle fonction doit suivre le même critère : interface réelle, persistance, résultat observable, test dans un vrai navigateur ou un vrai processus. Une fonction seulement présente dans le code mais non exercée doit être marquée « non vérifiée », pas « terminée ».
