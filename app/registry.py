import json, socket, urllib.request, importlib.util, subprocess
from pathlib import Path
from . import providers
from .config import HOME, EXTERNAL

MODELS=[
 # --- CLOUD (Zéro charge machine / Gratuit selon quotas) ---
 { 'id':'claude_sonnet','name':'Claude Sonnet','role':'Intelligence générale et direction artistique','engine':'anthropic','path':'api','kind':'text' },
 { 'id':'ia_studio','name':'IA Studio Core','role':'Moteur central de production','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'flow_ia','name':'Flow IA','role':'Assistant de flux créatif','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'adis_ia','name':'Adis IA','role':'Analyse et synthèse','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'veo','name':'Google Veo','role':'Génération vidéo cinématographique','engine':'api_generic','path':'api','kind':'video' },
 { 'id':'replica','name':'Replica IA','role':'Interaction et dialogue','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'gemini_flash','name':'Gemini Flash','role':'Analyse rapide et contextes longs','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'groq_llama','name':'Llama 3.1 (Groq)','role':'Vitesse extrême et raisonnement','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'mistral_large','name':'Mistral Large','role':'Écriture française et précision','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'openrouter_free','name':'OpenRouter Free','role':'Agrégateur de modèles gratuits','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'cloudflare_llama','name':'Llama 3 (Cloudflare)','role':'Inférence Edge rapide','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'cohere_command','name':'Cohere Command R+','role':'RAG et recherche documentaire','engine':'api_generic','path':'api','kind':'text' },
 { 'id':'elevenlabs_tts','name':'ElevenLabs TTS','role':'Voix hyper-réalistes','engine':'api_generic','path':'api','kind':'tts' },

 {'id':'gemini_image','name':'Gemini Image','role':'Images et références de personnages','engine':'api_generic','path':'api','kind':'image'},
 {'id': 'tripo_3d', 'name': 'Tripo 3D', 'role': 'Génération three_d', 'engine': 'api_generic', 'path': 'api', 'kind': 'three_d'},
 {'id': 'kling_video', 'name': 'Kling AI', 'role': 'Génération video', 'engine': 'api_generic', 'path': 'api', 'kind': 'video'},
 {'id': 'luma_video', 'name': 'Luma Dream Machine', 'role': 'Génération video', 'engine': 'api_generic', 'path': 'api', 'kind': 'video'},
 {'id':'opencode_local','name':'OpenCode · Ollama local','role':'Agent de proposition de scripts et de workflows','engine':'opencode','path':str(Path(__file__).resolve().parents[1]/'data/tools/opencode/node_modules/.bin/opencode'),'kind':'text'},
 # --- LOCAL LÉGER (Optimisé pour Mac) ---
 { 'id':'gemma4','name':'Gemma 4 · 12B','role':'Scénarios et direction artistique','engine':'mlx_vlm','path':str(EXTERNAL/'modeles/lmstudio-community/gemma-4-12B-it-MLX-4bit'),'kind':'text'},
 { 'id':'qwen_tts','name':'Qwen3-TTS · VoiceDesign','role':'Voix de synthèse sur description','engine':'mlx_audio','path':str(EXTERNAL/'modeles/mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit'),'kind':'tts'},
 { 'id':'qwen_asr','name':'Qwen3-ASR · 1.7B','role':'Transcription et préparation des sous-titres','engine':'mlx_audio','path':str(EXTERNAL/'modeles/mlx-community/Qwen3-ASR-1.7B-4bit'),'kind':'asr'},
 { 'id':'paddleocr','name':'PaddleOCR-VL · 1.6','role':'Lecture de documents et repérage de texte','engine':'mlx_vlm','path':str(EXTERNAL/'modeles/mlx-community/PaddleOCR-VL-1.6-4bit'),'kind':'ocr'},

 # --- LOCAL LOURD (À utiliser avec prudence) ---
 { 'id':'hunyuan3d','name':'Hunyuan3D-2','role':'Génération 3D haute fidélité','engine':'hunyuan3d','path':str(EXTERNAL/'modeles/hunyuan3d'),'kind':'three_d','note':'Modèle lourd : nécessite GPU dédié et installation spécifique.' },
 { 'id':'trellis','name':'TRELLIS','role':'Génération 3D structurée','engine':'trellis','path':str(EXTERNAL/'modeles/trellis'),'kind':'three_d','note':'Modèle lourd : nécessite GPU dédié et installation spécifique.' },
 { 'id':'qwen27','name':'Qwen 3.8 · 27B','role':'Écriture et vision','engine':'mlx_vlm','path':'/Volumes/Samsung T7/IA /lmstudio-community/Qwen3.8-27B-MLX-4bit','kind':'text','note':'Modèle lourd pour 24 Go de mémoire partagée.'},
 { 'id':'gptoss','name':'gpt-oss · 20B','role':'Raisonnement et écriture','engine':'mlx_lm','path':str(HOME/'lmstudio/models/mlx-community/gpt-oss-20b-MXFP4-Q8'),'kind':'text'},
 { 'id':'qwythos','name':'Qwythos · 9B','role':'Texte · fichier GGUF archivé','engine':'lmstudio','path':str(HOME/'.lmstudio/models-old/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF/Qwythos-9B-Claude-Mythos-5-1M-Q4_K_M.gguf'),'kind':'text','note':'Le nom du fichier ne désigne pas un modèle officiel Anthropic.'},
 { 'id':'kokoro','name':'Kokoro · 82M','role':'Synthèse vocale · voix anglaise locale','engine':'kokoro_legacy','path':str(HOME/'.cache/huggingface/hub/models--hexgrad--Kokoro-82M/snapshots/f3ff3571791e39611d31c381e3a1a3af07b4987'),'kind':'tts','note':'Le cache actuel ne contient pas de voix française.'},
 { 'id':'whisper_small','name':'Whisper small · faster-whisper','role':'Transcription locale de secours','engine':'faster_whisper','path':str(HOME/'Documents/Codex/2026-09-25/j/work/model-small'),'kind':'asr'},
 { 'id':'whisper_tiny','name':'Whisper tiny · faster-whisper','role':'Transcription rapide','engine':'faster_whisper','path':str(HOME/'Documents/Codex/2026-09-25/j/work/model-tiny'),'kind':'asr'},
 { 'id':'moss_gguf','name':'MOSS v1.5 · GGUF Q8','role':'Voix · ancien moteur C++','engine':'moss_cpp','path':str(HOME/'Documents/Codex/2026-08-15/cr-en-un-environnement-python-d/work/moss-v15-q8.gguf'),'kind':'tts','note':'Les poids sont conservés ; aucun binaire du moteur C++ validé.'},
]

def request_json(url,data=None,timeout=3):
 encoded=json.dumps(data).encode() if data is not None else None
 req=urllib.request.Request(url,encoded,{'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)

def model_by_id(mid):
 for m in MODELS:
  if m['id']==mid:return m
 if mid.startswith('ollama:'):
  return {'id':mid,'name':mid[7:],'engine':'ollama','kind':'text','model':mid[7:]}
 raise ValueError('Modèle inconnu')

def inventory(runtime_ok=True):
 result=[]
 for entry in MODELS:
  m=dict(entry)
  if m['path']=='api':
   c=providers.connector(m['id']);m['present']=False;m['cloud']=True;m['adapter_available']=bool(c);m['execution_verified']=False
   if c:
    v=providers.values(c['provider']);m['can_run']=all(bool(v.get(n)) for n in c['required']);st=providers.status()[c['provider']];m['state']=st['state'];m['provider']=c['provider'];m['api_model']=v.get(c['model_var']) or c['default_model']
    if st.get('verified_model')==m['api_model']:m['execution_verified']=True;m['last_success']=st['last_verified']
   else:m['can_run']=False;m['state']='Catalogue seulement · API officielle à identifier'
   result.append(m);continue
  p=Path(m['path']);m['present']=p.exists()
  if not m['present']:m['state']='Disque ou fichier absent'
  elif m['engine'] in ['moss_cpp','kokoro_legacy','mlx_audio_music','lmstudio']:m['state']='Poids présents · adaptateur à configurer'
  elif not runtime_ok:m['state']='Poids présents · moteur indisponible'
  else:m['state']='Moteur disponible · essai requis'
  modules={'mlx_lm':'mlx_lm','mlx_vlm':'mlx_vlm','mlx_audio':'mlx_audio'}
  available=bool(importlib.util.find_spec(modules[m['engine']])) if m['engine'] in modules else False
  if m['engine']=='opencode':available=p.is_file()
  if m['engine']=='faster_whisper':
   runner=HOME/'Documents/Codex/2026-09-25/j/work/transcription-venv/bin/python'
   available=runner.is_file()
  m['can_run']=m['present'] and available
  m['execution_verified']=False
  if m['present'] and not available:m['state']='Poids présents · adaptateur indisponible'
  if m['can_run']:m['state']='Moteur configuré · essai requis'
  result.append(m)
 try:
  for x in request_json('http://127.0.0.1:11434/api/tags')['models']:
   result.append({'id':'ollama:'+x['name'],'name':x['name'],'role':'Écriture et préparation technique','engine':'ollama','kind':'text','present':True,'can_run':True,'state':'Ollama connecté','bytes':x['size']})
 except Exception:pass
 return result
