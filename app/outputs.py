import csv, html, json, math, os, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
FONTROOT=Path('/System/Library/Fonts/Supplemental')
from .config import FFMPEG

def js(value):
 return json.dumps(value,ensure_ascii=False).replace('\u2028','\\u2028').replace('\u2029','\\u2029')

def font(name,size):
 choices={'cinema':'Baskerville.ttc','clean':'Arial.ttf','bold':'Arial Bold.ttf','neon':'Arial Bold.ttf'}
 path=FONTROOT/choices.get(name,'Arial.ttf')
 if path.exists():return ImageFont.truetype(str(path),size)
 fallback=Path('/usr/share/fonts/truetype/dejavu')/('DejaVuSerif.ttf' if name=='cinema' else 'DejaVuSans-Bold.ttf' if name in ['bold','neon'] else 'DejaVuSans.ttf')
 if fallback.exists():return ImageFont.truetype(str(fallback),size)
 return ImageFont.load_default(size=size)

def text_image(text,name,size,rgba,maxwidth=1640):
 f=font(name,size)
 while f.getlength(text)>maxwidth and size>22:
  size-=2;f=font(name,size)
 box=f.getbbox(text);im=Image.new('RGBA',(int(math.ceil(f.getlength(text)))+12,box[3]-box[1]+12))
 ImageDraw.Draw(im).text((6,6-box[1]),text,font=f,fill=rgba)
 return im

def overlay(settings):
 style=settings.get('style','cinema');color=settings.get('color','#dfba75')
 rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
 base=Image.new('RGBA',(1920,1080))
 title=text_image(settings.get('title','KACOU 183'),style,152 if style=='cinema' else 126,(*rgb,255))
 sub=text_image(settings.get('subtitle','BIENTÔT DISPONIBLE'),'clean',36,(242,240,233,255))
 lower=style=='lower'
 tx=150 if lower else (1920-title.width)//2;ty=824 if lower else 465-title.height//2
 sx=150 if lower else (1920-sub.width)//2;sy=935 if lower else 625
 if style=='neon':
  glow=Image.new('RGBA',base.size);glow.alpha_composite(title,(tx,ty));glow=glow.filter(ImageFilter.GaussianBlur(22));base.alpha_composite(glow)
 base.alpha_composite(title,(tx,ty));base.alpha_composite(sub,(sx,sy))
 if not lower:ImageDraw.Draw(base).line((855,580,1065,580),fill=(*rgb,255),width=2)
 return base

def ease(x):return 1-(1-max(0,min(1,x)))**3

def motion(settings,out,progress=lambda x:None):
 seconds=settings.get('seconds',5);fps=settings.get('fps',25);base=overlay(settings)
 base.save(out/'apercu_transparent.png')
 bg=Image.new('RGBA',base.size,(12,17,29,255));bg.alpha_composite(base);bg.convert('RGB').save(out/'apercu.jpg',quality=92)
 args=[str(FFMPEG),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s','1920x1080','-r',str(fps),'-i','-','-an','-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-alpha_bits','16',str(out/'titre_transparent.mov')]
 with (out/'rendu.log').open('w') as logs:
  proc=subprocess.Popen(args,stdin=subprocess.PIPE,stderr=logs)
  for i in range(round(seconds*fps)):
   t=i/fps;entry=ease(t/.85);exit=max(0,min(1,(seconds-1/fps-t)/.7));alpha=entry*exit
   frame=Image.new('RGBA',base.size);shift=int(55*(1-entry)-18*(1-exit))
   layer=base.copy();layer.putalpha(base.getchannel('A').point(lambda a:int(a*alpha)))
   frame.alpha_composite(layer,(0,shift));proc.stdin.write(frame.tobytes())
   if i%fps==0:progress(15+int(i/(seconds*fps)*70))
  proc.stdin.close()
  if proc.wait()!=0:raise RuntimeError((out/'rendu.log').read_text()[-1500:])
 native_ae(settings,out/'titre_after_effects.jsx')
 native_fusion(settings,out/'titre_fusion.setting')
 (out/'UTILISATION.md').write_text('Titre animé, 1920 × 1080, '+str(fps)+' i/s.\n\nLe .mov ProRes 4444 contient une transparence : le placer sur une piste supérieure dans Premiere ou Resolve. Le PNG JPG sert d’aperçu. Les textes restent éditables dans les sources After Effects et Fusion. Les animations natives et le rendu sont des adaptations distinctes.\n\nAfter Effects : Fichier > Scripts > Exécuter un fichier de script, choisir titre_after_effects.jsx.\nFusion : glisser titre_fusion.setting dans le graphe, puis relier le résultat au MediaOut.\n',encoding='utf-8')

def native_ae(s,path):
 color=s.get('color','#dfba75');rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
 data={'title':s.get('title','KACOU 183'),'subtitle':s.get('subtitle','BIENTÔT DISPONIBLE'),'seconds':s.get('seconds',5),'fps':s.get('fps',25),'color':rgb,'style':s.get('style','cinema')}
 code='''(function(){var s=__DATA__;app.beginUndoGroup('Revelation AI Studio');
try{if(!app.project)app.newProject();var c=app.project.items.addComp('REVELATION - '+s.title,1920,1080,1,s.seconds,s.fps);c.motionBlur=true;
function add(content,size,y,col,delay){var l=c.layers.addText(content);var p=l.property('ADBE Text Properties').property('ADBE Text Document');var d=p.value;d.font=s.style==='cinema'?'Baskerville':'ArialMT';d.fontSize=size;d.fillColor=col;d.justification=ParagraphJustification.CENTER_JUSTIFY;p.setValue(d);var r=l.sourceRectAtTime(0,false);var tr=l.property('ADBE Transform Group');tr.property('ADBE Anchor Point').setValue([r.left+r.width/2,r.top+r.height/2]);var pos=tr.property('ADBE Position');pos.setValueAtTime(delay,[960,y+55]);pos.setValueAtTime(delay+.85,[960,y]);var o=tr.property('ADBE Opacity');o.setValueAtTime(delay,0);o.setValueAtTime(delay+.7,100);o.setValueAtTime(s.seconds-.8,100);o.setValueAtTime(s.seconds-1/s.fps,0);for(var k=1;k<=pos.numKeys;k++)pos.setTemporalEaseAtKey(k,[new KeyframeEase(0,75)],[new KeyframeEase(0,75)]);l.motionBlur=true;return l;}
add(s.title,150,490,s.color,.08);add(s.subtitle,36,635,[.95,.94,.91],.3);c.time=1.8;c.openInViewer();}
finally{app.endUndoGroup();}})();'''.replace('__DATA__',js(data))
 path.write_text(code,encoding='utf-8')

def native_fusion(s,path):
 n=round(s.get('seconds',5)*s.get('fps',25))-1;fps=s.get('fps',25);color=s.get('color','#dfba75');rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
 def node(name,text,size,y,fontname):
  return f'''{name} = TextPlus {{ Inputs = {{ GlobalOut = Input {{ Value = {n} }}, Width = Input {{ Value = 1920 }}, Height = Input {{ Value = 1080 }}, UseFrameFormatSettings = Input {{ Value = 1 }}, StyledText = Input {{ Value = {js(text)} }}, Font = Input {{ Value = {js(fontname)} }}, Style = Input {{ Value = "Regular" }}, Size = Input {{ Value = {size} }}, Center = Input {{ Value = {{0.5,{y}}} }}, Red1 = Input {{ Value = {rgb[0]} }}, Green1 = Input {{ Value = {rgb[1]} }}, Blue1 = Input {{ Value = {rgb[2]} }}, Opacity1 = Input {{ SourceOp = "Fade", Source = "Value" }}, HorizontalJustificationNew = Input {{ Value = 3 }}, VerticalJustificationNew = Input {{ Value = 3 }} }} }}'''
 contents='{ Tools = ordered() {\n'+node('Titre',s.get('title','KACOU 183'),.08,.55,'Baskerville')+',\n'+node('SousTitre',s.get('subtitle','BIENTÔT DISPONIBLE'),.025,.41,'Arial')+f''',
Fade = BezierSpline {{ KeyFrames = {{ [0] = {{0,Flags={{Linear=true}}}}, [{int(fps*.85)}] = {{1,Flags={{Linear=true}}}}, [{max(int(fps*.85)+1,n-int(fps*.8))}] = {{1,Flags={{Linear=true}}}}, [{n}] = {{0,Flags={{Linear=true}}}} }} }},
Resultat = Merge {{ Inputs = {{ Background = Input {{SourceOp="Titre",Source="Output"}}, Foreground = Input {{SourceOp="SousTitre",Source="Output"}} }}, ViewInfo = OperatorInfo {{Pos={{440,80}}}} }}
}} }}'''
 path.write_text(contents,encoding='utf-8')

LOOKS={'neutre':(1.0,1.0,0.0),'ambre':(1.06,.94,.022),'acier':(1.08,.82,-.018),'noir':(1.16,0.0,0.0)}
def color_pack(s,out):
 contrast,saturation,temp=LOOKS.get(s.get('look','ambre'),LOOKS['ambre'])
 contrast=float(s.get('contrast',contrast));saturation=float(s.get('saturation',saturation));temp=float(s.get('temperature',temp))
 slope=[contrast*(1+temp),contrast,contrast*(1-temp)];offset=[.5-.5*contrast]*3;power=[1,1,1]
 n=33;lines=['TITLE "REVELATION - creative look - normalized Rec709"','LUT_3D_SIZE 33','DOMAIN_MIN 0 0 0','DOMAIN_MAX 1 1 1']
 for b in range(n):
  for g in range(n):
   for r in range(n):
    v=np.clip(np.array([r,g,b])/(n-1)*slope+offset,0,1);y=float(v@np.array([.2126,.7152,.0722]));v=np.clip(y+(v-y)*saturation,0,1)
    lines.append(' '.join(f'{x:.7f}' for x in v))
 (out/'LOOK_CREATIF_REC709.cube').write_text('\n'.join(lines)+'\n')
 cdl=f'''<?xml version="1.0" encoding="UTF-8"?><ColorCorrection id="REVELATION_LOOK"><SOPNode><Description>Point de depart creatif - verifier espace de travail et exposition</Description><Slope>{' '.join(map(str,slope))}</Slope><Offset>{' '.join(map(str,offset))}</Offset><Power>1 1 1</Power></SOPNode><SatNode><Saturation>{saturation}</Saturation></SatNode></ColorCorrection>'''
 (out/'LOOK_ASC_CDL.cc').write_text(cdl)
 plan={'input_declared':s.get('input_space','inconnu'),'lut_input':'Rec.709 normalisé','lut_output':'Rec.709','creative_only':True,'image_analysis_performed':False,'slope':slope,'offset':offset,'power':power,'saturation':saturation,'nodes':['Vérifier gamma/gamut caméra et métadonnées','Transformation technique vers l’espace de travail choisi','Exposition et balance des blancs par plan','Raccords entre plans','Look créatif dans son espace prévu','Transformation de sortie et contrôle scopes'],'note':'La LUT fournie attend du Rec.709 normalisé. Elle ne remplace pas la conversion Log, une IDT ACES ou le raccord entre plans. Le CDL est un point de départ à adapter à l’espace choisi.'}
 (out/'PARAMETRES_ET_PIPELINE.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
 (out/'LIRE_AVANT_APPLICATION.md').write_text('## Look créatif, sans analyse automatique des rushes\n\nCette LUT attend des images déjà normalisées en Rec.709. Ne pas l’appliquer directement à du Log. Dans un pipeline ACES, utiliser une transformation créative compatible avec l’espace de travail ; ne pas placer cette LUT Rec.709 avant l’Output Transform.\n\nImporter la LUT dans Lumetri ou Resolve, en vérifier le résultat sur scopes et images de référence. Ajuster exposition et balance par plan. Les paramètres JSON et le CDL accompagnent le look pour permettre sa reconstruction.\n',encoding='utf-8')

def photoshop_pack(s,out):
 title=s.get('title','RÉVÉLATION');style=s.get('style','cinema');color=s.get('color','#dfba75')
 image=overlay(dict(s,subtitle=''));image.save(out/'texte_apercu.png')
 d={'title':title,'style':style,'color':color}
 code='''#target photoshop
(function(){var s=__DATA__;var old=app.preferences.rulerUnits;app.preferences.rulerUnits=Units.PIXELS;
try{var d=app.documents.add(1920,1080,72,'REVELATION - '+s.title,NewDocumentMode.RGB,DocumentFill.TRANSPARENT);var l=d.artLayers.add();l.kind=LayerKind.TEXT;l.name='TEXTE MODIFIABLE';var t=l.textItem;t.contents=s.title;t.font=s.style==='cinema'?'Baskerville':'Arial-BoldMT';t.size=150;t.justification=Justification.CENTER;t.position=[960,560];var c=new SolidColor();c.rgb.hexValue=s.color.substr(1);t.color=c;
var desc=new ActionDescriptor();var ref=new ActionReference();ref.putProperty(charIDToTypeID('Prpr'),charIDToTypeID('Lefx'));ref.putEnumerated(charIDToTypeID('Lyr '),charIDToTypeID('Ordn'),charIDToTypeID('Trgt'));desc.putReference(charIDToTypeID('null'),ref);var fx=new ActionDescriptor();fx.putUnitDouble(charIDToTypeID('Scl '),charIDToTypeID('#Prc'),100);var sh=new ActionDescriptor();sh.putBoolean(charIDToTypeID('enab'),true);sh.putUnitDouble(charIDToTypeID('Opct'),charIDToTypeID('#Prc'),s.style==='neon'?65:32);sh.putUnitDouble(charIDToTypeID('Dstn'),charIDToTypeID('#Pxl'),6);sh.putUnitDouble(charIDToTypeID('blur'),charIDToTypeID('#Pxl'),s.style==='neon'?24:12);fx.putObject(charIDToTypeID('DrSh'),charIDToTypeID('DrSh'),sh);desc.putObject(charIDToTypeID('T   '),charIDToTypeID('Lefx'),fx);executeAction(charIDToTypeID('setd'),desc,DialogModes.NO);
}finally{app.preferences.rulerUnits=old;}})();'''.replace('__DATA__',js(d))
 (out/'texte_photoshop.jsx').write_text(code,encoding='utf-8')
 (out/'LIRE_MOI.md').write_text('Photoshop : Fichier > Scripts > Parcourir, sélectionner texte_photoshop.jsx. Un nouveau document avec texte éditable et ombre de calque est créé. Le PNG est un aperçu distinct, non un PSD. Le pont UXP peut aussi créer un calque éditable à partir de cette demande.\n',encoding='utf-8')

def effect_pack(s,out,progress=lambda x:None):
 # Overlay rather than a claim of scene reconstruction: warm motivated light spill.
 fps=s.get('fps',25);seconds=s.get('seconds',5);w,h=960,540
 yy,xx=np.mgrid[0:h,0:w];proc=subprocess.Popen([str(FFMPEG),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s',f'{w}x{h}','-r',str(fps),'-i','-','-an','-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le',str(out/'LUMIERE_OVERLAY_ALPHA.mov')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 for i in range(round(seconds*fps)):
  t=i/fps;cx=w*(.1+.8*t/seconds);a=np.exp(-((xx-cx)**2/(w*.22)**2+(yy-h*.25)**2/(h*.7)**2))*50*math.sin(math.pi*t/seconds)**2
  rgba=np.zeros((h,w,4),dtype=np.uint8);rgba[:,:,:3]=[255,190,100];rgba[:,:,3]=a.astype(np.uint8);proc.stdin.write(rgba.tobytes())
  if i%fps==0:progress(15+int(i/(fps*seconds)*75))
 proc.stdin.close();err=proc.stderr.read();code=proc.wait()
 if code:raise RuntimeError(err.decode()[-1000:])
 (out/'INTEGRATION_VFX.md').write_text('Overlay de lumière chaude avec canal alpha, 960 × 540. À superposer et doser selon la source motivée de la scène. Cet élément ne contient pas de tracking, de reconstruction 3D ni d’analyse du plan. Contrôler lumière, grain et mouvement sur le montage final.\n')

def transition_pack(s,out,assets,progress=lambda x:None):
 duration=.5;fps=s.get('fps',25)
 (out/'FICHE_TRANSITION.md').write_text('Transition : fondu enchaîné de 0,5 seconde.\n\nUsage : changement de temps, d’état ou de lieu justifié par la scène. Comparer avec une coupe franche. Préserver les regards et directions écran si la continuité est attendue ; préparer le raccord sonore séparément.\n\nLes deux extraits d’aperçu sont limités à 3 secondes chacun, sans son. Les médias originaux sont conservés.\n')
 if len(assets)<2:
  (out/'AJOUTER_DEUX_PLANS.txt').write_text('Ajouter deux vidéos dans l’application pour générer un aperçu de la transition. Aucune transition sur des rushes n’a été rendue dans ce dossier.')
  return
 filt=f'[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},trim=duration=3,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3,trim=duration=3,format=yuv420p[a];[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},trim=duration=3,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3,trim=duration=3,format=yuv420p[b];[a][b]xfade=transition=fade:duration={duration}:offset=2.5[v]'
 args=[str(FFMPEG),'-y','-hide_banner','-loglevel','error','-i',str(assets[0]),'-i',str(assets[1]),'-filter_complex',filt,'-map','[v]','-an','-c:v','libx264','-crf','18',str(out/'TRANSITION_APERCU_SANS_SON.mp4')]
 r=subprocess.run(args,capture_output=True,timeout=240)
 if r.returncode:raise RuntimeError(r.stderr.decode()[-1500:])


def _scene_rows(settings):
    """Build a stable scene list without inventing source dialogue."""
    rows = settings.get('scenes') or []
    if isinstance(rows, dict):
        rows = [rows]
    if not rows:
        brief = (settings.get('brief') or '').strip()
        pieces = [x.strip() for x in brief.replace('\r', '\n').split('\n') if x.strip()]
        if not pieces:
            pieces = ['Ouverture : installer le lieu et l’intention.',
                      'Développement : faire progresser le personnage.',
                      'Point de bascule : révéler l’enjeu.',
                      'Résolution : laisser une image qui demeure.']
        rows = [{'number': i + 1, 'title': p[:60], 'action': p,
                 'dialogue_source': '', 'characters': [], 'image_prompt': ''}
                for i, p in enumerate(pieces[:12])]
    result=[]
    for i, row in enumerate(rows):
        row=dict(row)
        row.setdefault('number', i + 1)
        row.setdefault('title', f'Scène {row["number"]}')
        row.setdefault('action', '')
        row.setdefault('dialogue_source', '')
        row.setdefault('characters', [])
        row.setdefault('image_prompt', '')
        row.setdefault('shot_list', [])
        result.append(row)
    return result


def storyboard_pack(s, out, model_text=''):
    rows=_scene_rows(s)
    payload={
        'project_id': s.get('project_id','revelation-studio'),
        'title': s.get('title','Projet Révélation'),
        'format': '16:9', 'fps': s.get('fps',25),
        'preserve_exact_dialogue': True,
        'cinema_rules': ['axe 180 degrés', 'raccord de regard et de mouvement',
                         'valeur de plan motivée', 'son et image préparés séparément'],
        'scenes': rows,
    }
    (out/'STORYBOARD.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    lines=[f"# Storyboard — {payload['title']}", '',
           'Chaque fiche conserve le dialogue source fourni. Les propositions visuelles sont des indications de mise en scène à valider.', '']
    for row in rows:
        lines += [f"## {int(row['number']):02d} · {row['title']}",
                  f"Action : {row.get('action','')}",
                  f"Personnages : {', '.join(row.get('characters',[])) or 'À renseigner'}",
                  f"Paroles source : {row.get('dialogue_source','') or 'Aucun dialogue fourni'}",
                  f"Prompt image : {row.get('image_prompt','') or 'À préparer avec le cadre, la focale, la lumière et la continuité du personnage.'}",
                  f"Plans : {json.dumps(row.get('shot_list',[]),ensure_ascii=False)}", '']
    if model_text:
        lines += ['## Proposition du moteur local', '', model_text, '']
    (out/'STORYBOARD.md').write_text('\n'.join(lines),encoding='utf-8')
    # Contact sheet: visual planning aid, with explicit empty image areas.
    sheet=Image.new('RGB',(1920,1080),(14,17,23));draw=ImageDraw.Draw(sheet)
    cols=3;rowsn=4;pad=28;tw=(1920-pad*(cols+1))//cols;th=(1080-pad*(rowsn+1))//rowsn
    for i,row in enumerate(payload['scenes'][:12]):
        x=pad+(i%cols)*(tw+pad);y=pad+(i//cols)*(th+pad)
        draw.rounded_rectangle((x,y,x+tw,y+th),radius=8,outline=(177,145,88),width=2,fill=(26,30,39))
        draw.rectangle((x+12,y+12,x+tw-12,y+th*0.62),outline=(70,76,91),width=1)
        label=f"{int(row['number']):02d}  {str(row['title'])[:36]}"
        draw.text((x+18,y+th*0.69),label,font=font('clean',24),fill=(226,198,139))
        chars=', '.join(row.get('characters',[])) or 'personnages à définir'
        draw.text((x+18,y+th*0.80),chars[:48],font=font('clean',16),fill=(191,195,204))
        draw.text((x+18,y+th*0.89),'IMAGE À GÉNÉRER / RÉFÉRENCE À VALIDER',font=font('clean',12),fill=(137,143,155))
    sheet.save(out/'STORYBOARD_CONTACT_SHEET.png')
    (out/'IMAGE_GENERATION_PROMPTS.txt').write_text('\n\n'.join(
        f"SCÈNE {int(r['number']):02d}\n{r.get('image_prompt','') or 'Décrire le personnage, l’action, la valeur de plan, la focale, la lumière motivée, l’axe et la continuité.'}"
        for r in payload['scenes']),encoding='utf-8')
    # Remote image services are represented as explicit handoff tasks.  This
    # keeps the storyboard usable offline and avoids pretending that a user's
    # browser account or quota has already generated an image.
    image_providers=[
        {'id':'google_flow','name':'Google Flow / Veo','mode':'web','status':'a_connecter','url':'https://labs.google/fx/tools/flow'},
        {'id':'adobe_firefly','name':'Adobe Firefly','mode':'web','status':'a_connecter','url':'https://firefly.adobe.com/'},
        {'id':'runway','name':'Runway','mode':'web','status':'a_connecter','url':'https://runway.com/'},
        {'id':'luma_dream_machine','name':'Luma Dream Machine','mode':'web','status':'a_connecter','url':'https://lumalabs.ai/dream-machine'},
        {'id':'stability_core','name':'Stability AI','mode':'api_or_local','status':'a_configurer','url':'https://stability.ai/core-models'},
        {'id':'comfyui','name':'ComfyUI','mode':'local','status':'a_installer','url':'https://github.com/comfyanonymous/ComfyUI'},
        {'id':'openai_images','name':'OpenAI Images','mode':'api','status':'a_configurer','url':'https://platform.openai.com/docs/guides/images'},
    ]
    tasks=[]
    for row in payload['scenes']:
        prompt=row.get('image_prompt','') or 'Décrire le personnage, l’action, la valeur de plan, la focale, la lumière motivée, l’axe et la continuité du personnage.'
        tasks.append({'scene':row['number'],'title':row['title'],'dialogue_source':row.get('dialogue_source',''),
                      'characters':row.get('characters',[]),'prompt':prompt,
                      'continuity_lock':'Reprendre les références de la bible et ne pas modifier âge, costume, accessoire, direction de regard ou axe sans validation.',
                      'providers':image_providers})
    (out/'IMAGE_PROVIDER_TASKS.json').write_text(json.dumps({'project_id':payload['project_id'],'format':'16:9','offline_safe':True,'tasks':tasks},ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'IMAGE_PROVIDER_HANDOFF.md').write_text('# Passerelle images par scène\n\nCe document prépare les demandes pour les services d’image sans utiliser automatiquement un compte distant. Pour chaque scène, choisir un fournisseur dans `IMAGE_PROVIDER_TASKS.json`, ouvrir son lien officiel, envoyer le prompt et rapatrier l’image dans le dossier du projet. Ajouter alors le fichier, la date, le modèle, le compte et la licence. La planche contact reste un outil de préparation tant qu’aucune image n’a été importée et contrôlée.\n',encoding='utf-8')


def animatic_pack(s, out, assets, progress=lambda x:None):
    rows=_scene_rows(s);fps=int(s.get('fps',25));duration=3
    timeline=[]
    for i,row in enumerate(rows):
        timeline.append({'scene':row['number'],'in':i*duration,'out':(i+1)*duration,
                         'title':row['title'],'dialogue_source':row.get('dialogue_source',''),
                         'asset':assets[i].name if i<len(assets) else None})
    (out/'ANIMATIQUE_TIMELINE.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    with (out/'ANIMATIQUE_EDL.csv').open('w',newline='',encoding='utf-8') as fh:
        writer=csv.DictWriter(fh,fieldnames=['scene','in','out','title','dialogue_source','asset']);writer.writeheader();writer.writerows(timeline)
    if not assets:
        (out/'AJOUTER_IMAGES.txt').write_text('Ajoute une image par scène pour rendre un animatique avec mouvements de caméra simulés. La timeline et les dialogues sont déjà préparés.',encoding='utf-8');return
    frames=[];total=max(len(assets),len(rows));w,h=1280,720
    for idx in range(total):
        try:im=Image.open(assets[idx]).convert('RGB')
        except Exception:im=Image.new('RGB',(w,h),(30,35,45))
        im.thumbnail((w-80,h-110));canvas=Image.new('RGB',(w,h),(12,15,20));canvas.paste(im,((w-im.width)//2,36))
        d=ImageDraw.Draw(canvas);r=rows[idx] if idx<len(rows) else {'number':idx+1,'title':f'Scène {idx+1}'}
        d.rectangle((0,h-64,w,h),fill=(12,15,20));d.text((28,h-48),f"SCÈNE {int(r['number']):02d} · {str(r['title'])[:70]}",font=font('clean',26),fill=(226,198,139))
        frames.append(canvas)
    path=out/'ANIMATIQUE_PREVIEW.mp4';proc=subprocess.Popen([str(FFMPEG),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(fps),'-i','-','-an','-c:v','libx264','-pix_fmt','yuv420p',str(path)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    for idx,im in enumerate(frames):
        for _ in range(duration*fps):proc.stdin.write(np.asarray(im).tobytes())
        progress(20+int(70*(idx+1)/len(frames)))
    proc.stdin.close();err=proc.stderr.read();code=proc.wait()
    if code:raise RuntimeError(err.decode(errors='replace')[-1000:])
    (out/'LIRE_MOI.md').write_text('Animatique de prévisualisation : chaque image reste trois secondes, avec un carton de scène. Utiliser la timeline JSON/CSV pour remplacer les cadres par des plans générés ou tournés. Le son n’est pas inventé ; les paroles source restent dans la feuille de continuité.\n',encoding='utf-8')


def graphic_pack(s, out, progress=lambda x:None):
    kind=s.get('graphic_kind','barres');title=s.get('title','DONNÉES DE LA SÉQUENCE');fps=int(s.get('fps',25));seconds=min(20,max(3,float(s.get('seconds',6))))
    values=[float(x.strip()) for x in str(s.get('data','35, 62, 48, 78, 91')).split(',') if x.strip()]
    values=values[:8] or [35,62,48,78,91];mx=max(values) or 1;w,h=1280,720
    frames=[]
    for i in range(round(seconds*fps)):
        t=i/(seconds*fps);canvas=Image.new('RGBA',(w,h),(0,0,0,0));d=ImageDraw.Draw(canvas)
        d.text((64,50),title,font=font('clean',42),fill=(226,198,139,255))
        if kind=='ligne':
            pts=[]
            for j,v in enumerate(values):pts.append((100+j*(w-180)/max(1,len(values)-1),590-v/mx*430*min(1,t*2)))
            d.line(pts,fill=(226,198,139,255),width=6);[d.ellipse((x-8,y-8,x+8,y+8),fill=(245,237,208,255)) for x,y in pts]
        elif kind=='carte':
            d.line((150,500,300,360,430,430,590,240,760,310,930,170,1110,250),fill=(226,198,139,255),width=5)
            for j in range(5):
                x=210+j*200;y=450-j*55;d.ellipse((x-16,y-16,x+16,y+16),fill=(223,93,76,255),outline=(245,237,208,255),width=3);d.text((x+20,y-12),f'POINT {j+1}',font=font('clean',18),fill=(232,232,225,255))
        else:
            bw=(w-220)/len(values)-18
            for j,v in enumerate(values):
                bh=v/mx*430*min(1,t*2);x=100+j*(bw+18);d.rounded_rectangle((x,590-bh,x+bw,590),radius=8,fill=(226,198,139,235));d.text((x,610),str(j+1),font=font('clean',22),fill=(218,220,225,255))
        frames.append(canvas)
    frames[0].save(out/'GRAPHIC_PREVIEW.png')
    proc=subprocess.Popen([str(FFMPEG),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgba','-s',f'{w}x{h}','-r',str(fps),'-i','-','-an','-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le',str(out/'GRAPHIC_ALPHA.mov')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    for i,im in enumerate(frames):
        proc.stdin.write(np.asarray(im).tobytes())
        if i%fps==0:progress(15+int(75*i/len(frames)))
    proc.stdin.close();err=proc.stderr.read();code=proc.wait()
    if code:raise RuntimeError(err.decode(errors='replace')[-1000:])
    (out/'GRAPHIC_SPEC.json').write_text(json.dumps({'kind':kind,'title':title,'values':values,'fps':fps,'seconds':seconds,'transparent':True},ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'GRAPHIC_AFTER_EFFECTS.jsx').write_text('// Révélation AI Studio : la composition graphique est livrée en GRAPHIC_ALPHA.mov.\n// Importer ce fichier dans After Effects et conserver GRAPHIC_SPEC.json pour les données sources.\n',encoding='utf-8')


def sound_pack(s, out):
    sources=[
        {'name':'Pixabay','url':'https://pixabay.com/sound-effects/','license':'https://pixabay.com/service/license-summary/','rule':'Relire la licence du fichier choisi et conserver la preuve.'},
        {'name':'Mixkit','url':'https://mixkit.co/free-sound-effects/','license':'https://mixkit.co/license/','rule':'Vérifier la licence de la catégorie et l’usage commercial.'},
        {'name':'Freesound CC0','url':'https://freesound.org/search/?g=license:%22Creative+Commons+0%22','license':'https://freesound.org/help/faq/#licenses','rule':'Utiliser seulement les fichiers explicitement CC0 pour une utilisation sans attribution.'},
    ]
    (out/'SOURCES_SONORES.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
    brief=s.get('brief','')
    (out/'BANQUE_SONORE_ET_DROITS.md').write_text('# Recherche sonore\n\nIntention : '+brief+'\n\n'+''.join(f"- [{x['name']}]({x['url']}) — {x['rule']}\n  Licence : {x['license']}\n" for x in sources)+'\nLe Studio ne télécharge pas automatiquement une œuvre dont la licence n’a pas été vérifiée. Ajouter le fichier choisi et son URL de licence à la fiche de montage. Pour une mélodie originale, utiliser ACE-Step local ou un service dont les droits commerciaux sont explicitement confirmés.\n',encoding='utf-8')


def three_d_pack(s, out):
    """Prepare a deterministic Blender scene without claiming Blender is installed."""
    title=s.get('title','RÉVÉLATION 3D');kind=s.get('three_d_kind','carton')
    spec={'title':title,'kind':kind,'format':'1920x1080','fps':s.get('fps',25),
          'duration':s.get('seconds',6),'camera':'35 mm, mouvement motivé à valider',
          'lighting':'key motivée + fill discret + rim de séparation',
          'continuity':'verrouiller l’échelle, l’axe et les repères avant animation'}
    (out/'THREE_D_SHOT_SPEC.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf-8')
    from .blender_scene import SCENE_SCRIPT
    spec['job_id']=out.name;spec['brief']=s.get('brief','');spec['generation_mode']='tripo_glb' if (out/'MODELE_GENERE.glb').exists() else 'procedural'
    (out/'THREE_D_SHOT_SPEC.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf-8')
    script=SCENE_SCRIPT.replace('__SPEC__',repr(spec))
    (out/'BLENDER_SCENE.py').write_text(script,encoding='utf-8')
    # A visual planning card is useful even when Blender is not installed.
    card=Image.new('RGB',(1280,720),(13,17,24));d=ImageDraw.Draw(card)
    d.polygon([(180,560),(1040,560),(900,220),(300,220)],outline=(223,190,126),fill=(30,38,51))
    d.line((300,220,640,120,900,220),fill=(223,190,126),width=3)
    d.text((60,52),title,font=font('clean',44),fill=(238,229,204));d.text((60,620),f"3D · {kind} · scène à ouvrir dans Blender",font=font('clean',24),fill=(178,184,197))
    card.save(out/'THREE_D_PREVIEW.png')
    (out/'BLENDER_README.md').write_text('Ce pack prépare une scène Blender modifiable et une fiche de plan. Envoyer le pack avec le bouton Blender du Studio : il crée un .blend isolé avec le moteur installé. Contrôler l’axe, les matériaux, les textures et lancer le rendu après validation. Le Studio ne présente pas une simple carte de repérage comme un rendu 3D final.\n',encoding='utf-8')

def sound_design(s,out):
 """Original procedural sound assets; never represented as model inference."""
 import wave,hashlib
 rate=48000;seconds=min(20,max(3,float(s.get('seconds',6))))
 seed=int.from_bytes(hashlib.sha256(s.get('brief','').encode()).digest()[:4],'big');rng=np.random.default_rng(seed)
 def write(name,x):
  x=np.nan_to_num(x);peak=np.max(np.abs(x))
  if peak:x=x/peak*.75
  stereo=np.column_stack((x,x))
  with wave.open(str(out/name),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((stereo*32767).astype('<i2').tobytes())
 t=np.arange(round(seconds*rate))/rate;u=t/seconds
 noise=rng.normal(0,1,len(t));soft=np.convolve(noise,np.ones(12)/12,mode='same')
 write('BRUITAGE_SOUFFLE.wav',soft*np.sin(np.pi*u)**3)
 write('BRUITAGE_MONTEE.wav',(.35*soft+np.sin(2*np.pi*(90*t+85*t*t/seconds))*.2)*u**2*np.minimum(1,(1-u)*20))
 write('BRUITAGE_IMPACT.wav',(np.sin(2*np.pi*(45*t+4*(1-np.exp(-20*t))))+soft*.35)*np.exp(-6*t))
 music=np.zeros_like(t)
 for index,f in enumerate([110,130.8128,164.8138,220]):music+=np.sin(2*np.pi*f*t+.1*np.sin(2*np.pi*.2*t))*.15
 music*=np.minimum(1,t/1.2)*np.minimum(1,(seconds-t)/1.8)
 write('NAPPE_ORIGINALE.wav',music)
 (out/'ORIGINE_AUDIO.md').write_text('# Sons procéduraux originaux\n\nSouffle, montée, impact et nappe synthétisés mathématiquement à 48 kHz. Aucun échantillon tiers et aucune imitation de morceau ou de voix. Ces sons ne sont pas une inférence d’ACE-Step ou d’un autre modèle musical. Contrôler niveau et raccords avant montage.\n',encoding='utf-8')
