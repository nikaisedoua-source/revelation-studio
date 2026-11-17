import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app import motion_script, bridges, workspace, quality

class MotionWorkflow(unittest.TestCase):
 def test_source_text_and_frame_quantization(self):
  source='0-1.5 | Église : « Texte exact » | À venir | fondu\n1.5-3 | Fin ! | | zoom'
  p=motion_script.parse_script(source,3,25)
  self.assertEqual(p['source_script'],source)
  self.assertEqual(p['cues'][0]['title'],'Église : « Texte exact »')
  self.assertEqual(p['cues'][0]['end_frame'],p['cues'][1]['start_frame'])
  self.assertEqual(p['frame_count'],75)
 def test_rejects_overlap_and_invalid_animation(self):
  for source in ['0-2 | A\n1-3 | B','0-4 | A','0-3 | A | B | executable','0-1 | A\nAutre texte']:
   with self.subTest(source=source),self.assertRaises(ValueError):motion_script.parse_script(source,3)
 def test_distributed_lines_and_readability(self):
  p=motion_script.parse_script('Un\nDeux\nTrois',6)
  self.assertEqual([(c['start'],c['end']) for c in p['cues']],[(0,2),(2,4),(4,6)])
  self.assertTrue(motion_script.parse_script('un deux trois quatre cinq six sept huit',3)['warnings'])
 def test_bounds_and_controls(self):
  for text,seconds,fps in [('',3,25),('A',float('nan'),25),('A',3,23),('A\x00B',3,25)]:
   with self.assertRaises(ValueError):motion_script.parse_script(text,seconds,fps)
 def test_native_script_escapes_text(self):
  p=motion_script.parse_script('0-3 | Texte "avec guillemets" et antislash \\ | Sous-titre | zoom',3)
  motion_script._prepare(p,{'style':'cinema','color':'#dfba75'})
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'motion.jsx';motion_script._native_ae(p,'Titre',path)
   code=path.read_text()
   self.assertIn('\\"avec guillemets\\"',code)
   self.assertIn('addComp',code)
 def test_empty_or_invalid_heartbeat_never_connects(self):
  with tempfile.TemporaryDirectory() as d,patch.object(bridges,'BASE',Path(d)):
   folder=Path(d)/'photoshop';folder.mkdir()
   for content in ['', '{}','{"app":"blender","connected":true}','{"app":"photoshop","connected":"true"}']:
    (folder/'heartbeat.json').write_text(content)
    self.assertFalse(bridges.states()['photoshop']['connected'])
   (folder/'heartbeat.json').write_text('{"app":"photoshop","connected":true}')
   self.assertTrue(bridges.states()['photoshop']['connected'])
 def test_workspace_links_preserve_original_files(self):
  with tempfile.TemporaryDirectory() as d:
   base=Path(d);root=base/'workspace';output=base/'production';output.mkdir();(output/'original.txt').write_text('exact')
   with patch.object(workspace,'ROOT',root):
    j={'id':'abc123','output_dir':str(output),'spec':{'kind':'motion','title':'Un titre'}}
    workspace.register(j);workspace.register(j)
    links=list((root/'04_MOTION_DESIGN').iterdir())
    self.assertEqual(len(links),1);self.assertTrue(links[0].is_symlink())
    self.assertEqual((links[0]/'original.txt').read_text(),'exact')
 def test_manifest_does_not_claim_render_without_validation(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'fiche.md').write_text('Préparation')
   path=quality.write_pack_manifest(root,'abc',{'kind':'scenario'})
   self.assertFalse(json.loads(path.read_text())['review']['local_render_verified'])

if __name__=='__main__':unittest.main()
