"""Non-destructive production filing. Existing sources are never relocated."""
import json
import re
from pathlib import Path
from .registry import EXTERNAL
from .config import DATA

ROOT = EXTERNAL / 'ESPACE_DE_TRAVAIL'
FOLDERS = [
 ('ecriture','01_ECRITURE','Scénarios, dialogues et découpage'),
 ('references','02_REFERENCES','Images source et références de continuité'),
 ('storyboard','03_STORYBOARD','Planches et animatiques'),
 ('motion','04_MOTION_DESIGN','Animations typographiques, cartes et graphiques'),
 ('three_d','05_3D','Scènes Blender et fiches de plan'),
 ('photoshop','06_PHOTOSHOP','Titres et images modifiables'),
 ('son','07_SON','Voix, transcriptions et fiches de droits'),
 ('post','08_POSTPRODUCTION','Étalonnage, transitions et effets'),
 ('montage','09_MONTAGE','Projets de montage à enregistrer depuis les logiciels'),
 ('livraisons','10_LIVRAISONS','Masters approuvés par le réalisateur'),
]
CATEGORY = {'film_bundle':'ecriture','film_animatic':'storyboard','scenario':'ecriture','decoupage':'ecriture','storyboard':'storyboard','animatic':'storyboard','motion':'motion','graphic':'motion','three_d':'three_d','photoshop':'photoshop','tts':'son','asr':'son','music':'son','sound':'son','ocr':'ecriture','color':'post','vfx':'post','transition':'post'}

def ensure():
    root=ROOT if EXTERNAL.is_dir() or ROOT!=EXTERNAL/'ESPACE_DE_TRAVAIL' else DATA/'ESPACE_DE_TRAVAIL'
    root.mkdir(parents=True,exist_ok=True)
    folders=[]
    for key, name, purpose in FOLDERS:
        p=root/name;p.mkdir(exist_ok=True)
        folders.append({'id':key,'label':name.replace('_',' '),'path':str(p),'purpose':purpose})
    guide=root/'COMMENCER_ICI.md'
    guide.write_text('# Révélation Studio — espace de production\n\nOuvrir Révélation AI Studio sur http://127.0.0.1:8848.\n\nLes dossiers numérotés suivent les étapes du film. Les productions sont classées par des liens vers leur dossier original dans productions_revelation : pas de copie des gros médias, pas de déplacement des sources. Chaque génération reste une version distincte. Enregistrer les projets des logiciels dans 09_MONTAGE; placer uniquement les masters relus dans 10_LIVRAISONS.\n\n'+ '\n'.join('- '+x['label']+' : '+x['purpose'] for x in folders)+'\n\nLes dossiers Dropbox sont exclus. Aucun logiciel n’est mis à jour par le Studio.\n',encoding='utf-8')
    return {'mounted':EXTERNAL.is_dir(),'ready':True,'storage':'external' if EXTERNAL.is_dir() else 'local','root':str(root),'folders':folders}

def register(job):
    info=ensure()
    if not info.get('ready'):return
    kind=job['spec']['kind'].removesuffix('_advice')
    key=CATEGORY.get(kind,'ecriture')
    folder=next(Path(x['path']) for x in info['folders'] if x['id']==key)
    title=re.sub(r'[^\w -]+','',job['spec'].get('title','Production'))[:70].strip() or 'Production'
    link=folder/(title+' — '+job['id'])
    if not link.exists() and not link.is_symlink():link.symlink_to(Path(job['output_dir']),target_is_directory=True)

def open_path(key):
    info=ensure()
    if not info.get('ready'):raise ValueError('Stockage indisponible.')
    if key=='root':return Path(info['root'])
    for entry in info['folders']:
        if entry['id']==key:return Path(entry['path'])
    raise ValueError('Dossier inconnu')
