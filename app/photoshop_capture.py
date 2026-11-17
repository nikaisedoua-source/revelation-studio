"""Capture a duplicate of the active Photoshop document; leave its source intact."""
import json,uuid,shutil,urllib.parse
from pathlib import Path
from .config import DATA
from . import bridges

def capture():
    aid=uuid.uuid4().hex[:12];out=DATA/'photoshop_captures'/aid;out.mkdir(parents=True,exist_ok=True)
    metadata=out/'TEXTES_SOURCE.json';png=out/'TEXTE_PHOTOSHOP.png';psd=out/'SOURCE_EDITABLE.psd';error=out/'ERREUR.txt'
    code=r'''(function(){var original=null,d=null;try{if(!app.documents.length)throw Error("Ouvrir un document Photoshop avec au moins un calque texte.");original=app.activeDocument;d=original.duplicate("REVELATION_CAPTURE",false);var texts=[];
function walk(layers){for(var i=0;i<layers.length;i++){var l=layers[i];if(l.typename==="LayerSet"){walk(l.layers);}else if(l.kind===LayerKind.TEXT){texts.push({name:l.name,text:l.textItem.contents});}else{try{l.visible=false;}catch(ignore){}}}}
walk(d.layers);if(!texts.length)throw Error("Aucun calque texte éditable dans ce document.");var psdOptions=new PhotoshopSaveOptions();psdOptions.layers=true;d.saveAs(new File(__PSD__),psdOptions,true,Extension.LOWERCASE);var options=new PNGSaveOptions();d.saveAs(new File(__PNG__),options,true,Extension.LOWERCASE);var f=new File(__META__);f.encoding="UTF-8";f.open("w");f.write(encodeURIComponent(original.name)+"\n");for(var k=0;k<texts.length;k++){f.write(encodeURIComponent(texts[k].name)+"\t"+encodeURIComponent(texts[k].text)+"\n");}f.close();
}catch(e){var f=new File(__ERROR__);f.encoding="UTF-8";f.open("w");f.write(String(e));f.close();}finally{if(d)d.close(SaveOptions.DONOTSAVECHANGES);if(original)app.activeDocument=original;}})();'''
    for marker,path in [('__PSD__',psd),('__PNG__',png),('__META__',metadata),('__ERROR__',error)]:code=code.replace(marker,json.dumps(str(path),ensure_ascii=False))
    bridges.adobe_script('photoshop',code)
    if error.exists():raise RuntimeError(error.read_text())
    if not png.exists() or not metadata.exists():raise RuntimeError('Photoshop n’a pas confirmé l’export. Vérifier son document actif.')
    uploads=DATA/'uploads';uploads.mkdir(exist_ok=True);shutil.copy2(png,uploads/(aid+'.png'))
    lines=metadata.read_text().splitlines();document=urllib.parse.unquote(lines[0]);texts=[]
    for line in lines[1:]:
        name,text=line.split('\t',1);texts.append({'name':urllib.parse.unquote(name),'text':urllib.parse.unquote(text)})
    data={'document':document,'texts':texts,'source_unchanged':True};metadata.write_text(json.dumps(data,ensure_ascii=False,indent=2))
    return {'asset_id':aid,'capture_id':aid,**data}
