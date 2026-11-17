"""Build the browser edition from an explicit public-file allowlist."""
import json,re,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from app import cinema,catalog,providers
VERSION='0.9.0'
DEST=ROOT/'web-online/dist';DEST.mkdir(parents=True,exist_ok=True)
for name in ['studio.js','studio.css','film.js','integrations.js','return-to-studio.js','editor-model.js','editor.js','editor.css','studio-pro.css','photo.css','photo-editor.js','shell.js']:
 text=(ROOT/'web'/name).read_text().replace('/Users/decassan/Documents/Révélation Studio','Compagnon Mac').replace('/Volumes/Samsung T7/IA_STUDIO_2026','Stockage du compagnon Mac')
 (DEST/name).write_text(text)
for name in ['browser-engine.js','browser-extras.js','cloud-runtime.js','sw.js','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png']:
 shutil.copy2(ROOT/'web-online'/name,DEST/name)
html=re.sub(r'\b0\.\d+\.\d+\b',VERSION,(ROOT/'web/index.html').read_text().replace('/static/','./'))
html=html.replace('<script src="./studio.js',f'<script src="./cloud-runtime.js?v={VERSION}"></script><script src="./browser-engine.js?v={VERSION}"></script><script src="./studio.js')
html=html.replace('<script>start();</script>',f'<script src="./browser-extras.js?v={VERSION}"></script><script>start();</script>')
html=html.replace('</head>','<link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icon.svg"><link rel="apple-touch-icon" href="./icon-180.png"><meta name="theme-color" content="#101114"><meta name="apple-mobile-web-app-capable" content="yes"></head>')
(DEST/'index.html').write_text(html)
(DEST/'public-data.json').write_text(json.dumps({'version':VERSION,'charter':cinema.CHARTER,'sources':cinema.SOURCES,'catalog':catalog.catalog(),'connectors':{k:v for k,v in providers.CONNECTORS.items() if v['kind']!='auth'}},ensure_ascii=False))
(DEST/'version.json').write_text(json.dumps({'version':VERSION,'edition':'browser','private_media_included':False}))
allowed={'index.html','studio.js','studio.css','film.js','integrations.js','return-to-studio.js','editor-model.js','editor.js','editor.css','studio-pro.css','photo.css','photo-editor.js','shell.js','browser-engine.js','browser-extras.js','cloud-runtime.js','sw.js','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png','public-data.json','version.json'}
actual={p.name for p in DEST.iterdir()}
if actual!=allowed:raise SystemExit('Unexpected deploy files: '+str(actual^allowed))
for p in DEST.iterdir():
 if p.suffix.lower() in ('.png','.ico','.icns'):continue
 text=p.read_text()
 for forbidden in ['gho_','ghp_','BEGIN PRIVATE KEY','/Users/decassan/','"digest":','"password":']:
  if forbidden in text:raise SystemExit('Sensitive or private marker in '+p.name+': '+forbidden)
print(json.dumps({'dist':str(DEST),'files':len(allowed),'bytes':sum(p.stat().st_size for p in DEST.iterdir())}))
