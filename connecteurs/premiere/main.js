const ppro=require('premierepro'),fs=require('uxp').storage.localFileSystem;let folder,inbox,pending=[];
const status=t=>document.getElementById('status').textContent=t;
async function write(name,data){const f=await folder.createFile(name,{overwrite:true});await f.write(JSON.stringify(data));}
async function refresh(){if(!folder)return;try{const items=await inbox.getEntries(),done=await folder.getEntries();pending=[];for(const f of items){if(!f.name.endsWith('.json')||done.some(x=>x.name==='result_'+f.name))continue;const j=JSON.parse(await f.read());if(j.target==='premiere'&&Array.isArray(j.paths))pending.push(j);}const list=document.getElementById('jobs');list.innerHTML='';for(const j of pending){const o=document.createElement('option');o.value=j.id;o.textContent=j.settings.title+' · '+j.paths.length+' média(s)';list.appendChild(o);}await write('heartbeat.json',{app:'premiere',connected:true});status(pending.length+' envoi(s) en attente.');}catch(e){status(String(e));}}
document.getElementById('choose').onclick=async()=>{try{const f=await fs.getFolder();if(!f)return;inbox=await f.getEntry('inbox');folder=f;localStorage.setItem('revelation.bridge.folder',await fs.createPersistentToken(f));await refresh();}catch(e){status('Choisir le dossier premiere contenant inbox. '+e);}};
document.getElementById('apply').onclick=async()=>{const j=pending.find(j=>j.id===document.getElementById('jobs').value);if(!j)return;try{const project=await ppro.Project.getActiveProject();if(!project)throw Error('Ouvrir un projet Premiere.');const root=await project.getRootItem();const ok=await project.importFiles(j.paths,true,root,false);if(!ok)throw Error('Premiere n’a pas confirmé l’import.');await write('result_'+j.id+'.json',{id:j.id,success:true,app:'premiere',imported:j.paths.length});await refresh();status('Import confirmé dans le chutier. Placer les médias sur les pistes voulues.');}catch(e){status(String(e));}};
async function restore(){const token=localStorage.getItem('revelation.bridge.folder');if(!token)return;try{folder=await fs.getEntryForPersistentToken(token);inbox=await folder.getEntry('inbox');await refresh()}catch(e){folder=null;status('Choisir à nouveau le dossier du pont.')}}
restore();setInterval(refresh,8000);
async function selectedStudioTask(){
 const project=await ppro.Project.getActiveProject();if(!project)throw Error('Ouvrir un projet Premiere.');
 const sequence=await project.getActiveSequence();if(!sequence)throw Error('Ouvrir une séquence et sélectionner un clip généré par le Studio.');
 const selection=await sequence.getSelection(),items=await selection.getTrackItems(),ids=new Set();
 for(const item of items){const clip=await ppro.ClipProjectItem.cast(await item.getProjectItem());if(!clip)continue;const path=await clip.getMediaFilePath(),match=String(path).match(/[\\/]([a-f0-9]{12})[\\/]/);if(match)ids.add(match[1])}
 if(ids.size!==1)throw Error('Sélectionner un seul média du Studio. Le fichier doit conserver son dossier de production.');
 return [...ids][0];
}
document.getElementById('edit-studio').onclick=async()=>{try{const id=await selectedStudioTask();await require('uxp').shell.openExternal('revelationstudio://edit?job='+id,'Ouvrir les paramètres de cette production dans Révélation AI Studio.');status('Tâche '+id+' ouverte pour modification.')}catch(e){status(String(e))}};
