"""Local host APIs. Never installs or updates applications; no UI automation."""
import json
import subprocess
import threading
import time
import uuid
from pathlib import Path

from .config import ROOT, DATA, application_paths
import sys
BASE = DATA / 'ponts'
APPS = application_paths()
LOCK = threading.RLock()

def _json(path):
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (ValueError, OSError):
        return {}

def _record(target, data):
    data = dict(data, app=target, checked_at=time.time())
    folder = BASE / target
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'api_status.json'
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False))
    temp.replace(path)
    return data

def states():
    result = {}
    for target, path in APPS.items():
        d = _json(BASE / target / 'api_status.json')
        hb_path = BASE / target / 'heartbeat.json'
        hb = _json(hb_path)
        fresh_hb = bool(hb.get('connected') is True and hb.get('app') == target and 0 <= time.time() - hb_path.stat().st_mtime < 25) if hb else False
        fresh_api = bool(d.get('connected') is True and 0 <= time.time() - d.get('checked_at', 0) < 60)
        result[target] = dict(d, installed=Path(path).exists(), path=path,
            bridge_folder=str(BASE / target), connected=fresh_hb or fresh_api,
            last_verified=d.get('checked_at') if d.get('connected') else None)
    return result

def adobe_script(target, code):
    """Execute generated ExtendScript through the application's Apple event API."""
    if target not in ('after_effects', 'photoshop'):
        raise ValueError('Hôte Adobe non pris en charge')
    command = 'DoScript' if target == 'after_effects' else 'do javascript'
    # Pass code as an argv value, never interpolate it into AppleScript or a shell.
    apple = f'on run argv\n tell application "{APPS[target]}"\n {command} (item 1 of argv)\n end tell\nend run'
    try:
        result = subprocess.run(['/usr/bin/osascript', '-e', apple, code], capture_output=True, text=True, timeout=45)
    except subprocess.TimeoutExpired:
        raise RuntimeError('Le logiciel ne répond pas. Fermer sa boîte de dialogue éventuelle, puis retester la connexion.') from None
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[-1000:] or 'Le logiciel a refusé la commande locale.')
    return result.stdout.strip()

def activate(target):
    if target not in APPS:
        raise ValueError('Logiciel inconnu')
    if not Path(APPS[target]).exists():
        return _record(target, {'connected': False, 'error': 'Logiciel absent de cet emplacement.'})
    with LOCK:
        try:
            if target in ('photoshop', 'after_effects'):
                folder = BASE / target
                folder.mkdir(parents=True, exist_ok=True)
                response = folder / ('probe_' + uuid.uuid4().hex + '.txt')
                code = '(function(){var f=new File(' + json.dumps(str(response), ensure_ascii=False) + ');f.encoding="UTF-8";if(!f.open("w"))throw new Error("Autoriser l’écriture des scripts dans les préférences du logiciel.");f.write(app.version);f.close();})();'
                try:
                    adobe_script(target, code)
                    version = response.read_text().strip()
                    if not version:
                        raise RuntimeError('Le logiciel n’a pas confirmé sa version.')
                finally:
                    response.unlink(missing_ok=True)
                return _record(target, {'connected': True, 'version': version, 'mode': 'api_locale', 'message': 'API locale vérifiée. Les boutons d’envoi exécutent les compositions dans le logiciel.'})
            if target == 'blender':
                r = subprocess.run([APPS[target] + '/Contents/MacOS/Blender', '--background', '--factory-startup', '--python-expr', 'import bpy; print("REVELATION_OK="+bpy.app.version_string)'], capture_output=True, text=True, timeout=45)
                version = next((x.split('=', 1)[1] for x in r.stdout.splitlines() if x.startswith('REVELATION_OK=')), '')
                if r.returncode or not version:
                    raise RuntimeError(r.stderr[-700:] or 'Le moteur Blender ne répond pas.')
                return _record(target, {'connected': True, 'version': version, 'mode': 'moteur_local', 'message': 'Moteur Blender testé. Les scènes sont fabriquées dans un processus séparé puis ouvertes en .blend.'})
            if target == 'resolve':
                subprocess.run(['/usr/bin/open', '-a', APPS[target]], check=True, timeout=10)
                r = subprocess.run([sys.executable, str(ROOT/'app/resolve_bridge.py')], input='{"action":"status"}', capture_output=True, text=True, timeout=25)
                d = json.loads(r.stdout.strip().splitlines()[-1])
                if r.returncode or not d.get('connected'):
                    raise RuntimeError(d.get('error', 'API Resolve indisponible'))
                return _record(target, dict(d, message='API Resolve vérifiée. Ouvrir un projet pour recevoir les médias.'))
            subprocess.run(['/usr/bin/open', '-a', APPS[target]], check=True, timeout=10)
            if states()[target]['connected']:
                return _record(target, {'connected': True, 'mode':'uxp', 'message':'Panneau Premiere actif.'})
            return _record(target, {'connected': False, 'needs_user_action': True, 'message': 'Premiere est ouvert. Charger le panneau Révélation AI Studio dans UXP, puis choisir le dossier de pont Premiere. L’import automatique attend cette activation.'})
        except Exception as exc:
            return _record(target, {'connected': False, 'error': str(exc), 'message': 'Connexion non validée : ' + str(exc)})

def send_adobe(target, job_id, source):
    with LOCK:
        result_path = BASE / target / ('result_' + job_id + '.json')
        result_path.parent.mkdir(parents=True, exist_ok=True)
        if _json(result_path).get('success'):
            return {'message': 'Cette production a déjà été créée dans le logiciel.', 'already_applied': True}
        # Sources are produced by the Studio, not uploaded executable scripts.
        code = source.read_text(encoding='utf-8')
        code = '\n'.join(x for x in code.splitlines() if not x.startswith('#target'))
        payload = json.dumps({'id':job_id, 'success':True, 'app':target}, ensure_ascii=False)
        marker = '\n;(function(){var f=new File(' + json.dumps(str(result_path), ensure_ascii=False) + ');f.encoding="UTF-8";if(!f.open("w"))throw new Error("Confirmation inaccessible");f.write(' + json.dumps(payload) + ');f.close();})();'
        error_path = result_path.with_suffix('.error.txt')
        error_path.unlink(missing_ok=True)
        failure = 'var f=new File(' + json.dumps(str(error_path),ensure_ascii=False) + ');f.encoding="UTF-8";if(f.open("w")){f.write(String(e));f.close();}'
        link=('if(app.project&&app.project.activeItem)app.project.activeItem.comment="REVELATION_JOB:'+job_id+'";' if target=='after_effects' else 'if(app.documents.length)app.activeDocument.info.caption="REVELATION_JOB:'+job_id+'";')
        adobe_script(target, '(function(){try{' + code + link + marker + '}catch(e){' + failure + '}})();')
        if error_path.exists():
            error = error_path.read_text(encoding='utf-8').strip();error_path.unlink(missing_ok=True)
            raise RuntimeError(error)
        if not _json(result_path).get('success'):
            raise RuntimeError('Le logiciel n’a pas confirmé la création. Contrôler le document avant de réessayer.')
        _record(target, {'connected':True, 'mode':'api_locale'})
        return {'success': True, 'message':'Création confirmée dans le logiciel. Le texte reste modifiable ; enregistrer le projet.'}

def build_blender(root, preview=True):
    dest=root/'REVELATION_SCENE.blend';script=root/'BLENDER_SCENE.py'
    code='import runpy,bpy;runpy.run_path('+repr(str(script))+');bpy.ops.wm.save_as_mainfile(filepath='+repr(str(dest))+')'
    if preview:code+=';bpy.context.scene.render.resolution_percentage=33;bpy.context.scene.render.filepath='+repr(str(root/'THREE_D_RENDU.png'))+';bpy.ops.render.render(write_still=True)'
    exe=Path(APPS['blender'])/'Contents/MacOS/Blender'
    if not exe.is_file():raise RuntimeError('Blender non détecté. Le script reste disponible pour une autre installation.')
    r=subprocess.run([str(exe),'--background','--factory-startup','--python-exit-code','1','--python-expr',code],capture_output=True,text=True,timeout=180)
    if r.returncode or not dest.exists():raise RuntimeError(r.stderr[-1000:] or 'Scène Blender non créée')
    return dest

def send_blender(job_id, root):
    dest=root/'REVELATION_SCENE.blend'
    if not dest.exists():dest=build_blender(root)
    subprocess.run(['/usr/bin/open','-n','-a',APPS['blender'],'--args',str(dest),'--python',str(ROOT/'connecteurs/blender/revelation_return.py')],check=True,timeout=10)
    d={'id':job_id,'success':True,'app':'blender','file':str(dest),'message':'Scène .blend créée et ouverture demandée dans une fenêtre séparée.'}
    (BASE/'blender').mkdir(parents=True,exist_ok=True)
    (BASE/'blender'/('result_'+job_id+'.json')).write_text(json.dumps(d))
    _record('blender',{'connected':True,'mode':'moteur_local'})
    return d
