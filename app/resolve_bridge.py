"""Direct official Resolve scripting API, run with the installed Python 3.14."""
import json, sys
from pathlib import Path
sys.path.insert(0,'/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules')

def run(command):
 import DaVinciResolveScript as bmd
 r=bmd.scriptapp('Resolve')
 if r is None:raise RuntimeError('Ouvrir Resolve et autoriser les scripts externes locaux dans ses préférences si nécessaire.')
 pm=r.GetProjectManager();p=pm.GetCurrentProject()
 if command['action']=='status':return {'connected':True,'version':r.GetVersionString(),'project_open':bool(p)}
 if command['action']=='active_task':
  if not p or not p.GetCurrentTimeline():raise RuntimeError('Ouvrir une timeline puis placer la tête de lecture sur un plan du Studio.')
  item=p.GetCurrentTimeline().GetCurrentVideoItem()
  if not item:raise RuntimeError('Aucun plan vidéo sous la tête de lecture.')
  clip=item.GetMediaPoolItem()
  return {'reference':str(clip.GetClipProperty('File Path') or '')+'\n'+str(clip.GetMetadata('Comments') or '')}
 if not p:raise RuntimeError('Ouvrir un projet Resolve avant l’import.')
 if command['action']=='import':
  clips=p.GetMediaPool().ImportMedia(command['paths'])
  if not clips:raise RuntimeError('Resolve n’a importé aucun média.')
  return {'imported':len(clips),'project':p.GetName(),'message':'Média importé dans le chutier. Placer le clip sur la piste voulue et enregistrer le projet.'}
 if command['action']=='title':
  # Use the current timeline; never replace existing clips or grades.
  tl=p.GetCurrentTimeline()
  if not tl:tl=p.GetMediaPool().CreateEmptyTimeline('Revelation Studio - Titres');p.SetCurrentTimeline(tl)
  item=tl.InsertFusionCompositionIntoTimeline();c=item.GetFusionCompByIndex(1);s=command['settings']
  c.Lock();title=c.AddTool('TextPlus',True,0,0);title.SetAttrs({'TOOLS_Name':'REVELATION_TITRE'})
  for k,v in {'StyledText':s['title'],'Font':'Baskerville','Style':'Regular','Size':.08,'Center':{1:.5,2:.55},'Red1':.88,'Green1':.73,'Blue1':.46}.items():title.SetInput(k,v,0)
  title.AddModifier('Opacity1','BezierSpline')
  last=int(item.GetDuration())-1
  for t,v in [(0,0),(min(20,last//3),1),(max(21,last-20),1),(last,0)]:title.SetInput('Opacity1',v,t)
  subtitle=c.AddTool('TextPlus',True,0,2)
  for k,v in {'StyledText':s.get('subtitle',''),'Font':'Arial','Style':'Regular','Size':.025,'Center':{1:.5,2:.4}}.items():subtitle.SetInput(k,v,0)
  subtitle.ConnectInput('Opacity1',title.Opacity1.GetConnectedOutput())
  merge=c.AddTool('Merge',True,2,0);merge.ConnectInput('Background',title);merge.ConnectInput('Foreground',subtitle)
  c.FindToolByID('MediaOut').ConnectInput('Input',merge);c.Unlock();c.CurrentTime=40;r.OpenPage('fusion')
  return {'created':True,'project':p.GetName(),'timeline':tl.GetName(),'duration_frames':last+1}
 raise RuntimeError('Commande non autorisée')

if __name__=='__main__':
 try:print(json.dumps(run(json.loads(sys.stdin.read())),ensure_ascii=False))
 except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
