"""Install only Studio-owned shortcuts in the current user's directories."""
import json,plistlib,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from app.config import application_paths

def install():
 if sys.platform!='darwin':raise SystemExit('Les scripts Resolve/Blender sont disponibles dans connecteurs ; le service système fourni ici cible macOS.')
 service=Path.home()/'Applications/Revelation Studio Return.app'
 for folder in ['MacOS','Resources']:(service/'Contents'/folder).mkdir(parents=True,exist_ok=True)
 binary=service/'Contents/MacOS/RevelationStudioReturn'
 subprocess.run(['swiftc','-parse-as-library',str(ROOT/'connecteurs/StudioReturnService.swift'),'-o',str(binary),'-framework','AppKit'],check=True)
 (service/'Contents/Resources/studio-root.txt').write_text(str(ROOT))
 apps=application_paths();ids=[]
 for target in ['after_effects','photoshop','resolve']:
  p=Path(apps[target])/'Contents/Info.plist'
  if p.is_file():ids.append(plistlib.loads(p.read_bytes())['CFBundleIdentifier'])
 info={'CFBundleExecutable':'RevelationStudioReturn','CFBundleIdentifier':'fr.revelationstudio.return-service','CFBundleName':'RevelationStudioReturn','CFBundlePackageType':'APPL','CFBundleVersion':'7','LSUIElement':True,'NSServices':[{'NSMenuItem':{'default':'Modifier la tâche dans Révélation Studio'},'NSMessage':'editInStudio','NSPortName':'RevelationStudioReturn','NSRequiredContext':{'NSApplicationIdentifier':ids},'NSTimeout':'45000','NSSendTypes':[],'NSReturnTypes':[]}]}
 (service/'Contents/Info.plist').write_bytes(plistlib.dumps(info));subprocess.run(['codesign','--force','--sign','-',str(service)],check=True)
 subprocess.run(['/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister','-f',str(service)],check=True)
 subprocess.run(['/System/Library/CoreServices/pbs','-read_bundle',str(service)],capture_output=True,check=True)
 subprocess.run(['/System/Library/CoreServices/pbs','-update'],check=True)
 base=Path.home()/'Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts'
 for folder,name in [('Edit','Modifier_dans_Revelation_Studio.py'),('Comp','Modifier_composition_dans_Studio.py')]:
  dest=base/folder;dest.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'connecteurs/resolve'/name,dest/name)
 blender=Path(apps['blender'])/'Contents/MacOS/Blender'
 if blender.is_file():
  r=subprocess.run([str(blender),'--background','--factory-startup','--python-expr','import bpy;print("STUDIO_STARTUP="+bpy.utils.user_resource("SCRIPTS",path="startup",create=True))'],capture_output=True,text=True,timeout=30)
  startup=next((x.split('=',1)[1] for x in r.stdout.splitlines() if x.startswith('STUDIO_STARTUP=')),None)
  if startup:shutil.copy2(ROOT/'connecteurs/blender/revelation_return.py',Path(startup)/'revelation_return.py')
 print(json.dumps({'installed':True,'service':str(service),'premiere':'Charger connecteurs/premiere dans UXP pour utiliser le bouton du clip sélectionné.','restart':'Resolve/Blender peuvent devoir être rouverts pour découvrir leurs nouveaux scripts.'},ensure_ascii=False))
if __name__=='__main__':install()
