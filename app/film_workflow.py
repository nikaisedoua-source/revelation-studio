"""Connected screenplay, shot board and production packets. All content stays local."""
from __future__ import annotations
import copy,csv,hashlib,json,re,subprocess,tempfile,uuid
from pathlib import Path
from . import project_data,outputs

REFERENCE={'name':'ScreenWeaver','url':'https://www.screenweaver.ai/','mcp':'https://app.screenweaver.ai/api/mcp','docs':'https://www.screenweaver.ai/mcp','verified_on':'2026-10-24','remote_connected':False}
HEAD=re.compile(r'^(?:INT\.?\s*[/.-]?\s*EXT\.?|EXT\.?\s*[/.-]?\s*INT\.?|INT\.|EXT\.|I/E\.|\.(?=\S))',re.I)

def digest(value):return hashlib.sha256(value.encode('utf-8')).hexdigest()
def body(scene):return scene.get('screenplay',scene.get('action','')+('\n\n'+scene['dialogue_source'] if scene.get('dialogue_source') else ''))

def normalize(project):
 p=copy.deepcopy(project);p.setdefault('revision',0);p.setdefault('art_direction','');p.setdefault('film_notes','');p.setdefault('places','');p.setdefault('props','')
 for i,s in enumerate(p.get('scenes',[])):
  s.setdefault('id','scene-'+uuid.uuid4().hex[:10]);s['number']=i+1;s.setdefault('act','Acte 1');s.setdefault('beat','');s.setdefault('location','');s.setdefault('screenplay',body(s))
  for k,q in enumerate(s.get('shot_list',[])):
   q.setdefault('id',s['id']+'-plan-'+str(k+1));q.setdefault('duration',5);q.setdefault('frame',q.get('value','plan moyen'));q.setdefault('angle','hauteur du regard');q.setdefault('lens','50 mm');q.setdefault('movement','fixe');q.setdefault('light','source motivée à préciser');q.setdefault('action',s.get('action',''));q.setdefault('characters',s.get('characters',[]));q.setdefault('review','brouillon');q.setdefault('source_hash',digest(s['screenplay']));q.setdefault('reference_asset_id','');q.setdefault('clip_asset_id','')
 return p

def validate_payload(p):
 if p.get('format','16:9') not in ['16:9','9:16','1:1','2.39:1'] or not isinstance(p.get('fps',25),int) or not 24<=p.get('fps',25)<=60:raise ValueError('Format ou cadence invalide.')
 if len(p.get('scenes',[]))>100:raise ValueError('Limite de 100 scènes par projet.')
 if len(json.dumps(p,ensure_ascii=False))>600000:raise ValueError('Projet trop volumineux : limiter le texte à 600 000 caractères.')
 charids=[str(c.get('id') or c.get('name') or '') for c in p.get('characters',[])]
 if any(not c for c in charids) or len(set(charids))!=len(charids):raise ValueError('Chaque personnage doit garder un identifiant unique.')
 ids=set();shots=set()
 for s in p.get('scenes',[]):
  if not re.fullmatch(r'[\w-]{1,80}',s.get('id','')) or s['id'] in ids:raise ValueError('Chaque scène doit garder un identifiant unique.')
  ids.add(s['id'])
  if len(s.get('shot_list',[]))>40:raise ValueError('Limite de 40 plans par scène.')
  for q in s.get('shot_list',[]):
   if not re.fullmatch(r'[\w-]{1,100}',q.get('id','')) or q['id'] in shots:raise ValueError('Chaque plan doit garder un identifiant unique.')
   shots.add(q['id'])
   try:d=float(q.get('duration',5))
   except (ValueError,TypeError):raise ValueError('Durée de plan invalide.')
   if not 0.6<=d<=120:raise ValueError('Chaque plan doit durer entre 0,6 et 120 secondes.')
   if q.get('review') not in ['brouillon','a_revoir','approuve']:raise ValueError('État de validation du plan invalide.')
   for field in ['reference_asset_id','clip_asset_id']:
    if q.get(field) and not re.fullmatch('[a-f0-9]{12}',q[field]):raise ValueError('Référence média invalide.')
 return p

def shot_fingerprint(p,s,q):
 fields={k:q.get(k) for k in ['frame','angle','lens','movement','light','duration','action','characters','reference_asset_id','clip_asset_id']}
 selected={str(c.get('id') or c.get('name')):c for c in p.get('characters',[]) if isinstance(c,dict) and str(c.get('id') or c.get('name')) in q.get('characters',[])}
 return digest(json.dumps({'source':s['screenplay'],'format':p.get('format'),'fps':p.get('fps'),'location':s.get('location'),'art_direction':p.get('art_direction'),'bible':selected,'props':p.get('props'),'places':p.get('places'),'continuity':p.get('continuity'),'shot':fields},ensure_ascii=False,sort_keys=True))

def prepare_save(current,payload):
 p=normalize(current)
 if 'scenes' in payload and (not isinstance(payload['scenes'],list) or any(not isinstance(s,dict) or not isinstance(s.get('shot_list',[]),list) or any(not isinstance(q,dict) for q in s.get('shot_list',[])) for s in payload['scenes'])):raise ValueError('Structure de scènes ou de plans invalide.')
 if 'characters' in payload and (not isinstance(payload['characters'],list) or any(not isinstance(c,dict) for c in payload['characters'])):raise ValueError('Structure de personnages invalide.')
 for key in ['title','author','art_direction','film_notes','characters','places','props','scenes','format','fps','continuity']:
  if key in payload:p[key]=copy.deepcopy(payload[key])
 p=normalize(p);old={s['id']:s for s in normalize(current).get('scenes',[])}
 for s in p.get('scenes',[]):
  previous=old.get(s['id']);changed=bool(previous and body(previous)!=s['screenplay'])
  if changed:
   for q in s.get('shot_list',[]):q['review']='a_revoir';q['stale']=True
  previous_shots={q['id']:q for q in (previous or {}).get('shot_list',[])}
  for q in s.get('shot_list',[]):
   oldq=previous_shots.get(q['id'])
   if oldq and oldq.get('review')=='approuve' and shot_fingerprint(normalize(current),previous,oldq)!=shot_fingerprint(p,s,q):q['review']='a_revoir';q['stale']=True
   if q.get('review')=='approuve':q['approval_hash']=shot_fingerprint(p,s,q)
   if q.get('review')=='approuve':q['source_hash']=digest(s['screenplay']);q['stale']=False
 return validate_payload(p)

def parse_fountain(text):
 if not text.strip() or len(text)>200000:raise ValueError('Fournir un scénario de 1 à 200 000 caractères.')
 lines=text.splitlines(keepends=True);scenes=[];preamble=[];current=None;used=set()
 for line in lines:
  stripped=line.strip()
  if HEAD.match(stripped):
   match=re.search(r'\s+#([\w-]{1,80})#\s*$',stripped)
   sid=match[1] if match else 'scene-'+uuid.uuid4().hex[:10]
   if sid in used:raise ValueError('Numéro de scène dupliqué dans le Fountain.')
   used.add(sid);title=stripped[:match.start()].strip() if match else stripped
   if title.startswith('.'):title=title[1:]
   current={'id':sid,'number':len(scenes)+1,'title':title,'screenplay':'','action':'','dialogue_source':'','characters':[],'shot_list':[],'act':'Acte 1','beat':'','location':title}
   scenes.append(current)
  elif current is None:preamble.append(line)
  else:current['screenplay']+=line
 if not scenes:raise ValueError('Aucune scène trouvée. Commencer par INT. SALLE — JOUR ou EXT. RUE — NUIT.')
 return {'source_text':text,'source_sha256':digest(text),'preamble':''.join(preamble),'scenes':scenes,'warnings':['Import en ajout : les scènes et plans déjà présents seront conservés.']}

def append_fountain(current,text):
 parsed=parse_fountain(text);p=normalize(current);used={s['id'] for s in p['scenes']}
 for s in parsed['scenes']:
  if s['id'] in used:s['id']='scene-'+uuid.uuid4().hex[:10]
  used.add(s['id']);s['number']=len(p['scenes'])+1;p['scenes'].append(s)
 p.setdefault('script_imports',[]);p['script_imports'].append({'sha256':parsed['source_sha256'],'text':text,'preamble':parsed['preamble']})
 return validate_payload(normalize(p))

def add_coverage(current):
 p=normalize(current)
 for s in p['scenes']:
  if not s.get('shot_list'):
   s['shot_list']=[{'id':s['id']+'-plan-'+uuid.uuid4().hex[:6],'frame':'plan moyen','angle':'hauteur du regard','lens':'50 mm','movement':'fixe','light':'source motivée à préciser','duration':5,'action':s.get('action','') or 'Action visible à préciser par le réalisateur','characters':s.get('characters',[]),'review':'brouillon','source_hash':digest(s['screenplay']),'reference_asset_id':'','clip_asset_id':''}]
 return normalize(p)

def prompt(p,s,q):
 chars={str(c.get('id') or c.get('name')):c for c in p.get('characters',[]) if isinstance(c,dict)}
 lines=[p.get('art_direction',''),f"SCÈNE {s['id']} : {s['title']}",f"PLAN {q['id']} : {q['frame']}, angle {q['angle']}, focale {q['lens']}, mouvement {q['movement']}, durée {q['duration']} s.",f"ACTION : {q['action']}",f"LUMIÈRE : {q['light']}",f"LIEU : {s.get('location','')}",f"CONTINUITÉ PROJET : {json.dumps(p.get('continuity',{}),ensure_ascii=False)}"]
 for cid in q.get('characters',[]):
  c=chars.get(str(cid));lines.append('PERSONNAGE VERROUILLÉ : '+json.dumps(c,ensure_ascii=False) if c else 'PERSONNAGE À RÉFÉRENCER : '+str(cid))
 lines+=['Préserver identité, costume, accessoires, axe et direction des regards. Le texte du scénario reste la référence ; ne pas inventer de dialogue.', 'SCÉNARIO SOURCE :\n'+s['screenplay']]
 return '\n'.join(x for x in lines if x)

def report(project):
 p=normalize(project);items=[];total=0;frames=0;approved=0;media=0;charids={str(c.get('id') or c.get('name')) for c in p.get('characters',[]) if isinstance(c,dict)};nodes=[]
 for s in p.get('scenes',[]):
  if not s['screenplay'].strip():items.append({'scene_id':s['id'],'level':'warning','message':'Scène sans texte source.'})
  if not s.get('shot_list'):items.append({'scene_id':s['id'],'level':'warning','message':'Découpage à préparer.'})
  for q in s.get('shot_list',[]):
   total+=1;frames+=round(float(q['duration'])*int(p.get('fps',25)));has=bool(q.get('clip_asset_id') or q.get('reference_asset_id'));media+=has;valid=q['review']=='approuve' and not q.get('stale') and q.get('source_hash')==digest(s['screenplay']) and q.get('approval_hash')==shot_fingerprint(p,s,q);approved+=valid
   if has and not q.get('rights_note'):items.append({'scene_id':s['id'],'shot_id':q['id'],'level':'warning','message':'Origine et droits du média à renseigner.'})
   if q.get('source_hash')!=digest(s['screenplay']) or q.get('stale') or (q.get('review')=='approuve' and q.get('approval_hash')!=shot_fingerprint(p,s,q)):items.append({'scene_id':s['id'],'shot_id':q['id'],'level':'warning','message':'Scénario, bible ou paramètres modifiés : relire ce plan avant de le valider.'})
   for cid in q.get('characters',[]):
    if str(cid) not in charids:items.append({'scene_id':s['id'],'shot_id':q['id'],'level':'warning','message':'Personnage absent de la bible : '+str(cid)})
   nodes.append({'scene_id':s['id'],'shot_id':q['id'],'source_hash':digest(s['screenplay']),'prompt':prompt(p,s,q),'steps':[{'id':'script','status':'ready' if s['screenplay'].strip() else 'missing'},{'id':'storyboard','status':'linked' if q.get('reference_asset_id') else 'missing'},{'id':'clip','status':'linked' if q.get('clip_asset_id') else 'not_generated'},{'id':'review','status':'approved' if valid else 'pending'}]})
 return {'scenes':len(p.get('scenes',[])),'shots':total,'approved':approved,'with_media':media,'duration':frames/int(p.get('fps',25)),'warnings':items,'nodes':nodes,'reference_concept':REFERENCE}

def fountain(p):
 return 'Title: '+p.get('title','Film')+'\nAuthor: '+p.get('author','')+'\n\n'+''.join((s['title'] if HEAD.match(s['title']) else '.'+s['title'])+' #'+s['id']+'#\n'+s['screenplay']+('\n\n' if not s['screenplay'].endswith('\n\n') else '') for s in normalize(p).get('scenes',[]))

def export_pack(p,out,asset_path,render=False,progress=lambda n:None):
 p=normalize(p);r=report(p);fps=int(p.get('fps',25));out=Path(out)
 (out/'SCENARIO.fountain').write_text(fountain(p),encoding='utf-8')
 (out/'PROJET_FILM.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
 (out/'PRODUCTION_CANVAS.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
 timeline=[];cursor=0
 with (out/'PLAN_TOURNAGE.csv').open('w',newline='',encoding='utf-8') as f:
  writer=csv.writer(f);writer.writerow(['scene_id','shot_id','titre','cadre','angle','focale','mouvement','lumiere','duration','in_frame','out_frame','reference_asset_id','clip_asset_id','review'])
  for s in p['scenes']:
   for q in s.get('shot_list',[]):
    n=round(float(q['duration'])*fps);row=dict(q,scene_id=s['id'],scene_title=s['title'],in_frame=cursor,out_frame=cursor+n,source_text=s['screenplay']);timeline.append(row)
    writer.writerow([s['id'],q['id'],s['title'],q['frame'],q['angle'],q['lens'],q['movement'],q['light'],n/fps,cursor,cursor+n,q['reference_asset_id'],q['clip_asset_id'],q['review']]);cursor+=n
 (out/'FILM_TIMELINE.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
 (out/'PROMPTS_PAR_PLAN.txt').write_text('\n\n---\n\n'.join(x['prompt'] for x in r['nodes']),encoding='utf-8')
 (out/'UTILISATION_FILM.md').write_text('# Atelier film\n\nScénario Fountain, projet JSON, découpage CSV, canevas et prompts par plan liés par les mêmes identifiants. Les références ajoutées restent dans la médiathèque locale du Studio. Les images/vidéos ne sont générées par un service distant qu’après une connexion et une commande explicites.\n\nUne animatique est un assemblage de prévisualisation des médias fournis, sans son ajouté, sans prétendre simuler la caméra d’une image fixe. Les avertissements du canevas restent à traiter avant le master. Envoyer le MP4 à Resolve ou Premiere pour poursuivre le montage.\n\nInspiration fonctionnelle : https://www.screenweaver.ai/ ; aucune donnée ni clé envoyée à ce service.\n',encoding='utf-8')
 if not render:return
 if not timeline or len(timeline)>100:raise ValueError('Préparer entre 1 et 100 plans pour l’animatique.')
 if cursor/fps>600:raise ValueError('Limiter cette animatique à 10 minutes.')
 missing=[q['id'] for q in timeline if not(q['clip_asset_id'] or q['reference_asset_id'])]
 if missing:raise ValueError('Ajouter une image ou un clip aux plans : '+', '.join(missing[:12]))
 sizes={'16:9':(1280,720),'9:16':(720,1280),'1:1':(720,720),'2.39:1':(1280,536)};w,h=sizes.get(p.get('format'),(1280,720))
 with tempfile.TemporaryDirectory(prefix='film-',dir=out) as temp:
  folder=Path(temp)
  for i,q in enumerate(timeline):
   source=asset_path(q['clip_asset_id'] or q['reference_asset_id']);n=q['out_frame']-q['in_frame'];target=folder/f'segment_{i:03d}.mp4'
   still=source.suffix.lower() in ['.png','.jpg','.jpeg','.webp']
   args=[str(outputs.FFMPEG),'-y','-hide_banner','-loglevel','error']+(['-loop','1'] if still else [])+['-i',str(source),'-vf',f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},tpad=stop_mode=clone:stop_duration=120','-frames:v',str(n),'-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',str(target)]
   run=subprocess.run(args,capture_output=True,timeout=max(90,n/fps*10))
   if run.returncode:raise RuntimeError('Média du plan '+q['id']+' illisible : '+run.stderr.decode(errors='replace')[-500:])
   progress(12+int(65*(i+1)/len(timeline)))
  (folder/'segments.txt').write_text(''.join(f"file 'segment_{i:03d}.mp4'\n" for i in range(len(timeline))))
  dest=out/'FILM_ANIMATIQUE.mp4';run=subprocess.run([str(outputs.FFMPEG),'-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(folder/'segments.txt'),'-c','copy','-movflags','+faststart',str(dest)],capture_output=True,timeout=120)
  if run.returncode:raise RuntimeError(run.stderr.decode(errors='replace')[-600:])
 check=subprocess.run([str(outputs.FFMPEG),'-hide_banner','-v','error','-progress','pipe:1','-i',str(dest),'-map','0:v:0','-f','null','-'],capture_output=True,timeout=180)
 vals=dict(x.split('=',1) for x in check.stdout.decode().splitlines() if '=' in x)
 if check.returncode or int(vals.get('frame',0))!=cursor:raise RuntimeError('Le contrôle de durée de l’animatique a échoué.')
 (out/'RENDER_VALIDATION.json').write_text(json.dumps({'status':'verified','method':'full_decode_and_frame_count','frames':cursor,'duration':cursor/fps,'fps':fps,'width':w,'height':h,'audio':'none','human_review_pending':r['approved']!=r['shots']},indent=2))
