# Workspace > Scripts > Edit > Modifier dans Revelation Studio
import re,subprocess,webbrowser
from pathlib import Path
try:
 import DaVinciResolveScript as bmd
 resolve=bmd.scriptapp('Resolve');project=resolve.GetProjectManager().GetCurrentProject()
 if not project:raise RuntimeError('Ouvrir un projet Resolve.')
 timeline=project.GetCurrentTimeline()
 if not timeline:raise RuntimeError('Ouvrir une timeline et placer la tête de lecture sur le média du Studio.')
 item=timeline.GetCurrentVideoItem()
 if not item:raise RuntimeError('Aucun plan vidéo sous la tête de lecture.')
 pool=item.GetMediaPoolItem();path=pool.GetClipProperty('File Path') or '';comments=pool.GetMetadata('Comments') or ''
 ids={a or b for a,b in re.findall(r'REVELATION_JOB:([a-f0-9]{12})|[/\\]([a-f0-9]{12})[/\\]',path+'\n'+comments)}
 if len(ids)!=1:raise RuntimeError('Ce média ne possède pas de tâche Révélation identifiable.')
 webbrowser.open('revelationstudio://edit?job='+next(iter(ids)))
except Exception as error:
 print('Révélation Studio : '+str(error))
