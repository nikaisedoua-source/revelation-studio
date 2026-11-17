# IA et comptes — état réel au 2026-11-17

Ce document répond à une question simple : **quels moteurs IA sont réellement actifs, avec quelles clés, et qu'est-ce qui ne peut pas encore générer ?**

## 1. Méthode d'audit

- Les états proviennent de `app/providers.py::status()` et de la console **IA & quotas**.
- Aucune valeur de clé n'a été lue, affichée, journalisée ni commitée.
- Les vérifications Tripo et Kling sont des **lectures de compte** (`/check`), pas des générations payantes.
- Le test Ollama envoie un prompt court à `127.0.0.1:11434` (`num_predict: 8`), sans clé ni coût.
- Les essais navigateur ont utilisé un profil de test isolé ; les identifiants existants ont été copiés sans être inspectés.

## 2. Résultat de l'audit du profil réel

| Moteur | Clé présente | État | Preuve |
| --- | --- | --- | --- |
| **Ollama** (local) | aucune clé requise | **Actif** | 2 modèles : `muse-glimmer:latest`, `qwen2.5-coder:1.5b` ; génération réelle « OK » en **4,89 s** |
| **Tripo** (3D) | oui | **Accès confirmé · 0 crédit** | Vérification de compte réelle ; solde renvoyé : `0` |
| **Kling** (vidéo) | oui | **Accès confirmé** | Vérification de compte réelle ; aucune génération payante lancée |
| FreeLLMAPI | non | Configurable, non connecté | Formulaire présent ; champs `BASE_URL`, `API_KEY`, `MODEL` vides |
| Anthropic, Gemini, Groq, Mistral, OpenRouter, Cloudflare, Cohere | non | Non configurés | `status()` renvoie « Clé ou paramètre requis » |
| Luma, Veo, ElevenLabs, Google Auth | non | Non configurés | idem |

Conclusion honnête : **les clés Tripo et Kling sont bien présentes**, mais elles ne rendent pas tous les moteurs actifs. Tripo ne peut pas produire de GLB tant que le compte reste à 0 crédit. Les autres fournisseurs n'ont pas de clé dans ce profil. Le seul moteur IA immédiatement utilisable sans clé est **Ollama**.

## 3. Ce que « actif » signifie dans l'interface

- **Configuré** : une clé ou un paramètre est enregistré. Cela ne prouve pas que le compte fonctionne.
- **Génération vérifiée** : un test réel a réussi et a renvoyé une réponse. C'est l'état le plus fiable.
- **Accès confirmé** : une lecture de compte a réussi (Tripo, Kling), sans lancer de rendu.
- **Solde** : crédits renvoyés par le fournisseur. Tripo renvoie 0 ; une génération 3D sera refusée tant que le compte n'est pas rechargé.

Le bandeau du studio affiche « IA 2 cloud configurés · Ollama 2 modèles · 0 génération vérifiée » pour cette raison : deux clés existent, mais aucune génération cloud n'a encore été validée.

## 4. FreeLLMAPI

Le connecteur est **réel et câblé** de bout en bout :

- formulaire dans **IA & quotas** ;
- champs `FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY`, `FREELLMAPI_MODEL` ;
- normalisation vers `…/v1/chat/completions` ;
- en-tête `Authorization: Bearer …` ;
- test court qui affiche la réponse du modèle ;
- prise en charge du proxy Electron pour éviter CORS.

Il n'est **pas configuré** dans le profil audité : aucune URL ni clé n'y sont enregistrées. Pour l'activer :

1. ouvrir **IA & quotas** ;
2. renseigner l'URL de la passerelle (HTTPS public, ou `http://127.0.0.1:…` en local) ;
3. renseigner la clé et le modèle ;
4. **Enregistrer**, puis **Tester · courte génération**.

Sans passerelle et sans clé, le Studio ne peut pas inventer un accès : il affiche l'état réel.

## 5. Ollama

Ollama est le moteur IA réellement actif aujourd'hui :

- lecture des modèles installés via `/api/local/ollama` ;
- test de génération via `/api/local/ollama/test` ;
- affichage du modèle, de la réponse et de la durée dans la console ;
- aucune requête cloud, aucun coût.

Le mode web statique (PWA publiée) n'affiche pas les modèles locaux, car le navigateur distant ne peut pas joindre `127.0.0.1` de la machine de l'utilisateur. Les fonctions Ollama sont donc réservées à l'application Mac/Electron et au serveur Python local.

## 6. Coûts et prudence

- Aucune génération payante n'a été lancée pendant l'audit.
- Une vérification de compte est gratuite ; une génération vidéo ou 3D peut consommer des crédits.
- Avant toute production payante, vérifier le solde et le modèle choisi dans le fournisseur.
- Ne jamais coller une clé dans un projet, un fichier versionné, une capture d'écran ou un message.

## 7. Ce qu'il faut retenir

1. **Ollama fonctionne maintenant**, sans clé.
2. **Tripo et Kling sont authentifiés**, mais Tripo n'a plus de crédit et Kling n'a pas encore été exercé en génération.
3. **FreeLLMAPI est prêt à être connecté** : il manque l'URL et la clé de la passerelle.
4. **Les autres clés ne sont pas présentes** dans ce profil ; le Studio les propose sans prétendre qu'elles fonctionnent.
5. L'interface distingue volontairement « configuré », « accès confirmé » et « génération vérifiée » pour éviter les fausses promesses.
