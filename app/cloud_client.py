"""Explicit provider adapters. No guessed API addresses or automatic fallback billing."""
import base64, json, os, re, time, urllib.error, urllib.parse, urllib.request
from . import providers

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward provider credentials to a redirected host.
        return None

class GoogleMediaRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        p=urllib.parse.urlparse(newurl)
        if p.scheme!='https' or not p.hostname or not (p.hostname.endswith('.googleapis.com') or p.hostname.endswith('.googleusercontent.com')):raise RuntimeError('Redirection de média Google refusée.')
        redirected=super().redirect_request(req,fp,code,msg,headers,newurl)
        if redirected and p.hostname!='generativelanguage.googleapis.com':
            for name in list(redirected.headers):
                if name.lower() in ('x-goog-api-key','authorization'):redirected.remove_header(name)
        return redirected

def request(url,payload=None,headers=None,timeout=120,binary=False):
    req=urllib.request.Request(url,json.dumps(payload).encode() if payload is not None else None,{'Content-Type':'application/json',**(headers or {})})
    try:
        with urllib.request.build_opener(GoogleMediaRedirect() if binary and urllib.parse.urlparse(url).hostname=='generativelanguage.googleapis.com' else NoRedirect()).open(req,timeout=timeout) as r:
            data=r.read(80*1024*1024+1)
            if len(data)>80*1024*1024:raise RuntimeError('Réponse du fournisseur trop volumineuse.')
            return data if binary else json.loads(data)
    except urllib.error.HTTPError as e:
        # The response may echo the prompt or a credential. Keep error output bounded and generic.
        reason={401:'Clé refusée',403:'Accès ou modèle non autorisé',404:'Modèle ou ressource indisponible',429:'Quota atteint ou requêtes trop rapprochées',400:'Paramètres refusés par le fournisseur'}.get(e.code,'Erreur du fournisseur')
        raise RuntimeError(f'{reason} (HTTP {e.code}). Vérifier le compte et le modèle configuré.') from None
    except (urllib.error.URLError,TimeoutError):raise RuntimeError('Fournisseur inaccessible ou délai dépassé.') from None

def openai_endpoint(base):
    """Accept a gateway base URL and resolve its chat-completions endpoint."""
    base=(base or '').strip()
    parsed=urllib.parse.urlparse(base)
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError('URL FreeLLMAPI invalide : adresse https attendue, ou http sur localhost.')
    if parsed.scheme=='http' and parsed.hostname not in ('127.0.0.1','localhost','::1'):
        raise RuntimeError('HTTP sans TLS est réservé à une instance FreeLLMAPI locale.')
    path=parsed.path.rstrip('/')
    if path.endswith('/chat/completions'):return urllib.parse.urlunparse((parsed.scheme,parsed.netloc,path,'','',''))
    if not path:path='/v1'
    if not path.endswith('/v1'):path+='/v1'
    return urllib.parse.urlunparse((parsed.scheme,parsed.netloc,path+'/chat/completions','','',''))

def settings(model_id):
    c=providers.connector(model_id)
    if not c or not c.get('adapter'):raise RuntimeError('Service de catalogue : aucune API officielle intégrée pour ce nom.')
    vals=providers.values(c['provider']);missing=[k for k in c['required'] if not vals.get(k)]
    if missing:raise RuntimeError('Configurer '+c['name']+' dans IA & quotas : '+', '.join(missing))
    return c,vals

def text(model_id,prompt,max_tokens=1800):
    c,v=settings(model_id);model=v.get(c['model_var']) or c['default_model'];key=v[c['required'][0]];h={'Authorization':'Bearer '+key};body={'model':model,'messages':[{'role':'user','content':prompt}],'max_tokens':max_tokens,'stream':False}
    if c['adapter']=='anthropic':
        r=request('https://api.anthropic.com/v1/messages', {k:body[k] for k in ('model','messages','max_tokens')},{'x-api-key':key,'anthropic-version':'2023-06-01'});answer='\n'.join(p.get('text','') for p in r.get('content',[]) if p.get('type')=='text')
    elif c['adapter']=='gemini':
        r=request('https://generativelanguage.googleapis.com/v1beta/models/'+urllib.parse.quote(model,safe='-._')+':generateContent',{'contents':[{'parts':[{'text':prompt}]}],'generationConfig':{'maxOutputTokens':max_tokens}},{'x-goog-api-key':key});answer='\n'.join(p.get('text','') for p in r.get('candidates',[{}])[0].get('content',{}).get('parts',[]) if not p.get('thought'))
    elif c['adapter']=='cloudflare':
        account=v['CLOUDFLARE_ACCOUNT_ID']
        if not re.fullmatch('[a-fA-F0-9]{32}',account):raise RuntimeError('Identifiant de compte Cloudflare invalide.')
        r=request('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+urllib.parse.quote(model,safe='@/.-_'),{'messages':body['messages'],'max_tokens':max_tokens},h);answer=r.get('result',{}).get('response','')
    elif c['adapter']=='cohere':
        r=request('https://api.cohere.com/v2/chat',body,h);answer='\n'.join(p.get('text','') for p in r.get('message',{}).get('content',[]))
    elif c['adapter']=='openai_compatible':
        endpoint=openai_endpoint(v['FREELLMAPI_BASE_URL']) if c['provider']=='freellmapi' else c['url']
        r=request(endpoint,body,h);content=r.get('choices',[{}])[0].get('message',{}).get('content','');answer=content if isinstance(content,str) else '\n'.join(p.get('text','') for p in content)
    else:
        r=request(c['url'],body,h);content=r.get('choices',[{}])[0].get('message',{}).get('content','');answer=content if isinstance(content,str) else '\n'.join(p.get('text','') for p in content)
    if not answer.strip():raise RuntimeError('Aucun texte retourné : vérifier la limite de sortie ou les filtres du fournisseur.')
    providers.mark_verified(c['provider'],model)
    return answer

def image(model_id,prompt,out,references=()):
    c,v=settings(model_id);model=v.get(c['model_var']) or c['default_model'];parts=[{'text':prompt}]
    import mimetypes
    for path in references[:3]:
        raw=path.read_bytes()
        if len(raw)>12*1024*1024:raise ValueError('Référence image limitée à 12 Mo.')
        mime=mimetypes.guess_type(path.name)[0] or ''
        if mime not in ('image/png','image/jpeg','image/webp'):raise ValueError('Référence PNG, JPEG ou WebP requise.')
        parts.append({'inlineData':{'mimeType':mime,'data':base64.b64encode(raw).decode()}})
    r=request('https://generativelanguage.googleapis.com/v1beta/models/'+urllib.parse.quote(model,safe='-._')+':generateContent',{'contents':[{'parts':parts}],'generationConfig':{'responseModalities':['TEXT','IMAGE']}},{'x-goog-api-key':v['GEMINI_API_KEY']},timeout=300)
    found=[]
    for p in r.get('candidates',[{}])[0].get('content',{}).get('parts',[]):
        data=p.get('inlineData',p.get('inline_data',{}))
        if data.get('data'):
            from PIL import Image
            import io
            raw=base64.b64decode(data['data']);im=Image.open(io.BytesIO(raw));im.load();dest=out/('IMAGE_GENEREE_'+str(len(found)+1)+'.png');im.save(dest);found.append(dest)
    if not found:raise RuntimeError('Le fournisseur n’a produit aucune image. Vérifier le modèle, les droits et les filtres.')
    providers.mark_verified(c['provider'],model);return found

def speech(model_id,text_value,out):
    c,v=settings(model_id);voice=v.get('ELEVENLABS_VOICE_ID')
    if not voice or not re.fullmatch('[A-Za-z0-9_-]{5,100}',voice):raise ValueError('Choisir un identifiant de voix ElevenLabs dans IA & quotas.')
    model=v.get(c['model_var']) or c['default_model'];audio=request('https://api.elevenlabs.io/v1/text-to-speech/'+voice+'?output_format=mp3_44100_128',{'text':text_value,'model_id':model},{'xi-api-key':v['ELEVENLABS_API_KEY'],'Accept':'audio/mpeg'},timeout=300,binary=True)
    if len(audio)<200:raise RuntimeError('Le fournisseur a renvoyé un fichier audio vide.')
    path=out/'VOIX.mp3';path.write_bytes(audio);providers.mark_verified(c['provider'],model);return path

def video(model_id,prompt,out,seconds=8,progress=lambda _:None,cancelled=lambda:False,references=()):
    c,v=settings(model_id);model=v.get(c['model_var']) or c['default_model'];h={'x-goog-api-key':v['GEMINI_API_KEY']};root='https://generativelanguage.googleapis.com/v1beta/'
    # Veo long-running API: poll and download the actual video, never an invented URL file.
    instance={'prompt':prompt}
    if references:
        import mimetypes
        if seconds!=8:raise ValueError('Veo avec références demande une durée de 8 secondes.')
        instance['referenceImages']=[]
        for path in references[:3]:
            mime=mimetypes.guess_type(path.name)[0]
            if mime not in ('image/png','image/jpeg','image/webp') or path.stat().st_size>12*1024*1024:raise ValueError('Référence Veo invalide ou supérieure à 12 Mo.')
            instance['referenceImages'].append({'image':{'inlineData':{'mimeType':mime,'data':base64.b64encode(path.read_bytes()).decode()}},'referenceType':'asset'})
    r=request(root+'models/'+urllib.parse.quote(model,safe='-._')+':predictLongRunning',{'instances':[instance],'parameters':{'aspectRatio':'16:9','durationSeconds':8 if seconds>=8 else 6 if seconds>=6 else 4}},h,timeout=60)
    name=r.get('name','')
    if not re.fullmatch(r'(?:models/[\w.-]+/)?operations/[\w.-]+',name):raise RuntimeError('Le fournisseur n’a pas retourné d’identifiant de génération valide.')
    deadline=time.monotonic()+600
    while not r.get('done'):
        if cancelled():raise RuntimeError('Traitement annulé ; une tâche distante déjà lancée peut continuer chez le fournisseur.')
        if time.monotonic()>deadline:raise RuntimeError('Vidéo encore en cours chez Google après 10 minutes. Identifiant : '+name)
        time.sleep(3);r=request(root+name,headers=h,timeout=30);progress(30)
    if r.get('error'):raise RuntimeError('Le fournisseur a refusé ou interrompu la génération vidéo.')
    samples=r.get('response',{}).get('generateVideoResponse',{}).get('generatedSamples',[])
    if not samples:raise RuntimeError('Aucune vidéo retournée : vérifier le compte et les filtres de génération.')
    uri=samples[0].get('video',{}).get('uri','');parsed=urllib.parse.urlparse(uri)
    if parsed.scheme!='https' or parsed.hostname!='generativelanguage.googleapis.com':raise RuntimeError('Adresse de téléchargement Google inattendue ; clé non transmise.')
    raw=request(uri,headers=h,timeout=180,binary=True)
    if len(raw)<1000:raise RuntimeError('Vidéo retournée vide.')
    path=out/'VIDEO_IA.mp4';path.write_bytes(raw);providers.mark_verified(c['provider'],model);return path

def download_asset(url):
    """Download a provider's signed asset, without forwarding any API credential."""
    import ipaddress, socket
    for _ in range(4):
        parsed=urllib.parse.urlparse(url)
        if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:raise RuntimeError('Adresse de média non autorisée.')
        try:addresses=socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
        except OSError:raise RuntimeError('Serveur du média inaccessible.') from None
        if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise RuntimeError('Adresse réseau privée refusée pour ce média.')
        try:
            with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url),timeout=180) as r:
                raw=r.read(160*1024*1024+1)
                if len(raw)>160*1024*1024:raise RuntimeError('Média distant limité à 160 Mo.')
                return raw
        except urllib.error.HTTPError as e:
            if e.code in (301,302,303,307,308) and e.headers.get('Location'):url=urllib.parse.urljoin(url,e.headers['Location']);continue
            raise RuntimeError(f'Téléchargement refusé (HTTP {e.code}).') from None
        except (urllib.error.URLError,TimeoutError):raise RuntimeError('Téléchargement du média interrompu.') from None
    raise RuntimeError('Trop de redirections du média.')

def balance(model_id):
    c,v=settings(model_id)
    if c['adapter']=='tripo':
        r=request('https://openapi.tripo3d.ai/v3/account/balance',headers={'Authorization':'Bearer '+v['TRIPO_API_KEY']})
        if r.get('code')!=0:raise RuntimeError('Le compte Tripo refuse cette requête de solde.')
        return {'connected':True,'balance':r.get('data',{}).get('balance'),'frozen':r.get('data',{}).get('frozen')}
    if c['adapter']=='kling':
        # Read-only task listing checks authentication without generating a paid video.
        r=request('https://api-singapore.klingai.com/tasks?task_ids=verification-studio',headers={'Authorization':'Bearer '+v['KLING_API_KEY']})
        if r.get('code') not in (0,1202):raise RuntimeError('La clé Kling n’a pas validé la lecture de tâches (code '+str(r.get('code'))+').')
        return {'connected':True,'balance':None}
    raise RuntimeError('Ce fournisseur ne propose pas de vérification de compte dans cet adaptateur.')

def model_3d(model_id,prompt,out,progress=lambda _:None,cancelled=lambda:False):
    c,v=settings(model_id);model=v.get(c['model_var']) or c['default_model'];h={'Authorization':'Bearer '+v['TRIPO_API_KEY']};base='https://openapi.tripo3d.ai/v3'
    if not prompt.strip() or len(prompt)>1024:raise ValueError('Le prompt 3D Tripo doit contenir de 1 à 1 024 caractères.')
    r=request(base+'/generation/text-to-model',{'prompt':prompt,'model':model},h)
    tid=r.get('data',{}).get('task_id','')
    if r.get('code')!=0 or not re.fullmatch('[A-Za-z0-9_-]{5,160}',tid):raise RuntimeError('Tripo n’a pas accepté la tâche. Vérifier la clé, les crédits et le modèle.')
    (out/'TACHE_DISTANTE.json').write_text(json.dumps({'provider':'tripo','task_id':tid,'model':model}))
    deadline=time.monotonic()+600
    while True:
        if cancelled():raise RuntimeError('Annulation locale. La tâche 3D distante peut continuer sur le compte Tripo.')
        if time.monotonic()>deadline:raise RuntimeError('La tâche Tripo continue chez le fournisseur. Identifiant conservé dans TACHE_DISTANTE.json.')
        r=request(base+'/tasks/'+tid,headers=h);d=r.get('data',{})
        if r.get('code')!=0:raise RuntimeError('Lecture de tâche refusée par Tripo.')
        progress(10+int(min(100,max(0,d.get('progress',0)))*.7))
        if d.get('status')=='success':break
        if d.get('status') in ('failed','cancelled'):raise RuntimeError('Génération Tripo échouée ou annulée.')
        time.sleep(3)
    uri=d.get('output',{}).get('model_url')
    if not uri:raise RuntimeError('Tripo n’a fourni aucun modèle à télécharger.')
    raw=download_asset(uri)
    if raw[:4]!=b'glTF':raise RuntimeError('Le résultat Tripo n’est pas un fichier GLB valide.')
    dest=out/'MODELE_GENERE.glb';dest.write_bytes(raw);providers.mark_verified(c['provider'],model);return dest

def other_video(model_id,prompt,out,seconds=5,progress=lambda _:None,cancelled=lambda:False):
    c,v=settings(model_id);model=v.get(c['model_var']) or c['default_model']
    if c['adapter']=='kling':
        if model!='kling-3.0':raise ValueError('Cet adaptateur prend en charge Kling 3.0.')
        if len(prompt)>3072:raise ValueError('Le prompt Kling est limité à 3 072 caractères. Réduire le contexte ajouté au plan.')
        base='https://api-singapore.klingai.com';h={'Authorization':'Bearer '+v['KLING_API_KEY']}
        r=request(base+'/text-to-video/kling-3.0',{'prompt':prompt,'settings':{'aspect_ratio':'16:9','duration':min(15,max(3,round(seconds))),'audio':'off','multi_shot':False,'resolution':'720p'}},h)
        tid=r.get('data',{}).get('task_id') or r.get('data',{}).get('id')
        if r.get('code')!=0 or not tid:raise RuntimeError('Kling n’a pas accepté la tâche. Vérifier les crédits et le compte.')
        query=base+'/tasks?task_ids='+urllib.parse.quote(str(tid),safe='')
    elif c['adapter']=='luma':
        base='https://api.lumalabs.ai/dream-machine/v1/generations';h={'Authorization':'Bearer '+v['LUMA_API_KEY']}
        r=request(base+'/video',{'prompt':prompt,'model':model,'aspect_ratio':'16:9','duration':'5s' if seconds<9 else '9s','resolution':'720p'},h);tid=r.get('id')
        if not tid:raise RuntimeError('Luma n’a pas accepté la tâche.')
        query=base+'/'+urllib.parse.quote(str(tid),safe='')
    else:raise ValueError('Adaptateur vidéo inconnu.')
    (out/'TACHE_DISTANTE.json').write_text(json.dumps({'provider':c['provider'],'task_id':tid,'model':model}))
    deadline=time.monotonic()+600
    while True:
        if cancelled():raise RuntimeError('Annulation locale. La tâche distante peut continuer sur le compte fournisseur.')
        if time.monotonic()>deadline:raise RuntimeError('La vidéo continue chez le fournisseur. Identifiant de tâche conservé.')
        r=request(query,headers=h);d=r.get('data',{}) if c['adapter']=='kling' else r
        if isinstance(d,list):d=d[0] if d else {}
        if isinstance(d,dict) and 'result' in d:d=d['result'][0] if d['result'] else {}
        status=d.get('status') or d.get('state') or d.get('task_status')
        if status in ('failed','cancelled'):raise RuntimeError('Le fournisseur a interrompu la génération vidéo.')
        if status in ('succeeded','completed','succeed'):
            if c['adapter']=='luma':uri=d.get('assets',{}).get('video')
            else:
                result=d.get('task_result',d.get('result',{}));videos=result.get('videos',[]) if isinstance(result,dict) else []
                uri=next((x.get('url') for x in d.get('outputs',[]) if x.get('type')=='video'),None) or (videos[0].get('url') if videos else None) or d.get('output',{}).get('video_url')
            if not uri:raise RuntimeError('La tâche est terminée mais aucun fichier vidéo n’a été fourni.')
            raw=download_asset(uri)
            if len(raw)<1000:raise RuntimeError('Vidéo retournée vide.')
            dest=out/'VIDEO_IA.mp4';dest.write_bytes(raw);providers.mark_verified(c['provider'],model);return dest
        progress(30);time.sleep(3)
