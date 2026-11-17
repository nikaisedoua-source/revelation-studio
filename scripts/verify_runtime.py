"""Exercise the actual HTTP server in isolated temporary user data."""
import json,os,secrets,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8849'
results=[];token=''
def call(path,body=None,allowed=200,headers=None):
 data=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(BASE+path,data,{'Content-Type':'application/json','X-Studio-Token':token,**(headers or {})})
 try:
  with urllib.request.urlopen(req,timeout=180) as r:status=r.status;raw=r.read()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read()
 try:value=json.loads(raw)
 except ValueError:value={'bytes':len(raw)}
 if status!=allowed:raise AssertionError(path+': '+str(status)+' '+str(value)[:700])
 return value

def waitjob(body):
 j=call('/api/jobs',body);deadline=time.monotonic()+220
 while time.monotonic()<deadline:
  j=next(x for x in call('/api/jobs') if x['id']==j['id'])
  if j['status'] not in ('queued','running'):break
  time.sleep(.5)
 assert j['status']=='complete',(body['kind'],j.get('error'),j['status'])
 assert any(f['bytes']>100 for f in j['files'])
 results.append({'kind':body['kind'],'status':j['status'],'files':[f['name'] for f in j['files']]})
 return j

with tempfile.TemporaryDirectory(prefix='revelation-functional-') as tmp:
 env={**os.environ,'REVELATION_DATA_DIR':tmp+'/data','REVELATION_MODELS_DIR':tmp+'/models','REVELATION_OUTPUT_DIR':tmp+'/exports','REVELATION_PORT':'8849'}
 with open(ROOT/'verification/runtime_test.log','w') as log:
  p=subprocess.Popen([sys.executable,'-m','uvicorn','app.server:app','--host','127.0.0.1','--port','8849'],cwd=ROOT,env=env,stdout=log,stderr=log)
  try:
   for _ in range(80):
    try:call('/api/bootstrap');break
    except (OSError,urllib.error.URLError):time.sleep(.2)
   call('/api/status',allowed=403)
   password=secrets.token_urlsafe(20)
   token=call('/api/auth/setup',{'identity':'Vérification jetable','password':password})['token']
   call('/api/status',headers={'Origin':'https://untrusted.test'},allowed=403)
   call('/api/providers/groq/configure',{'settings':{'GROQ_API_KEY':'test-only-private-key'}})
   assert 'test-only-private-key' not in json.dumps(call('/api/status'))
   call('/api/providers/groq/remove',{})
   recovery=call('/api/auth/recovery-key',{})['recovery_key'];oldtoken=token
   newpass=secrets.token_urlsafe(20)
   token=call('/api/auth/password',{'password':newpass,'current_password':password})['token'];token=oldtoken
   call('/api/status',allowed=403);token=''
   token=call('/api/auth/recover',{'password':password,'recovery_key':recovery})['token']
   film=call('/api/film/revelation-studio');proj=film['project'];proj['scenes']=[{'id':'scene-test','title':'INT. STUDIO — JOUR','screenplay':'« Paroles exactes. »','shot_list':[{'id':'plan-test','duration':3,'frame':'plan moyen'}]}]
   saved=call('/api/film/revelation-studio/save',{'project':proj,'expected_revision':proj['revision']})
   call('/api/film/revelation-studio/save',{'project':proj,'expected_revision':proj['revision']},allowed=409)
   common={'seconds':3,'fps':25,'title':'Église « texte exact »','brief':'Montée discrète, continuité et lumière motivée.'}
   for kind,extra in [('motion',{'motion_script':'0-1.5 | Première scène | | fondu\n1.5-3 | Dernier plan | | zoom'}),('color',{}),('photoshop',{}),('sound',{}),('graphic',{'graphic_kind':'barres','data':'20, 50, 80'}),('three_d',{'model':'procedural','three_d_kind':'carton'}),('film_bundle',{'project_id':'revelation-studio'})]:
    waitjob({**common,'kind':kind,**extra})
   status=call('/api/status');model=next((m['id'] for m in status['models'] if m['id']=='ollama:qwen2.5-coder:1.5b'),None)
   if model:waitjob({**common,'kind':'motion_advice','model':model,'brief':'Un seul carton de trois secondes avec le texte exact : À VENIR. Réponds en deux lignes maximum.'})
   results.append({'authentication':'setup, rotation, recovery and invalidated sessions verified','project_revision_conflict':'409 verified','keys_not_in_status':True})
  finally:
   p.terminate()
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:p.kill()
(ROOT/'verification/functional_runtime.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False))
