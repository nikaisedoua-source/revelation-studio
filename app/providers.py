"""Provider configuration. Never return credentials in API responses or manifests."""
import hashlib, json, os, re, threading
from datetime import datetime, timezone
from pathlib import Path
from .config import DATA
CONFIG_FILE=DATA/'provider_credentials.json'
CHECKS_FILE=DATA/'provider_checks.json'
LOCK=threading.RLock()

def spec(provider,name,adapter,model,model_var,required,kind='text',url='',source=''):
    return dict(provider=provider,name=name,adapter=adapter,default_model=model,model_var=model_var,required=required,kind=kind,url=url,source=source)
CONNECTORS={
 'google_oauth':spec('google_auth','Connexion Google','oauth','','GOOGLE_AUTH_MODEL',['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET'],'auth',source='https://developers.google.com/identity/openid-connect/openid-connect'),
 'tripo_3d':spec('tripo','Tripo 3D','tripo','v3.1-20260211','TRIPO_MODEL',['TRIPO_API_KEY'],'three_d',source='https://developers.tripo3d.ai/en/docs/quick-start'),
 'kling_video':spec('kling','Kling AI','kling','kling-3.0','KLING_MODEL',['KLING_API_KEY'],'video',source='https://kling.ai/document-api/apiReference/model/textToVideo'),
 'luma_video':spec('luma','Luma Dream Machine','luma','ray-2','LUMA_MODEL',['LUMA_API_KEY'],'video',source='https://docs.lumalabs.ai/reference/creategeneration'),
 'claude_sonnet':spec('anthropic','Claude Sonnet','anthropic','claude-sonnet-5','ANTHROPIC_MODEL',['ANTHROPIC_API_KEY'],source='https://platform.claude.com/docs/en/api/messages'),
 'gemini_flash':spec('gemini','Gemini Flash','gemini','gemini-3.5-flash','GEMINI_MODEL',['GEMINI_API_KEY'],source='https://ai.google.dev/api'),
 'gemini_image':spec('gemini','Gemini Image','gemini_image','gemini-3.1-flash-image','GEMINI_IMAGE_MODEL',['GEMINI_API_KEY'],'image',source='https://ai.google.dev/gemini-api/docs/image-generation'),
 'veo':spec('gemini','Google Veo','veo','veo-3.1-generate-preview','VEO_MODEL',['GEMINI_API_KEY'],'video',source='https://ai.google.dev/gemini-api/docs/video'),
 'groq_llama':spec('groq','Groq Llama','openai_compatible','llama-3.3-70b-versatile','GROQ_MODEL',['GROQ_API_KEY'],url='https://api.groq.com/openai/v1/chat/completions',source='https://console.groq.com/docs/api-reference'),
 'mistral_large':spec('mistral','Mistral','openai_compatible','mistral-large-latest','MISTRAL_MODEL',['MISTRAL_API_KEY'],url='https://api.mistral.ai/v1/chat/completions',source='https://docs.mistral.ai/api'),
 'openrouter_free':spec('openrouter','OpenRouter gratuit','openai_compatible','openrouter/free','OPENROUTER_MODEL',['OPENROUTER_API_KEY'],url='https://openrouter.ai/api/v1/chat/completions',source='https://openrouter.ai/openrouter/free'),
 'free_llmapi':spec('freellmapi','FreeLLMAPI','openai_compatible','auto','FREELLMAPI_MODEL',['FREELLMAPI_BASE_URL','FREELLMAPI_API_KEY'],source=''),
 'cloudflare_llama':spec('cloudflare','Cloudflare Workers AI','cloudflare','@cf/meta/llama-3.1-8b-instruct','CLOUDFLARE_MODEL',['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'],source='https://developers.cloudflare.com/workers-ai/get-started/rest-api/'),
 'cohere_command':spec('cohere','Cohere Command','cohere','command-a-plus-05-2026','COHERE_MODEL',['COHERE_API_KEY'],source='https://docs.cohere.com/v2/reference/chat'),
 'elevenlabs_tts':spec('elevenlabs','ElevenLabs','elevenlabs','eleven_multilingual_v2','ELEVENLABS_MODEL',['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID'],'tts',source='https://elevenlabs.io/docs/api-reference/text-to-speech/convert'),
}
ENV_VARS={}
for c in CONNECTORS.values():
    ENV_VARS.setdefault(c['provider'],[])
    for name in c['required']:
        if name not in ENV_VARS[c['provider']]:ENV_VARS[c['provider']].append(name)

def _read(path):
    try:return json.loads(path.read_text())
    except (OSError,ValueError):return {}

def _write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix('.tmp')
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(value,stream,ensure_ascii=False,indent=2)
    temp.chmod(0o600);temp.replace(path);path.chmod(0o600)

def connector(model_id):return CONNECTORS.get(model_id)

def values(provider):
    c=[c for c in CONNECTORS.values() if c['provider']==provider]
    names={k for x in c for k in x['required']+[x['model_var']]}
    local=_read(CONFIG_FILE).get(provider,{})
    return {name:os.environ.get(name) or local.get(name,'') for name in names}

def _fingerprint(provider):return hashlib.sha256(json.dumps(values(provider),sort_keys=True).encode()).hexdigest()

def configure(provider,settings):
    if provider not in ENV_VARS:raise ValueError('Fournisseur sans adaptateur pris en charge.')
    allowed=set(values(provider));unknown=set(settings)-allowed
    if unknown:raise ValueError('Paramètre fournisseur inconnu.')
    for name,value in settings.items():
        if not isinstance(value,str) or len(value)>2048 or any(ord(c)<32 for c in value):raise ValueError('Valeur de configuration invalide.')
        if name.endswith('_MODEL') and value and not re.fullmatch(r'[\w@/.:+-]{1,160}',value):raise ValueError('Identifiant de modèle invalide.')
    with LOCK:
        data=_read(CONFIG_FILE);entry=data.setdefault(provider,{})
        for k,v in settings.items():
            if v.strip():entry[k]=v.strip()
        _write(CONFIG_FILE,data)
    return status()[provider]

def remove(provider):
    if provider not in ENV_VARS:raise ValueError('Fournisseur inconnu.')
    with LOCK:
        data=_read(CONFIG_FILE);data.pop(provider,None);_write(CONFIG_FILE,data)
    return status()[provider]

def mark_verified(provider,model):
    with LOCK:
        checks=_read(CHECKS_FILE);checks[provider]={'at':datetime.now(timezone.utc).isoformat(),'model':model,'fingerprint':_fingerprint(provider)};_write(CHECKS_FILE,checks)

def status():
    result={};checks=_read(CHECKS_FILE)
    for provider,names in ENV_VARS.items():
        v=values(provider);cs=[c for c in CONNECTORS.values() if c['provider']==provider];check=checks.get(provider,{})
        verified=check.get('fingerprint')==_fingerprint(provider)
        result[provider]={'configured':all(bool(v.get(n)) for n in names),'variables':names,'models':[{**c,'model':v.get(c['model_var']) or c['default_model']} for c in cs], 'fields':[{'name':n,'secret':bool(re.search(r'(KEY|TOKEN|SECRET|PASSWORD)$',n)),'configured':bool(v.get(n)),'environment':bool(os.environ.get(n)),'value':'' if re.search(r'(KEY|TOKEN|SECRET|PASSWORD)$',n) else v.get(n,'')} for n in sorted(v)],'last_verified':check.get('at') if verified else None,'verified_model':check.get('model') if verified else None,'state':'Génération vérifiée' if verified else 'Configuré · test requis' if all(v.get(n) for n in names) else 'Clé ou paramètre requis'}
    return result
