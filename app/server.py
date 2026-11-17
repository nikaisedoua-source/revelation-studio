import concurrent.futures, hashlib, importlib.util, json, os, re, secrets, shutil, subprocess, sys, threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import registry, outputs, cinema, catalog, project_data, providers, quality, motion_script, bridges, workspace, film_workflow, anthropic_client, generic_client, cloud_client, config, google_oauth, photoshop_capture, resource_curator
import urllib.parse

ROOT=config.ROOT;DATA=config.DATA;DATA.mkdir(parents=True,exist_ok=True)
JOBS=DATA/'jobs';JOBS.mkdir(exist_ok=True)
UPLOADS=DATA/'uploads';UPLOADS.mkdir(exist_ok=True)
BRIDGE=DATA/'ponts'
for name in ['photoshop','premiere','after_effects','resolve','blender']:(BRIDGE/name/'inbox').mkdir(parents=True,exist_ok=True)
EXTERNAL=registry.EXTERNAL
EXPORTS=config.EXPORTS
LOCAL_EXPORTS=DATA/'productions_locales'
AUTH_FILE=DATA/'auth.json'
AUTH_BACKUPS=DATA/'auth_backups';AUTH_BACKUPS.mkdir(exist_ok=True)
TOKEN=None
SESSIONS={}
SESSION_TTL=8*60*60
MIN_PASSWORD_LENGTH=12
KDF_PARAMS={'n':2**15,'r':8,'p':1}
LOGIN_FAILURES={}
MAX_LOGIN_FAILURES=5
LOCKOUT_SECONDS=90
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=1,thread_name_prefix='studio-render')
LOCK=threading.RLock();LIVE={};PROCESSES={}
app=FastAPI(title='Révélation AI Studio',docs_url=None,redoc_url=None)

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_REDIRECT_URI = "http://localhost:8848/api/auth/google/callback"

PUBLIC_PATHS={'/','/api/bootstrap','/api/auth/state','/api/auth/setup','/api/auth/login','/api/auth/recover','/api/auth/google/login','/api/auth/google/callback'}

def _auth_record():
    if not AUTH_FILE.exists():
        return None
    try:return json.loads(AUTH_FILE.read_text(encoding='utf-8'))
    except (OSError,json.JSONDecodeError):return None

def _session_valid(token):
    if not token or token not in SESSIONS:return False
    session=SESSIONS[token]
    if time.time()-session['last_seen']>SESSION_TTL:
        SESSIONS.pop(token,None)
        global TOKEN
        if TOKEN==token:TOKEN=None
        return False
    session['last_seen']=time.time()
    return True

def _authorized(request:Request):
    provided=request.headers.get('x-studio-token') or request.query_params.get('token')
    return _session_valid(provided)

def _password_hash(password,salt=None,params=None):
    salt=salt or secrets.token_bytes(16)
    params=params or KDF_PARAMS
    # Explicit maxmem keeps the stronger 32 MiB scrypt profile portable across
    # the bundled Python/OpenSSL builds instead of falling back silently.
    digest=hashlib.scrypt(password.encode('utf-8'),salt=salt,n=int(params['n']),r=int(params['r']),p=int(params['p']),maxmem=64*1024*1024)
    return salt.hex(),digest.hex()

def _check_password(password,record):
    try:
        # Keep old profiles readable while all new profiles use the stronger
        # versioned parameters below.
        params=record.get('kdf') or {'n':2**14,'r':8,'p':1}
        _,digest=_password_hash(password,bytes.fromhex(record['salt']),params)
        return secrets.compare_digest(digest,record['digest'])
    except (KeyError,ValueError,TypeError):return False

def _validate_new_password(password):
    if len(password)<MIN_PASSWORD_LENGTH:
        raise HTTPException(422,f'Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères.')
    if password.strip()!=password:
        raise HTTPException(422,'Le mot de passe ne doit pas commencer ou finir par un espace.')

def _login_key(request):return request.client.host if request.client else 'local'

def _check_login_lock(request):
    key=_login_key(request);entry=LOGIN_FAILURES.get(key)
    if not entry:return
    count,locked_until=entry
    if locked_until and time.time()<locked_until:
        remain=max(1,int(locked_until-time.time()))
        raise HTTPException(429,f'Trop de tentatives. Réessayer dans {remain} secondes.')
    if locked_until and time.time()>=locked_until:LOGIN_FAILURES.pop(key,None)

def _record_login_failure(request):
    key=_login_key(request);count,locked_until=LOGIN_FAILURES.get(key,(0,0));count+=1
    LOGIN_FAILURES[key]=(count,time.time()+LOCKOUT_SECONDS if count>=MAX_LOGIN_FAILURES else 0)

def _clear_login_failures(request):LOGIN_FAILURES.pop(_login_key(request),None)

def _session(identity):
    global TOKEN
    TOKEN=secrets.token_urlsafe(32);SESSIONS[TOKEN]={'created_at':time.time(),'last_seen':time.time()}
    return {'token':TOKEN,'profile':{'identity':identity}}

@app.middleware('http')
async def local_only(request:Request,call_next):
 host=request.headers.get('host','')
 if host not in [f'127.0.0.1:{config.PORT}',f'localhost:{config.PORT}','testserver']:return JSONResponse({'detail':'Hôte local requis'},403)
 path=request.url.path
 public=path in PUBLIC_PATHS or path.startswith('/static')
 if not public and not _authorized(request):return JSONResponse({'detail':'Session verrouillée. Se connecter dans Révélation AI Studio.'},403)
 origin=request.headers.get('origin')
 if origin and origin not in [f'http://127.0.0.1:{config.PORT}',f'http://localhost:{config.PORT}']:return JSONResponse({'detail':'Origine locale requise'},403)
 response=await call_next(request)
 # The local Studio serves project metadata, auth state and file URLs. Do not
 # let WebKit or a browser cache a previous session or a stale job list.
 response.headers['Cache-Control']='no-store'
 response.headers['Pragma']='no-cache'
 response.headers['Referrer-Policy']='no-referrer'
 response.headers['X-Content-Type-Options']='nosniff'
 return response

def now():return datetime.now(timezone.utc).isoformat()

class AuthSpec(BaseModel):
    # Identity is optional during login; the previous min_length=1 validator
    # caused the login form to return 422 before checking the password.
    identity:str=Field(default='',max_length=120)
    password:str=Field(default='',max_length=200)

@app.get('/api/auth/state')
def auth_state(request:Request):
    rec=_auth_record()
    authenticated=_authorized(request)
    return {'configured':bool(rec),'authenticated':authenticated,'profile':({'identity':rec.get('identity','')} if rec and authenticated else None),'requires_setup':not bool(rec)}

@app.post('/api/auth/setup')
def auth_setup(s:AuthSpec):
    if _auth_record():raise HTTPException(409,'Le profil local existe déjà. Utiliser la connexion.')
    identity=s.identity.strip()
    if not identity:raise HTTPException(422,'Indiquer une identité de réalisateur ou de studio.')
    _validate_new_password(s.password)
    salt,digest=_password_hash(s.password)
    record={'identity':identity,'salt':salt,'digest':digest,'created_at':now(),'updated_at':now(),'algorithm':'scrypt','kdf':KDF_PARAMS,'password_policy':{'min_length':MIN_PASSWORD_LENGTH}}
    tmp=AUTH_FILE.with_suffix('.tmp');tmp.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(AUTH_FILE)
    try:AUTH_FILE.chmod(0o600)
    except OSError:pass
    return _session(identity)

@app.post('/api/auth/login')
def auth_login(s:AuthSpec,request:Request):
    _check_login_lock(request)
    rec=_auth_record()
    if not rec or not s.password or not _check_password(s.password,rec):
        _record_login_failure(request);raise HTTPException(401,'Mot de passe incorrect.')
    _clear_login_failures(request)
    return _session(rec.get('identity',''))

@app.get('/api/auth/google/login')
def google_login(request:Request):
    record=_auth_record();link=request.query_params.get('mode')=='link'
    if link and not _authorized(request):raise HTTPException(403,'Ouvrir le Studio avec le mot de passe avant d’associer Google.')
    if not link and not (record or {}).get('google_sub'):raise HTTPException(409,'Associer d’abord Google depuis Compte & sauvegarde après une connexion locale.')
    token=request.headers.get('x-studio-token') or request.query_params.get('token') if link else None
    try:url=google_oauth.begin(str(request.base_url).rstrip('/')+'/api/auth/google/callback',token)
    except ValueError as e:raise HTTPException(409,str(e))
    return RedirectResponse(url,status_code=303)

@app.get('/api/auth/google/callback')
def google_callback(request:Request):
    if request.query_params.get('error'):raise HTTPException(409,'Autorisation Google annulée.')
    try:identity,entry=google_oauth.finish(request.query_params.get('state',''),request.query_params.get('code',''))
    except ValueError as e:raise HTTPException(401,str(e))
    record=_auth_record()
    if record is None:raise HTTPException(409,'Créer d’abord le profil local.')
    if entry.get('link_token'):
        if not _session_valid(entry['link_token']):raise HTTPException(403,'Session locale expirée pendant l’association Google.')
        record['google_sub']=identity['sub'];record['google_email']=identity['email'];_write_auth(record)
    elif record.get('google_sub')!=identity['sub']:raise HTTPException(403,'Ce compte Google n’est pas associé à ce profil local.')
    token=_session(record['identity'])['token']
    from fastapi.responses import HTMLResponse
    return HTMLResponse('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Connexion validée</title><script>sessionStorage.setItem("studio-oauth-token",'+json.dumps(token)+');location.replace("/");</script><p>Connexion validée. Retour au Studio.</p></html>')

@app.post('/api/auth/logout')
def auth_logout(request:Request):
    global TOKEN
    provided=request.headers.get('x-studio-token')
    SESSIONS.pop(provided,None)
    if TOKEN==provided:TOKEN=None
    return {'logged_out':True}

def jobpath(jid):
 if not re.fullmatch('[a-f0-9]{12}',jid):raise HTTPException(404,'Tâche inconnue')
 return JOBS/(jid+'.json')
def readjob(jid):
 p=jobpath(jid)
 if not p.exists():raise HTTPException(404,'Tâche inconnue')
 return json.loads(p.read_text())
def savejob(j):
 with LOCK:
  p=jobpath(j['id']);tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(j,ensure_ascii=False,indent=2));tmp.replace(p)
def update(j,**kw):j.update(kw);j['updated_at']=now();savejob(j)

class JobSpec(BaseModel):
 kind:str=Field(pattern='^(ps_motion|image|video|film_bundle|film_animatic|scenario|decoupage|video_script|storyboard|animatic|sound|graphic|three_d|music|motion_advice|transition_advice|color_advice|vfx_advice|photoshop_advice|motion|color|transition|vfx|photoshop|tts|asr|ocr)$')
 motion_script:str=Field(default='',max_length=14000)
 brief:str=Field(default='',max_length=14000)
 title:str=Field(default='KACOU 183',max_length=90)
 subtitle:str=Field(default='BIENTÔT DISPONIBLE',max_length=140)
 model:str='gemma4'
 seconds:float=Field(default=5,ge=3,le=120)
 fps:int=Field(default=25,ge=24,le=60)
 style:str=Field(default='cinema',pattern='^(cinema|clean|bold|neon|lower)$')
 color:str=Field(default='#dfba75',pattern='^#[0-9a-fA-F]{6}$')
 look:str=Field(default='ambre',pattern='^(neutre|ambre|acier|noir)$')
 input_space:str=Field(default='inconnu',max_length=100)
 contrast:float|None=Field(default=None,ge=.7,le=1.4)
 saturation:float|None=Field(default=None,ge=0,le=1.5)
 temperature:float|None=Field(default=None,ge=-.08,le=.08)
 assets:list[str]=Field(default_factory=list,max_length=20)
 project_id:str=Field(default='revelation-studio',max_length=64)
 scene_id:str=Field(default='',max_length=120)
 shot_id:str=Field(default='',max_length=120)
 capture_id:str=Field(default='',pattern='^([a-f0-9]{12})?$')
 characters:list[dict]=Field(default_factory=list,max_length=40)
 scenes:list[dict]=Field(default_factory=list,max_length=20)
 graphic_kind:str=Field(default='barres',pattern='^(barres|ligne|carte)$')
 data:str=Field(default='35, 62, 48, 78, 91',max_length=1000)
 three_d_kind:str=Field(default='carton',pattern='^(carton|objet|logo|carte)$')
 voice_description:str=Field(default='Voix française naturelle, posée, articulation claire.',max_length=1000)

def asset_path(aid):
 if not re.fullmatch('[a-f0-9]{12}',aid):raise ValueError('Identifiant média invalide')
 matches=list(UPLOADS.glob(aid+'.*'))
 if len(matches)!=1:raise ValueError('Média introuvable')
 return matches[0]

def subtask(args,out,j,timeout=900):
 with (out/'moteur.log').open('w') as log:
  env=dict(os.environ);env['HF_HOME']=str(EXTERNAL/'cache_huggingface');env['PYTHONPATH']=str(ROOT);env['HF_HUB_OFFLINE']='1'
  p=subprocess.Popen(args,cwd=ROOT,stdout=log,stderr=log,env=env,start_new_session=True)
  PROCESSES[j['id']]=p;start=time.monotonic()
  try:
   while p.poll() is None:
    if time.monotonic()-start>timeout:p.terminate();raise RuntimeError('Le délai du moteur est dépassé. Réduire la durée ou utiliser un modèle plus léger.')
    if LIVE.get(j['id'])=='cancel':p.terminate();raise RuntimeError('Traitement annulé.')
    time.sleep(.5)
   if p.returncode:raise RuntimeError((out/'moteur.log').read_text(errors='replace')[-2000:])
  finally:
   PROCESSES.pop(j['id'],None)
   if p.poll() is None:p.terminate()

def execute(j):
 try:
  if LIVE.get(j['id'])=='cancel':update(j,status='cancelled');return
  destination=config.production_root()
  destination.mkdir(parents=True,exist_ok=True);out=destination/j['id'];out.mkdir(exist_ok=True)
  update(j,status='running',progress=8,output_dir=str(out));s=j['spec'];kind=s['kind']
  (out/'DEMANDE_ORIGINALE.json').write_text(json.dumps(s,ensure_ascii=False,indent=2))
  (out/'CHARTE_CINEMA.txt').write_text(cinema.CHARTER)
  (out/'REFERENCES.json').write_text(json.dumps(cinema.SOURCES,ensure_ascii=False,indent=2))
  def progress(n):
   if LIVE.get(j['id'])=='cancel':raise RuntimeError('Traitement annulé.')
   update(j,progress=n)
  if kind in ['scenario','decoupage','video_script','storyboard'] or kind.endswith('_advice'):
   task=kind.removesuffix('_advice');m=registry.model_by_id(s['model'])
   if m['kind']!='text':raise ValueError('Choisir un modèle de texte pour cette tâche.')
   prompt=cinema.prompt_for('video_script' if kind=='video_script' else task,s['brief'],s['seconds'],s['fps'])
   if m['engine']=='ollama':
    answer=registry.request_json('http://127.0.0.1:11434/api/chat',{'model':m['model'],'messages':[{'role':'system','content':cinema.CHARTER},{'role':'user','content':prompt}],'stream':False,'keep_alive':0,'options':{'num_predict':1600,'num_ctx':8192}},timeout=300)
    text=answer.get('message',{}).get('content','')
    if not text.strip():raise RuntimeError('Le moteur n’a retourné aucun texte.')
    (out/'proposition.md').write_text(text,encoding='utf-8')
   elif m['engine']=='opencode':
    (out/'REQUETE_AGENT.json').write_text(json.dumps({'prompt':cinema.CHARTER+'\n'+prompt},ensure_ascii=False))
    subtask([sys.executable,'-m','app.opencode_worker',str(out/'REQUETE_AGENT.json'),str(out)],out,j,timeout=210)
   elif m['engine']=='anthropic':
    text=anthropic_client.request_claude(cinema.CHARTER+'\n\n'+prompt)
    (out/'proposition.md').write_text(text,encoding='utf-8')
   elif m['engine']=='api_generic':
    text=generic_client.request_generic_api(m['id'], cinema.CHARTER+'\n\n'+prompt)
    (out/'proposition.md').write_text(text,encoding='utf-8')
   else:
    request={'model':m,'action':'text','prompt':cinema.CHARTER+'\n\n'+prompt,'max_tokens':1800}
    (out/'REQUETE_MODELE.json').write_text(json.dumps(request,ensure_ascii=False))
    subtask([sys.executable,'-m','app.ml_worker',str(out/'REQUETE_MODELE.json'),str(out)],out,j)
   j['model_used']=m['id']
   if kind=='storyboard':
    generated=(out/'proposition.md').read_text(encoding='utf-8') if (out/'proposition.md').exists() else ''
    outputs.storyboard_pack(s,out,generated)
  elif kind in ['film_bundle','film_animatic']:
   film_workflow.export_pack(s['film_snapshot'],out,asset_path,render=kind=='film_animatic',progress=progress)
  elif kind=='animatic':
   outputs.animatic_pack(s,out,[asset_path(a) for a in s['assets']],progress)
  elif kind=='sound':
   outputs.sound_pack(s,out);outputs.sound_design(s,out)
  elif kind=='image':
   cloud_client.image(s['model'],cinema.CHARTER+'\n'+s['brief'],out,[asset_path(a) for a in s['assets']]);j['model_used']=s['model']
  elif kind=='graphic':
   outputs.graphic_pack(s,out,progress)
  elif kind=='three_d':
   m={'engine':'procedural'} if s['model']=='procedural' else registry.model_by_id(s['model'])
   if m['engine']=='api_generic' and m['id']=='tripo_3d':
    cloud_client.model_3d(m['id'],s['brief'],out,progress,lambda:LIVE.get(j['id'])=='cancel');outputs.three_d_pack(s,out);j['model_used']=m['id']
   elif m['engine'] in ['hunyuan3d', 'trellis']:
    # These models run as separate heavy processes; the Studio acts as a proxy
    port=8000 if m['engine']=='hunyuan3d' else 8001
    try:
     res=registry.request_json(f'http://localhost:{port}/generate',{'prompt':s['brief'],'quality':'high'})
     (out/'proposition.md').write_text(res.get('description','Génération 3D terminée.'),encoding='utf-8')
     (out/'model_url.txt').write_text(res.get('url',''),encoding='utf-8')
    except Exception as e:
     raise RuntimeError(f'Le serveur {m["name"]} n\'est pas lancé sur le port {port}. Lancer le serveur du modèle d\'abord.')
   else:
    outputs.three_d_pack(s,out)
   if Path(bridges.APPS['blender']).exists():bridges.build_blender(out)
  elif kind=='music':
   outputs.sound_design(s,out)
  elif kind=='ps_motion':
   source=DATA/'photoshop_captures'/s['capture_id']
   if not s['capture_id'] or not (source/'TEXTE_PHOTOSHOP.png').is_file():raise ValueError('Capturer d’abord le texte Photoshop actif.')
   motion_script.render(dict(s,motion_script=f"0-{s['seconds']} | Capture Photoshop | | montee"),out,progress,source/'TEXTE_PHOTOSHOP.png')
   for name in ['SOURCE_EDITABLE.psd','TEXTES_SOURCE.json']:shutil.copy2(source/name,out/name)
   (out/'UTILISATION_MOTION.md').write_text('Animation d’une capture Photoshop avec styles conservés dans le PNG et source PSD modifiable. Le document original reste intact. Le JSX After Effects importe le PNG ; pour modifier les mots ou les effets, ouvrir SOURCE_EDITABLE.psd dans Photoshop puis effectuer une nouvelle capture. Cette opération crée une nouvelle production. Aucun TextPlus Fusion éditable n’est prétendu pour la capture raster. Le MP4 est un aperçu ; le MOV ProRes 4444 est le master alpha.\n',encoding='utf-8')
  elif kind=='motion':
   motion_script.render(s,out,progress)
  elif kind=='video':
   video_fn=cloud_client.video if s['model']=='veo' else cloud_client.other_video
   video_kwargs={'references':[asset_path(a) for a in s['assets']]} if s['model']=='veo' else {}
   video_fn(s['model'],s['brief'],out,s['seconds'],progress,lambda:LIVE.get(j['id'])=='cancel',**video_kwargs);j['model_used']=s['model']
  elif kind=='color':outputs.color_pack({k:v for k,v in s.items() if v is not None},out)
  elif kind=='photoshop':outputs.photoshop_pack(s,out)
  elif kind=='vfx':
   if s['seconds']>20:raise ValueError('Choisir un élément de 3 à 20 secondes.')
   outputs.effect_pack(s,out,progress)
  elif kind=='transition':outputs.transition_pack(s,out,[asset_path(a) for a in s['assets']],progress)
  elif kind in ['tts','asr','ocr']:
   m=registry.model_by_id(s['model'])
   if m['kind']!=kind:raise ValueError('Le modèle choisi n’est pas adapté à cette tâche.')
   if kind=='tts' and m['engine']=='api_generic':
    cloud_client.speech(m['id'],s['brief'],out);j['model_used']=m['id']
   else:
    request={'model':m,'action':kind,'text':s['brief'],'voice_description':s['voice_description'],'prompt':'OCR: transcrire exactement le texte visible sans le commenter. Conserver les retours à la ligne.','max_tokens':2000}
    if kind in ['asr','ocr']:
     if not s['assets']:raise ValueError('Ajouter un fichier à traiter.')
     original=asset_path(s['assets'][0])
     if kind=='asr':
      audio=out/'source_audio.wav';r=subprocess.run([str(outputs.FFMPEG),'-y','-hide_banner','-loglevel','error','-i',str(original),'-t','600','-vn','-ac','1','-ar','16000',str(audio)],capture_output=True,timeout=120)
      if r.returncode:raise RuntimeError('Le fichier ne contient pas d’audio exploitable : '+r.stderr.decode()[-500:])
      request['audio']=str(audio)
     else:request['image']=str(original)
    (out/'REQUETE_MODELE.json').write_text(json.dumps(request,ensure_ascii=False))
    python=os.environ.get('REVELATION_WHISPER_PYTHON') or sys.executable
    subtask([python,'-m','app.ml_worker',str(out/'REQUETE_MODELE.json'),str(out)],out,j)
    j['model_used']=m['id']
  else:raise ValueError('Tâche non prise en charge')
  # Every successful pack gets a stable audit manifest before the job's file
  # list is exposed. This makes delivery reviewable and reproducible offline.
  # Keep a durable task marker in generated Fusion nodes for return shortcuts.
  for setting in out.glob('*.setting'):
   source=setting.read_text(encoding='utf-8');match=re.search(r'(?m)^\s*([A-Za-z]\w*)\s*=\s*TextPlus',source)
   if match:
    old=match.group(1);new='RS_'+j['id']
    source=re.sub(r'(?m)^(\s*)'+re.escape(old)+r'(\s*=\s*TextPlus)',lambda m:m[1]+new+m[2],source,count=1)
    source=source.replace('SourceOp = "'+old+'"','SourceOp = "'+new+'"').replace('SourceOp="'+old+'"','SourceOp="'+new+'"')
    setting.write_text(source,encoding='utf-8')
  quality.write_pack_manifest(out,j['id'],s)
  workspace.register(j)
  files=[]
  for p in out.iterdir():
   if p.is_file() and not p.name.startswith('._'):files.append({'name':p.name,'bytes':p.stat().st_size,'url':'/api/files/'+j['id']+'/'+p.name+'?token='+str(TOKEN or '')})
  textfile=next((out/n for n in ['proposition.md','transcription.txt'] if (out/n).exists()),None)
  update(j,status='complete',progress=100,files=files,text=textfile.read_text() if textfile else None)
 except Exception as e:update(j,status='cancelled' if LIVE.get(j['id'])=='cancel' else 'failed',error=str(e),progress=0)

@app.get('/api/bootstrap')
def bootstrap(request:Request):
 rec=_auth_record();auth=_authorized(request)
 return {'token':TOKEN if auth else None,'version':'0.11.1','name':'Révélation AI Studio','output_root':str(config.production_root()),'charter':cinema.CHARTER,'sources':cinema.SOURCES,'auth':{'configured':bool(rec),'authenticated':auth,'requires_setup':not bool(rec),'profile':({'identity':rec.get('identity','')} if rec and auth else None),'google_configured':all(google_oauth.client()),'google_linked':bool(rec and rec.get('google_sub'))},'catalog_date':catalog.CATALOG_DATE,'catalog_version':catalog.CATALOG_VERSION}

@app.get('/api/status')
def status():
 states=bridges.states()
 tests={}
 job_records=[]
 for p in JOBS.glob('*.json'):
  try:d=json.loads(p.read_text())
  except (OSError,json.JSONDecodeError):continue
  job_records.append(d)
  if d.get('status')=='complete' and d.get('model_used'):tests[d['model_used']]=d['updated_at']
 models=registry.inventory(bool(importlib.util.find_spec('mlx')))
 for m in models:
  if m['id'] in tests:m['state']='Exécuté dans le Studio';m['last_success']=tests[m['id']];m['execution_verified']=True
 project_list=project_data.list_projects()
 ffmpeg_ok=outputs.FFMPEG.exists() and os.access(outputs.FFMPEG,os.X_OK)
 auth=_auth_record()
 context={'apps':states,'models':models,'external_mounted':EXTERNAL.is_dir(),'ffmpeg':ffmpeg_ok,'jobs':job_records,'auth':{'configured':bool(auth)},'auth_path':str(AUTH_FILE)}
 reports={p.get('id','revelation-studio'):quality.assess(p,context) for p in project_list}
 counts={}
 for d in job_records:counts[d.get('status','unknown')]=counts.get(d.get('status','unknown'),0)+1
 diagnostics={'runtime':{'python':sys.version.split()[0],'ffmpeg':str(outputs.FFMPEG),'ffmpeg_executable':ffmpeg_ok},'disk':{'mounted':EXTERNAL.is_dir(),'free_bytes':shutil.disk_usage(EXTERNAL).free if EXTERNAL.exists() else 0,'output_root':str(config.production_root())},'jobs':{'counts':counts,'total':len(job_records)},'models':{'present':sum(bool(m.get('present')) for m in models),'runnable':sum(bool(m.get('can_run')) for m in models)},'security':{'auth_configured':bool(auth),'auth_permissions':oct(AUTH_FILE.stat().st_mode & 0o777) if AUTH_FILE.exists() else None,'secrets_in_response':False}}
 return {'models':models,'apps':states,'external_mounted':EXTERNAL.is_dir(),'external_free_bytes':shutil.disk_usage(EXTERNAL).free if EXTERNAL.exists() else 0,'output_root':str(config.production_root()),'queue_workers':1,'catalog':catalog.catalog(),'provider_status':providers.status(),'projects':project_list,'quality':reports.get('revelation-studio'),'quality_reports':reports,'diagnostics':diagnostics}

class MotionPlanSpec(BaseModel):
 script:str=Field(max_length=14000)
 seconds:float=Field(default=30,ge=3,le=120)
 fps:int=Field(default=25,ge=24,le=60)

@app.post('/api/motion/plan')
def plan_motion(s:MotionPlanSpec):
 try:return motion_script.parse_script(s.script,s.seconds,s.fps)
 except ValueError as e:raise HTTPException(422,str(e))

@app.get('/api/workspace')
def get_workspace():return workspace.ensure()

class WorkspaceOpen(BaseModel):
 folder:str='root'

@app.post('/api/workspace/open')
def open_workspace(s:WorkspaceOpen):
 try:p=workspace.open_path(s.folder)
 except ValueError as e:raise HTTPException(400,str(e))
 subprocess.run(['/usr/bin/open',str(p)],check=True,timeout=10)
 return {'opened':True,'path':str(p)}

@app.post('/api/connections/{target}/activate')
def activate_bridge(target:str):
 if target not in bridges.APPS:raise HTTPException(404)
 return bridges.activate(target)

@app.post('/api/connections/{target}/open')
def open_connected_app(target:str):
 if target not in bridges.APPS:raise HTTPException(404)
 path=Path(bridges.APPS[target])
 if not path.is_dir():raise HTTPException(409,'Logiciel non détecté. Configurer son emplacement dans le lanceur.')
 subprocess.run(['/usr/bin/open','-a',str(path)],check=True,timeout=10)
 return {'opened':True,'message':'Ouverture demandée. Tester le pont pour confirmer la connexion.'}

@app.post('/api/connections/{target}/folder')
def open_bridge_folder(target:str):
 if target not in bridges.APPS:raise HTTPException(404)
 folder=bridges.BASE/target
 try:
  folder.mkdir(parents=True,exist_ok=True)
  if sys.platform=='darwin':subprocess.run(['/usr/bin/open',str(folder)],check=True,timeout=10)
  elif os.name=='nt':os.startfile(str(folder))
  else:subprocess.run(['xdg-open',str(folder)],check=True,timeout=10)
 except (OSError,subprocess.SubprocessError) as e:
  raise HTTPException(409,'Dossier du pont inaccessible : '+str(e)) from None
 return {'opened':True,'folder':str(folder),'message':'Dossier du pont ouvert. Les demandes, heartbeats et confirmations y sont conservés.'}

@app.post('/api/connections/photoshop/capture')
def capture_photoshop_text():
 try:return photoshop_capture.capture()
 except (RuntimeError,OSError) as e:raise HTTPException(409,str(e))

@app.get('/api/providers/catalog')
def provider_catalog():
    return catalog.catalog()

def _ollama_models():
    payload=registry.request_json('http://127.0.0.1:11434/api/tags',timeout=2)
    return [item for item in payload.get('models',[]) if isinstance(item,dict) and isinstance(item.get('name'),str)]

@app.get('/api/local/ollama')
def local_ollama_status():
    try:
        models=_ollama_models()
        return {'connected':True,'models':[{'name':item['name'],'size':item.get('size',0)} for item in models]}
    except Exception:
        return {'connected':False,'models':[]}

class OllamaTest(BaseModel):
    model:str=Field(min_length=1,max_length=160)

@app.post('/api/local/ollama/test')
def local_ollama_test(s:OllamaTest):
    try:
        names={item['name'] for item in _ollama_models()}
    except Exception:
        raise HTTPException(503,'Ollama local ne répond pas sur 127.0.0.1:11434. Lancez ollama serve.')
    if s.model not in names:raise HTTPException(422,'Modèle Ollama non installé sur ce Mac.')
    try:
        started=time.monotonic()
        result=registry.request_json('http://127.0.0.1:11434/api/generate',{'model':s.model,'prompt':'Réponds uniquement par le mot OK.','stream':False,'options':{'num_predict':8}},timeout=90)
        answer=str(result.get('response','')).strip()
        if not answer:raise RuntimeError('Réponse vide du modèle.')
        return {'ok':True,'model':s.model,'answer':answer[:200],'seconds':round(time.monotonic()-started,2)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502,'Test Ollama échoué : '+str(e)[:160])

class ProviderSettings(BaseModel):
    settings:dict[str,str]=Field(default_factory=dict,max_length=15)

@app.post('/api/providers/{provider}/configure')
def configure_provider(provider:str,s:ProviderSettings):
    try:return providers.configure(provider,s.settings)
    except ValueError as e:raise HTTPException(422,str(e))

@app.post('/api/providers/{provider}/remove')
def remove_provider(provider:str):
    try:return providers.remove(provider)
    except ValueError as e:raise HTTPException(422,str(e))

class ProviderTest(BaseModel):
    model_id:str=Field(max_length=80)

@app.post('/api/providers/{provider}/check')
def check_provider_account(provider:str,s:ProviderTest):
    c=providers.connector(s.model_id)
    if not c or c['provider']!=provider:raise HTTPException(422,'Fournisseur ou modèle inconnu.')
    try:return cloud_client.balance(s.model_id)
    except (RuntimeError,ValueError) as e:raise HTTPException(409,str(e))

@app.post('/api/providers/{provider}/test')
def test_provider(provider:str,s:ProviderTest):
    c=providers.connector(s.model_id)
    if not c or c['provider']!=provider:raise HTTPException(422,'Modèle sans adaptateur pour ce fournisseur.')
    if c['kind']!='text':raise HTTPException(422,'Tester ce moteur en produisant un média depuis Image / Vidéo ou Voix & son.')
    try:answer=cloud_client.text(s.model_id,'Réponds seulement : connexion vérifiée.',64)
    except (RuntimeError,ValueError) as e:raise HTTPException(409,str(e))
    return {'verified':True,'answer':answer,'status':providers.status()[provider]}

class PasswordSpec(BaseModel):
    current_password:str=Field(default='',max_length=200)
    password:str=Field(min_length=12,max_length=200)
    recovery_key:str=Field(default='',max_length=200)

def _write_auth(record):
    providers._write(AUTH_FILE,record)

@app.post('/api/auth/password')
def change_password(s:PasswordSpec):
    record=_auth_record()
    if not record or not _check_password(s.current_password,record):raise HTTPException(401,'Mot de passe actuel incorrect.')
    _validate_new_password(s.password)
    salt,digest=_password_hash(s.password)
    record.update(salt=salt,digest=digest,kdf=KDF_PARAMS,updated_at=now());_write_auth(record)
    SESSIONS.clear()
    return dict(_session(record['identity']),changed=True)

@app.post('/api/auth/recovery-key')
def recovery_key():
    record=_auth_record();value=secrets.token_hex(32)
    record['recovery_digest']=hashlib.sha256(value.encode()).hexdigest();_write_auth(record)
    return {'recovery_key':'-'.join(value[i:i+8] for i in range(0,64,8)),'message':'Conserver hors du Mac. Une nouvelle clé remplace la précédente.'}

@app.post('/api/auth/recover')
def recover_password(s:PasswordSpec,request:Request):
    _check_login_lock(request);record=_auth_record();value=re.sub('[^a-fA-F0-9]','',s.recovery_key).lower()
    digest=hashlib.sha256(value.encode()).hexdigest()
    if not record or not record.get('recovery_digest') or not secrets.compare_digest(digest,record['recovery_digest']):
        _record_login_failure(request);raise HTTPException(401,'Clé de secours incorrecte ou non créée.')
    _validate_new_password(s.password);salt,digest=_password_hash(s.password)
    record.update(salt=salt,digest=digest,kdf=KDF_PARAMS,updated_at=now());record.pop('recovery_digest',None);_write_auth(record)
    _clear_login_failures(request);SESSIONS.clear()
    return _session(record['identity'])

@app.get('/api/projects')
def projects():
    return project_data.list_projects()

class ProjectSpec(BaseModel):
    id:str|None=None
    title:str=Field(default='Nouveau projet',min_length=1,max_length=140)
    author:str=Field(default='',max_length=120)
    format:str=Field(default='16:9',pattern='^(16:9|2.39:1|1:1|9:16)$')
    fps:int=Field(default=25,ge=24,le=60)
    characters:list[dict]=Field(default_factory=list,max_length=40)
    scenes:list[dict]=Field(default_factory=list,max_length=100)
    continuity:dict=Field(default_factory=dict)

@app.post('/api/projects')
def create_project(s:ProjectSpec):
    payload=s.model_dump(exclude_unset=True)
    existing=project_data.get_project(payload.get('id') or project_data.slug(payload.get('title','Nouveau projet')))
    if existing and not payload.get('id'):raise HTTPException(409,'Un projet porte déjà ce nom. Choisir un autre titre.')
    if existing and 'characters' in payload:
        prior_chars=existing.get('characters',[]);merged_chars=[]
        for character in payload['characters']:
            old=next((c for c in prior_chars if isinstance(c,dict) and (c.get('id')==character.get('id') or c.get('name')==character.get('name'))),None)
            item=dict(old or {});item.update(character)
            if old and old.get('id'):item['id']=old['id']
            merged_chars.append(item)
        payload['characters']=merged_chars
    if existing and 'scenes' in payload:
        prior=existing.get('scenes',[]);merged=[]
        for scene in payload['scenes']:
            old=next((x for x in prior if x.get('id')==scene.get('id')),None)
            if old is None:old=next((x for x in prior if x.get('title')==scene.get('title')),None)
            if old:
                row=dict(old);row.update({k:v for k,v in scene.items() if k not in ['id','shot_list']})
                if scene.get('shot_list'):row['shot_list']=scene['shot_list']
                if any(old.get(k,'')!=row.get(k,'') for k in ['action','dialogue_source']):
                    row['screenplay']=row.get('action','')+'\n\n'+row.get('dialogue_source','')
                    for q in row.get('shot_list',[]):q['review']='a_revoir';q['stale']=True
                merged.append(row)
            else:merged.append(scene)
        payload['scenes']=merged
    if existing:
        try:payload=film_workflow.prepare_save(existing,payload)
        except ValueError as e:raise HTTPException(422,str(e))
    return project_data.save_project(payload)

@app.get('/api/projects/{project_id}')
def project(project_id:str):
    p=project_data.get_project(project_id)
    if p is None:raise HTTPException(404,'Projet inconnu')
    return p

@app.post('/api/projects/{project_id}/import-teaser')
def import_teaser(project_id:str):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}',project_id):
        raise HTTPException(422,'Identifiant de projet invalide')
    p=project_data.import_kacou_teaser(project_id)
    if p is None:raise HTTPException(404,'Dossier source du teaser introuvable')
    return p

@app.get('/api/quality/{project_id}')
def project_quality(project_id:str):
 p=project_data.get_project(project_id)
 if p is None:raise HTTPException(404,'Projet inconnu')
 current=status()
 return current.get('quality_reports',{}).get(project_id) or quality.assess(p,{'apps':current['apps'],'models':current['models'],'external_mounted':current['external_mounted'],'ffmpeg':current['diagnostics']['runtime']['ffmpeg_executable'],'jobs':[],'auth':{'configured':bool(_auth_record())},'auth_path':str(AUTH_FILE)})

@app.get('/api/diagnostics')
def diagnostics():
 return status().get('diagnostics',{})

@app.get('/api/jobs')
def jobs():
 result=[]
 for p in JOBS.glob('*.json'):
  d=json.loads(p.read_text())
  d['files']=[f for f in d.get('files',[]) if not str(f.get('name','')).startswith('._')]
  for f in d['files']:
   f['url']='/api/files/'+d['id']+'/'+f['name']+'?token='+str(TOKEN or '')
  result.append(d)
 return sorted(result,key=lambda x:x['created_at'],reverse=True)[:100]

@app.post('/api/jobs')
def create_job(spec:JobSpec):
 if spec.kind in ['image','video']:
  try:m=registry.model_by_id(spec.model)
  except ValueError as e:raise HTTPException(422,str(e))
  if m['kind']!=spec.kind:raise HTTPException(422,'Le modèle choisi ne correspond pas au média demandé.')
  if not spec.brief.strip():raise HTTPException(422,'Décrire le plan à générer.')
 if spec.kind=='motion':
  try:motion_script.parse_script(spec.motion_script or f'0-{spec.seconds} | {spec.title} | {spec.subtitle} | montee',spec.seconds,spec.fps)
  except ValueError as e:raise HTTPException(422,str(e))
 jid=uuid.uuid4().hex[:12];j={'id':jid,'status':'queued','progress':0,'created_at':now(),'updated_at':now(),'spec':spec.model_dump(),'files':[]}
 if spec.kind in ['image','video'] and spec.shot_id:
  p=project_data.get_project(spec.project_id)
  if p is None:raise HTTPException(404,'Projet inconnu')
  node=next((n for n in film_workflow.report(p)['nodes'] if n['shot_id']==spec.shot_id and n['scene_id']==spec.scene_id),None)
  if node is None:raise HTTPException(422,'Plan absent du projet choisi.')
  j['spec']['brief_original']=spec.brief
  j['spec']['brief']=node['prompt']+'\n\nINTENTION COMPLÉMENTAIRE :\n'+spec.brief
  j['spec']['project_revision']=p.get('revision',0)
 if spec.kind in ['film_bundle','film_animatic']:
  p=project_data.get_project(spec.project_id)
  if p is None:raise HTTPException(404,'Projet inconnu')
  j['spec']['film_snapshot']=film_workflow.normalize(p)
 savejob(j);POOL.submit(execute,j);return j

class OpenJobSpec(BaseModel):
 filename:str|None=None

class AttachSpec(BaseModel):
 expected_revision:int

@app.post('/api/jobs/{jid}/attach')
def attach_job_media(jid:str,s:AttachSpec):
 j=readjob(jid)
 if j['status']!='complete' or j['spec']['kind'] not in ['image','video']:raise HTTPException(409,'Une image ou une vidéo terminée est requise.')
 spec=j['spec'];p=project_data.get_project(spec['project_id'])
 if p is None:raise HTTPException(404,'Projet introuvable.')
 p=film_workflow.normalize(p)
 scene=next((sc for sc in p['scenes'] if sc['id']==spec.get('scene_id')),None)
 shot=next((q for q in scene['shot_list'] if q['id']==spec.get('shot_id')),None) if scene else None
 if shot is None:raise HTTPException(409,'Le plan de destination a été supprimé.')
 root=Path(j['output_dir']);media=next((root/f['name'] for f in j['files'] if Path(f['name']).suffix.lower() in (['.png','.jpg','.jpeg'] if spec['kind']=='image' else ['.mp4'])),None)
 if media is None or not media.is_file():raise HTTPException(409,'Média absent. Rebrancher son disque de production.')
 if p.get('revision',0)!=s.expected_revision:raise HTTPException(409,'Le projet a changé. Recharger avant d’associer le média.')
 aid=uuid.uuid4().hex[:12];shutil.copy2(media,UPLOADS/(aid+media.suffix.lower()))
 shot['reference_asset_id' if spec['kind']=='image' else 'clip_asset_id']=aid;shot['review']='a_revoir';shot['stale']=True
 try:updated=project_data.save_project(p,s.expected_revision)
 except ValueError as e:raise HTTPException(409,str(e))
 return {'attached':True,'asset_id':aid,'project_revision':updated.get('revision')}

@app.post('/api/jobs/{jid}/open')
def open_job(jid:str,s:OpenJobSpec):
 j=readjob(jid);p=Path(j.get('output_dir','/nonexistent'))
 if s.filename:
  candidate=(p/s.filename).resolve()
  if candidate.parent!=p.resolve() or not candidate.is_file():raise HTTPException(404)
  p=candidate
 if not p.exists():raise HTTPException(409,'Le disque contenant cette production est absent.')
 args=['/usr/bin/open','-R',str(p)] if p.is_file() else ['/usr/bin/open',str(p)]
 subprocess.run(args,check=True,timeout=10)
 return {'opened':True,'path':str(p)}

@app.post('/api/jobs/{jid}/edit-source')
def edit_job_source(jid:str):
 j=readjob(jid);root=Path(j.get('output_dir','/nonexistent'));source=root/'SOURCE_EDITABLE.psd'
 if not source.is_file():raise HTTPException(409,'Cette production ne contient pas de source PSD.')
 code='(function(){var d=app.open(new File('+json.dumps(str(source))+'));d.info.caption="REVELATION_JOB:'+jid+'";})();'
 try:bridges.adobe_script('photoshop',code)
 except RuntimeError as e:raise HTTPException(409,str(e))
 return {'opened':True,'message':'Source PSD ouverte. Modifier puis effectuer une nouvelle capture dans le Studio.'}

@app.post('/api/jobs/{jid}/cancel')
def cancel(jid:str):
 j=readjob(jid)
 if j['status'] not in ['queued','running']:raise HTTPException(409,'La tâche est déjà terminée')
 LIVE[jid]='cancel';return {'requested':True}

@app.get('/api/files/{jid}/{name}')
def getfile(jid:str,name:str,request:Request):
 j=readjob(jid);root=Path(j.get('output_dir','/nonexistent')).resolve();p=(root/name).resolve()
 if p.parent!=root or p.name.startswith('.') or not p.is_file():raise HTTPException(404)
 return FileResponse(p,filename=p.name)

@app.get('/api/preview/{jid}/{name}')
def preview(jid:str,name:str,request:Request):
 j=readjob(jid);root=Path(j.get('output_dir','/nonexistent')).resolve();p=(root/name).resolve()
 if p.parent!=root or p.suffix not in ['.jpg','.png','.mp4','.wav'] or not p.is_file():raise HTTPException(404)
 return FileResponse(p)

@app.post('/api/upload')
async def upload(file:UploadFile=File(...)):
 ext=Path(file.filename or '').suffix.lower()
 if ext not in ['.mp4','.mov','.mkv','.wav','.mp3','.m4a','.png','.jpg','.jpeg','.webp','.aif','.aiff']:raise HTTPException(400,'Format non pris en charge')
 aid=uuid.uuid4().hex[:12];p=UPLOADS/(aid+ext);total=0
 try:
  with p.open('wb') as out:
   while block:=await file.read(4*1024*1024):
    total+=len(block)
    if total>2_000_000_000:raise HTTPException(413,'Fichier limité à 2 Go')
    out.write(block)
 except Exception:p.unlink(missing_ok=True);raise
 return {'id':aid,'name':file.filename,'bytes':total}

@app.get('/api/assets/{aid}')
def get_asset(aid:str):
 try:p=asset_path(aid)
 except ValueError as e:raise HTTPException(404,str(e))
 return FileResponse(p)

class FilmSaveSpec(BaseModel):
 project:dict
 expected_revision:int=0

class FilmImportSpec(BaseModel):
 text:str=Field(min_length=1,max_length=200000)
 apply:bool=False
 expected_revision:int=0

class FilmRevisionSpec(BaseModel):
 expected_revision:int=0

class FilmRestoreSpec(FilmRevisionSpec):
 version_id:str=Field(max_length=80)

@app.get('/api/film/{pid}')
def get_film(pid:str):
 p=project_data.get_project(pid)
 if p is None:raise HTTPException(404,'Projet inconnu')
 return {'project':film_workflow.normalize(p),'report':film_workflow.report(p),'history':project_data.history(pid)}

@app.post('/api/film/{pid}/save')
def save_film(pid:str,s:FilmSaveSpec):
 p=project_data.get_project(pid)
 if p is None:raise HTTPException(404,'Projet inconnu')
 try:
  payload=film_workflow.prepare_save(p,s.project);payload['id']=pid
  result=project_data.save_project(payload,s.expected_revision)
 except ValueError as e:raise HTTPException(409 if 'autre fenêtre' in str(e) else 422,str(e))
 return {'project':result,'report':film_workflow.report(result),'history':project_data.history(pid)}

@app.post('/api/film/{pid}/import')
def import_film(pid:str,s:FilmImportSpec):
 p=project_data.get_project(pid)
 if p is None:raise HTTPException(404,'Projet inconnu')
 try:
  preview=film_workflow.parse_fountain(s.text)
  if not s.apply:return preview
  updated=project_data.save_project(film_workflow.append_fountain(p,s.text),s.expected_revision)
 except ValueError as e:raise HTTPException(422,str(e))
 return {'project':updated,'report':film_workflow.report(updated),'history':project_data.history(pid)}

@app.post('/api/film/{pid}/coverage')
def cover_film(pid:str,s:FilmRevisionSpec):
 p=project_data.get_project(pid)
 if p is None:raise HTTPException(404,'Projet inconnu')
 try:updated=project_data.save_project(film_workflow.add_coverage(p),s.expected_revision)
 except ValueError as e:raise HTTPException(409,str(e))
 return {'project':updated,'report':film_workflow.report(updated),'history':project_data.history(pid)}

@app.post('/api/film/{pid}/restore')
def restore_film(pid:str,s:FilmRestoreSpec):
 try:updated=project_data.restore(pid,s.version_id,s.expected_revision)
 except ValueError as e:raise HTTPException(409,str(e))
 return {'project':updated,'report':film_workflow.report(updated),'history':project_data.history(pid)}

def call_resolve(command):
 r=subprocess.run([sys.executable,str(ROOT/'app/resolve_bridge.py')],input=json.dumps(command),text=True,capture_output=True,timeout=25)
 try:d=json.loads(r.stdout.strip().splitlines()[-1])
 except Exception:d={'error':r.stderr[-1000:] or 'Resolve n’a pas répondu.'}
 if r.returncode or d.get('error'):raise HTTPException(409,d.get('error','Connexion indisponible'))
 return d

@app.post('/api/connections/resolve')
def resolve_status():
 try:d=call_resolve({'action':'status'})
 except HTTPException as e:d={'connected':False,'error':e.detail}
 bridges._record('resolve',d);return d

class SendSpec(BaseModel):
 target:str=Field(pattern='^(resolve|photoshop|premiere|after_effects|blender)$')
 filename:str|None=None

@app.post('/api/jobs/{jid}/send')
def send(jid:str,s:SendSpec):
 j=readjob(jid)
 if j['status']!='complete':raise HTTPException(409,'La génération doit être terminée')
 root=Path(j['output_dir']);name=s.filename
 if not root.is_dir():raise HTTPException(409,'Le disque contenant cette production est absent. Rebrancher le Samsung T7.')
 if s.target=='resolve':
  candidates=[p for p in root.iterdir() if p.suffix in ['.mov','.mp4','.wav','.png'] and (name is None or name==p.name)]
  if not name and (root/'MOTION_TRANSPARENT.mov').exists():candidates=[root/'MOTION_TRANSPARENT.mov']
  if not candidates:raise HTTPException(400,'Aucun média importable')
  return call_resolve({'action':'import','paths':[str(p) for p in candidates]})
 if s.target=='photoshop' and j['spec']['kind']!='photoshop':raise HTTPException(400,'Créer un pack texte Photoshop pour ce pont')
 if s.target=='after_effects' and j['spec']['kind'] not in ['motion','ps_motion']:raise HTTPException(400,'Créer un titre animé pour ce pont')
 if s.target=='blender' and j['spec']['kind']!='three_d':raise HTTPException(400,'Créer un pack 3D pour ce pont')
 payload={'id':jid,'created_at':now(),'target':s.target,'settings':j['spec'],'output_dir':str(root),'kind':j['spec']['kind']}
 if s.target=='premiere':
  payload['paths']=[str(p) for p in root.iterdir() if p.suffix in ['.mov','.mp4','.wav','.png','.aep'] and (name is None or name==p.name)]
  if not name and (root/'MOTION_TRANSPARENT.mov').exists():payload['paths']=[str(root/'MOTION_TRANSPARENT.mov')]
  if not payload['paths']:raise HTTPException(400,'Aucun média importable dans ce pack')
 if s.target=='after_effects' or s.target=='photoshop':
  source=root/('motion_after_effects.jsx' if s.target=='after_effects' and (root/'motion_after_effects.jsx').exists() else 'titre_after_effects.jsx' if s.target=='after_effects' else 'texte_photoshop.jsx')
  try:return bridges.send_adobe(s.target,jid,source)
  except Exception as e:raise HTTPException(409,str(e))
 if s.target=='blender':
  try:return bridges.send_blender(jid,root)
  except Exception as e:raise HTTPException(409,str(e))
 (BRIDGE/s.target/'inbox'/(jid+'.json')).write_text(json.dumps(payload,ensure_ascii=False,indent=2))
 return {'queued':True,'message':'Demande déposée dans le pont. Ouvrir le panneau du logiciel et cliquer sur Appliquer.','bridge_folder':str(BRIDGE/s.target)}

@app.get('/api/connections/{target}/results')
def bridge_results(target:str):
 if target not in ['photoshop','premiere','after_effects','blender']:raise HTTPException(404)
 return [json.loads(p.read_text()) for p in (BRIDGE/target).glob('result_*.json')]

class ResourceRequest(BaseModel):
    project_id: str
    text: str
    style: str = "spirituel"
    themes: list[str] = ["hospital", "dark_room", "old_man", "bible", "ambient_music"]
    scenes: list[dict] = []

@app.post('/api/resources/curate')
def curate_resources(req: ResourceRequest, request: Request):
    if not _authorized(request): raise HTTPException(401)
    try:
        curator = resource_curator.init_curator(req.project_id)
        script_path = curator.generate_elevenlabs_script(req.text, req.style)
        stocks = curator.curate_stock_list(req.themes)
        ai_prompts = curator.create_ai_prompts(req.scenes)
        return {
            "status": "success",
            "script_path": script_path,
            "stock_suggestions": stocks,
            "ai_prompts": ai_prompts,
            "resources_dir": str(curator.resources_dir)
        }
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get('/')
def index():return FileResponse(ROOT/'web/index.html')
app.mount('/static',StaticFiles(directory=ROOT/'web'),name='static')

@app.on_event('startup')
def mark_interrupted_jobs():
 for p in JOBS.glob('*.json'):
  if p.name.startswith('._'):continue
  try:j=json.loads(p.read_text())
  except (OSError,ValueError):continue
  if j.get('status') in ['running','queued']:update(j,status='interrupted',error='Le Studio a été fermé pendant le traitement. Relancer la demande.')
