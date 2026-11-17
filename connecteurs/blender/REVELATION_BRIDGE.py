"""Read-only Blender host probe. Scene creation uses app.bridges.send_blender
in an isolated --factory-startup process, preserving any open user scene.
"""
import bpy
import json,os,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
BASE=Path(os.environ.get('REVELATION_DATA_DIR',str(ROOT/'data'))).expanduser()/'ponts'/'blender'
BASE.mkdir(parents=True,exist_ok=True)
p=BASE/'heartbeat.json';tmp=p.with_suffix('.tmp')
tmp.write_text(json.dumps({'app':'blender','connected':True,'version':bpy.app.version_string,'updated_at':time.time(),'mode':'probe_only'}))
tmp.replace(p)
print('Révélation : hôte Blender vérifié. Envoyer une scène depuis le Studio pour la créer séparément.')
