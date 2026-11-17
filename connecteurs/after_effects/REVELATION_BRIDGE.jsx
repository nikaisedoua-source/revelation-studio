#target aftereffects
(function(thisObj){
var envData=$.getenv('REVELATION_DATA_DIR');var root=envData?new Folder(envData):new File($.fileName).parent.parent.parent;var base=new Folder((envData?root.fsName:root.fsName+'/data')+'/ponts/after_effects');
var inbox=new Folder(base.fsName+'/inbox');var ui=thisObj instanceof Panel?thisObj:new Window('palette','Révélation AI Studio',undefined,{resizeable:true});
ui.orientation='column';ui.alignChildren=['fill','top'];ui.add('statictext',undefined,'PONT LOCAL · AFTER EFFECTS');
var status=ui.add('statictext',undefined,'Prêt à rechercher les titres.');var list=ui.add('listbox',undefined,[],{multiselect:false});list.preferredSize=[340,170];
var refresh=ui.add('button',undefined,'Actualiser');var apply=ui.add('button',undefined,'Créer la composition sélectionnée');
var files=[];
function write(name,text){var f=new File(base.fsName+'/'+name);f.encoding='UTF-8';if(!f.open('w'))throw new Error('Écriture du pont refusée. Vérifier Préférences > Scripts et expressions > Autoriser les scripts à écrire des fichiers.');f.write(text);f.close();}
function heartbeat(){try{write('heartbeat.json','{"app":"after_effects","connected":true}');}catch(e){status.text='Pont lisible ; écriture à autoriser dans les préférences.';}}
function scan(){list.removeAll();files=inbox.getFiles('*.jsx');for(var i=0;i<files.length;i++){var done=new File(base.fsName+'/result_'+files[i].name.replace('.jsx','.json'));if(!done.exists)list.add('item',files[i].name);}if(list.items.length)list.selection=0;status.text=list.items.length+' titre(s) en attente.';heartbeat();}
refresh.onClick=scan;
apply.onClick=function(){if(!list.selection)return;var file=new File(inbox.fsName+'/'+list.selection.text);try{$.evalFile(file);write('result_'+file.name.replace('.jsx','.json'),'{"id":"'+file.name.replace('.jsx','')+'","success":true,"app":"after_effects"}');scan();status.text='Composition créée. Enregistrer le projet dans After Effects.';}catch(e){status.text=e.toString();}};
$.global.RASBridge={refresh:scan,heartbeat:heartbeat};
scan();if(ui instanceof Window){ui.center();ui.show();}
})(this);
