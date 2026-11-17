"""One model per short-lived process. No model-generated code is executed."""
import json, os, sys, traceback
from pathlib import Path

def main():
 job=json.loads(Path(sys.argv[1]).read_text());out=Path(sys.argv[2]);m=job['model'];action=job['action'];path=m.get('path')
 os.environ.setdefault('HF_HOME','/Volumes/Samsung T7/IA_STUDIO_2026/cache_huggingface')
 os.environ.setdefault('HF_HUB_OFFLINE','1')
 os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
 if m['engine']=='mlx_lm':
  from mlx_lm import load,generate
  model,tokenizer=load(path)
  prompt=tokenizer.apply_chat_template([{'role':'user','content':job['prompt']}],tokenize=False,add_generation_prompt=True)
  text=generate(model,tokenizer,prompt=prompt,max_tokens=job.get('max_tokens',1500),verbose=False)
  (out/'proposition.md').write_text(text,encoding='utf-8')
 elif m['engine']=='mlx_vlm':
  from mlx_vlm import load,generate
  from mlx_vlm.prompt_utils import apply_chat_template
  model,processor=load(path)
  image=job.get('image')
  prompt=apply_chat_template(processor,model.config,job['prompt'],num_images=1 if image else 0)
  kwargs={'image':[image]} if image else {}
  answer=generate(model,processor,prompt=prompt,max_tokens=job.get('max_tokens',1500),verbose=False,**kwargs)
  text=answer.text if hasattr(answer,'text') else str(answer)
  (out/'proposition.md').write_text(text,encoding='utf-8')
 elif action=='tts' and m['engine']=='mlx_audio':
  from mlx_audio.tts.utils import load_model
  import numpy as np
  from scipy.io.wavfile import write
  model=load_model(path)
  if 'VoiceDesign' in path:
   results=model.generate_voice_design(text=job['text'],language='French',instruct=job.get('voice_description','Voix française posée et naturelle.'),max_tokens=2048)
  else:
   results=model.generate(text=job['text'],lang_code='fr',max_tokens=2048)
  pieces=[];sr=24000
  for r in results:
   pieces.append(np.asarray(r.audio));sr=r.sample_rate
  if not pieces:raise RuntimeError('Le moteur n’a produit aucun échantillon audio.')
  wave=np.concatenate(pieces);write(out/'voix.wav',sr,np.clip(wave,-1,1).astype(np.float32))
 elif action=='asr':
  if m['engine']=='faster_whisper':
   from faster_whisper import WhisperModel
   model=WhisperModel(path,device='cpu',compute_type='int8',cpu_threads=6,local_files_only=True)
   segments,info=model.transcribe(job['audio'],language='fr',vad_filter=False)
   parts=[{'start':s.start,'end':s.end,'text':s.text} for s in segments]
   text=' '.join(s['text'].strip() for s in parts)
   (out/'segments.json').write_text(json.dumps(parts,ensure_ascii=False,indent=2))
  else:
   from mlx_audio.stt import load
   model=load(path);answer=model.generate(job['audio'],language='French');text=answer.text
  (out/'transcription.txt').write_text(text,encoding='utf-8')
 else:raise RuntimeError('Adaptateur non disponible pour ce modèle et cette tâche.')
 (out/'MODELE_EXECUTE.json').write_text(json.dumps({'id':m['id'],'engine':m['engine'],'path':path,'action':action,'completed':True},ensure_ascii=False,indent=2))

if __name__=='__main__':
 try:main()
 except Exception:
  traceback.print_exc();sys.exit(1)
