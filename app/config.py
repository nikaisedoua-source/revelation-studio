"""Portable paths. Environment overrides never search other user folders."""
import json, os, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HOME=Path.home()
DATA=Path(os.environ.get('REVELATION_DATA_DIR',str(ROOT/'data'))).expanduser().resolve()
LEGACY_EXTERNAL=Path('/Volumes/Samsung T7/IA_STUDIO_2026')
EXTERNAL=Path(os.environ.get('REVELATION_MODELS_DIR',str(LEGACY_EXTERNAL if LEGACY_EXTERNAL.is_dir() else DATA/'modeles'))).expanduser().resolve()
# Treat only an existing configured model store as mounted.
EXPORTS=Path(os.environ.get('REVELATION_OUTPUT_DIR',str(EXTERNAL/'productions_revelation' if EXTERNAL.is_dir() else DATA/'productions_locales'))).expanduser().resolve()
FFMPEG=Path(os.environ.get('REVELATION_FFMPEG',str(ROOT/'bin/ffmpeg' if (ROOT/'bin/ffmpeg').is_file() else shutil.which('ffmpeg') or ROOT/'bin/ffmpeg')))

def application_paths():
    defaults={'after_effects':('Adobe After Effects*/*.app','Adobe After Effects*'), 'photoshop':('Adobe Photoshop*/*.app','Adobe Photoshop*'), 'premiere':('Adobe Premiere Pro*/*.app','Adobe Premiere Pro*'), 'resolve':('DaVinci Resolve/DaVinci Resolve.app','DaVinci Resolve.app'), 'blender':('Blender.app',)}
    values={}
    for key,patterns in defaults.items():
        override=os.environ.get('REVELATION_APP_'+key.upper())
        if override:values[key]=str(Path(override).expanduser());continue
        matches=[]
        for base in (Path('/Applications'),HOME/'Applications'):
            for pattern in patterns:matches.extend(p for p in base.glob(pattern) if p.suffix=='.app' and 'render engine' not in p.name.lower())
        values[key]=str(sorted(matches)[-1]) if matches else str(Path('/Applications')/({'after_effects':'Adobe After Effects.app','photoshop':'Adobe Photoshop.app','premiere':'Adobe Premiere Pro.app','resolve':'DaVinci Resolve.app','blender':'Blender.app'}[key]))
    return values
PORT=int(os.environ.get('REVELATION_PORT','8848'))
if not 1024<=PORT<=65535:raise ValueError('Port du Studio invalide.')


def production_root():
    return EXPORTS if EXTERNAL.is_dir() or not EXPORTS.is_relative_to(EXTERNAL) else DATA/'productions_locales'
