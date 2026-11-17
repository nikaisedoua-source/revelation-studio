"""Resolve an active host object to a Studio task, without guessing the last task."""
import json,re,subprocess,sys,tempfile
from pathlib import Path
from .config import ROOT,DATA
from . import bridges
ID=re.compile(r'REVELATION_JOB:([a-f0-9]{12})|[/\\]([a-f0-9]{12})[/\\]')

def task_id(text):
    explicit=set(re.findall(r'REVELATION_JOB:([a-f0-9]{12})',str(text)))
    matches=explicit or {a or b for a,b in ID.findall(str(text))}
    if len(matches)!=1:raise ValueError('Sélectionner un seul document, une composition ou un média lié au Studio.')
    jid=next(iter(matches))
    if not (DATA/'jobs'/(jid+'.json')).is_file():raise ValueError('Cette production appartient à un autre Studio ou ses données sont absentes.')
    return jid

def active_task(target):
    if target in ('photoshop','after_effects'):
        with tempfile.TemporaryDirectory(prefix='revelation-return-') as tmp:
            dest=Path(tmp)/'active.txt'
            read='if(!app.documents.length)throw Error("Aucun document actif.");var d=app.activeDocument;v=d.info.caption||"";try{v+="\\n"+d.fullName.fsName;}catch(ignore){}' if target=='photoshop' else 'if(!app.project||!app.project.activeItem)throw Error("Sélectionner une composition.");var d=app.project.activeItem;v=d.comment||"";if(d.file)v+="\\n"+d.file.fsName;if(d.numLayers)for(var i=1;i<=d.numLayers;i++){try{if(d.layer(i).source.file)v+="\\n"+d.layer(i).source.file.fsName;}catch(ignore){}}'
            code='(function(){var v="";try{'+read+'}catch(e){v="ERROR:"+String(e);}var f=new File('+json.dumps(str(dest))+');f.encoding="UTF-8";f.open("w");f.write(v);f.close();})();'
            bridges.adobe_script(target,code)
            if not dest.is_file():raise ValueError('Le logiciel n’a pas confirmé son document actif.')
            value=dest.read_text()
            if value.startswith('ERROR:'):raise ValueError(value[6:])
            return task_id(value)
    if target=='resolve':
        r=subprocess.run([sys.executable,str(ROOT/'app/resolve_bridge.py')],input='{"action":"active_task"}',capture_output=True,text=True,timeout=20)
        try:d=json.loads(r.stdout.strip().splitlines()[-1])
        except (ValueError,IndexError):raise ValueError('Resolve n’a pas confirmé son plan actif.') from None
        if d.get('error'):raise ValueError(d['error'])
        return task_id(d.get('reference',''))
    raise ValueError('Dans Premiere, utiliser le bouton du panneau Révélation ; dans Blender, le panneau Révélation Studio de la vue 3D.')

def open_task(jid):
    if not re.fullmatch('[a-f0-9]{12}',jid):raise ValueError('Identifiant de tâche invalide.')
    app=ROOT/'Révélation AI Studio.app'
    url='revelationstudio://edit?job='+jid
    if app.is_dir():subprocess.run(['/usr/bin/open','-a',str(app),url],check=True,timeout=10)
    else:subprocess.run(['/usr/bin/open','http://127.0.0.1:8848/?job='+jid],check=True,timeout=10)
    return {'opened':True,'job_id':jid}

if __name__=='__main__':
    try:print(json.dumps(open_task(active_task(sys.argv[1])),ensure_ascii=False))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
