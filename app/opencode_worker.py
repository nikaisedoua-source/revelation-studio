"""OpenCode text proposals in a production directory, with every tool denied."""
import json,os,subprocess,sys
from pathlib import Path
from .config import ROOT

def run(request,out):
    binary=ROOT/'data/tools/opencode/node_modules/.bin/opencode'
    if not binary.is_file():raise RuntimeError('Installer le composant OpenCode du Studio avant de lancer cet agent.')
    config=out/'opencode.json'
    config.write_text(json.dumps({'$schema':'https://opencode.ai/config.json','model':'ollama/qwen2.5-coder:1.5b','providers':{'ollama':{'settings':{'baseURL':'http://127.0.0.1:11434/v1'}}},'policies':[{'action':'tool.use','resource':'*','effect':'deny'}]},ensure_ascii=False))
    env={**os.environ,'OPENCODE_CONFIG':str(config)}
    result=subprocess.run([str(binary),'run','--standalone','--model','ollama/qwen2.5-coder:1.5b','--format','json',request['prompt']],cwd=out,env=env,capture_output=True,text=True,timeout=180)
    (out/'OPENCODE_EVENTS.jsonl').write_text(result.stdout,encoding='utf-8')
    parts=[]
    for line in result.stdout.splitlines():
        try:event=json.loads(line)
        except ValueError:continue
        part=event.get('part') or event.get('data',{}).get('part') or {}
        if part.get('type')=='text' and part.get('text'):parts.append(part['text'])
        elif event.get('type')=='text' and event.get('text'):parts.append(event['text'])
    if result.returncode or not parts:raise RuntimeError('OpenCode n’a pas produit de texte. Consulter les événements conservés dans le pack et vérifier Ollama.')
    (out/'proposition.md').write_text('\n'.join(parts),encoding='utf-8')
    (out/'MODE_AGENT.md').write_text('OpenCode 2.1.4, modèle Ollama local. Tous les outils sont refusés par la politique de cette exécution : aucune lecture, modification de fichiers, commande shell ou sous-agent n’est autorisé. La proposition reste à relire et appliquer explicitement.\n',encoding='utf-8')

if __name__=='__main__':run(json.loads(Path(sys.argv[1]).read_text()),Path(sys.argv[2]))
