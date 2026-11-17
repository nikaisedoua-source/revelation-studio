import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from app import film_workflow as film,project_data

class FilmWorkflow(unittest.TestCase):
 def project(self):
  p=project_data.default_project();p['scenes']=[{'id':'scene-1','title':'INT. ATELIER — JOUR','screenplay':'DANIEL\n« Texte exact, inchangé. »\n','shot_list':[]}];return film.add_coverage(p)
 def test_fountain_preserves_original_and_dialogue(self):
  source='Title: Mon film\n\nINT. ATELIER — JOUR #atelier#\n\nDANIEL\n«  Deux espaces, exacts. »\n\nEXT. RUE — NUIT\nUne porte se ferme.\n'
  r=film.parse_fountain(source);self.assertEqual(r['source_text'],source);self.assertEqual(r['scenes'][0]['id'],'atelier');self.assertIn('«  Deux espaces, exacts. »',r['scenes'][0]['screenplay'])
  p=self.project();updated=film.append_fountain(p,source);self.assertEqual(len(updated['scenes']),3);self.assertEqual(updated['scenes'][0],p['scenes'][0])
 def test_coverage_keeps_existing_shots(self):
  p=self.project();again=film.add_coverage(p);self.assertEqual(again['scenes'][0]['shot_list'],p['scenes'][0]['shot_list'])
 def test_script_change_invalidates_approval_and_preserves_media(self):
  p=self.project();q=p['scenes'][0]['shot_list'][0];q['reference_asset_id']='abcdef123456';q['review']='approuve';approved=film.prepare_save(p,p)
  self.assertEqual(film.report(approved)['approved'],1)
  changed=copy.deepcopy(approved);changed['scenes'][0]['screenplay']+='Une action nouvelle.\n'
  result=film.prepare_save(approved,changed);q2=result['scenes'][0]['shot_list'][0]
  self.assertEqual(q2['review'],'a_revoir');self.assertEqual(q2['reference_asset_id'],'abcdef123456');self.assertEqual(film.report(result)['approved'],0)
 def test_character_costume_change_invalidates_shot(self):
  p=self.project();p['characters']=[{'id':'daniel','name':'Daniel','costume':'veste bleue'}];p['scenes'][0]['shot_list'][0].update(characters=['daniel'],review='approuve');approved=film.prepare_save(p,p)
  changed=copy.deepcopy(approved);changed['characters'][0]['costume']='veste rouge'
  result=film.prepare_save(approved,changed);self.assertEqual(result['scenes'][0]['shot_list'][0]['review'],'a_revoir')
 def test_history_and_optimistic_revision(self):
  with tempfile.TemporaryDirectory() as d,patch.object(project_data,'PROJECTS',Path(d)),patch.object(project_data,'HISTORY',Path(d)/'history'):
   first=project_data.save_project({'id':'test-film','title':'Original','scenes':[]});second=project_data.save_project({'id':'test-film','title':'Changé'},first['revision'])
   self.assertEqual(second['revision'],2);self.assertEqual(len(project_data.history('test-film')),1)
   with self.assertRaises(ValueError):project_data.save_project({'id':'test-film','title':'Périmé'},first['revision'])
   h=project_data.history('test-film')[0];restored=project_data.restore('test-film',h['id'],2)
   self.assertEqual(restored['title'],'Original');self.assertEqual(restored['revision'],3);self.assertEqual(len(project_data.history('test-film')),2)
 def test_missing_media_is_reported_before_render(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaisesRegex(ValueError,'Ajouter une image'):film.export_pack(self.project(),Path(d),lambda aid:None,render=True)
 def test_export_keeps_scene_identity(self):
  with tempfile.TemporaryDirectory() as d:
   p=self.project();film.export_pack(p,Path(d),lambda aid:None)
   self.assertIn('#scene-1#',(Path(d)/'SCENARIO.fountain').read_text());self.assertEqual(json.loads((Path(d)/'PROJET_FILM.json').read_text())['scenes'][0]['screenplay'],p['scenes'][0]['screenplay'])

if __name__=='__main__':unittest.main()
