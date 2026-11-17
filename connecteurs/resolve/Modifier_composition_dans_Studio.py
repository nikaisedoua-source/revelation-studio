# Fusion > Scripts > Comp : identify a generated TextPlus by its durable task ID.
import re,webbrowser
try:
 import DaVinciResolveScript as bmd
 app=bmd.scriptapp('Fusion');comp=app.GetCurrentComp()
 if not comp:raise RuntimeError('Ouvrir une composition Fusion du Studio.')
 ids=set()
 for tool in comp.GetToolList(False).values():
  m=re.match(r'RS_([a-f0-9]{12})$',tool.GetAttrs().get('TOOLS_Name',''))
  if m:ids.add(m.group(1))
 if len(ids)!=1:raise RuntimeError('Une seule tâche du Studio doit être identifiable dans la composition.')
 webbrowser.open('revelationstudio://edit?job='+next(iter(ids)))
except Exception as error:print('Révélation Studio : '+str(error))
