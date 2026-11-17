# Passerelle des agents et générateurs

Ce dossier définit la règle commune pour relier un agent ou un service IA au
Studio. Le catalogue visible dans **IA à quota gratuit** recense les offres et
les domaines ; il ne prétend pas avoir ouvert les comptes du réalisateur.

Chaque connecteur doit respecter le même contrat :

1. recevoir un `project_id`, la bible, la scène, le format, la durée et le
   numéro de version ;
2. recevoir le texte source séparé des propositions de l'agent ;
3. produire un dossier de travail avec la requête, le résultat, le modèle,
   les paramètres, la date et l'URL de licence ;
4. préserver les verrous de continuité (personnage, costume, accessoire,
   axe, regard, focale, lumière et palette) ;
5. retourner `a_configurer`, `a_connecter`, `termine` ou `echec` sans changer
   silencieusement un plan ou un dialogue ;
6. ne jamais écrire une clé API dans le dépôt ou dans un média exporté.

## Familles couvertes

- **Agents et code** : OpenCode, Claude Code, Gemini CLI et OpenHands pour
  préparer des scripts, inspecter les ponts et automatiser des tâches relues.
- **Image et storyboard** : Flow/Veo, Firefly, OpenAI Images, Stability,
  FLUX, Ideogram, Leonardo, InvokeAI et ComfyUI.
- **Vidéo et VFX** : Runway, Luma, Kling, Pika, Hailuo/MiniMax, Wan local,
  Firefly Video et Topaz Video AI.
- **Voix, transcription et son** : Qwen-TTS, Qwen-ASR, faster-whisper,
  ElevenLabs, Deepgram, Pixabay, Mixkit et Freesound CC0.
- **Musique** : ACE-Step local, Lyria, Suno et Udio, avec une fiche de droits
  obligatoire avant publication.
- **3D et animation** : Blender, Tripo, Meshy, Rokoko et les packs de cartes,
  graphiques et titres alpha du Studio.

Une entrée cataloguée n'est pas une installation. Les modèles réellement
présents sur le Samsung T7 sont indiqués dans **Mes modèles** ; les services
web demandent le compte ou la clé de l'utilisateur et les logiciels de bureau
doivent être ouverts pour valider leur pont.
