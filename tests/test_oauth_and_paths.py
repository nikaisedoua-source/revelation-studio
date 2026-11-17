import hashlib,json,tempfile,time,unittest,urllib.parse
from unittest.mock import patch
from pathlib import Path
from app import google_oauth,config,providers,cloud_client
class OAuthAndPaths(unittest.TestCase):
 def test_google_one_use_state_pkce_and_expiration(self):
  with patch.object(google_oauth,'client',return_value=('client-id','private-secret')):
   url=google_oauth.begin('http://127.0.0.1:8848/api/auth/google/callback','local-session')
   q=urllib.parse.parse_qs(urllib.parse.urlparse(url).query);state=q['state'][0];entry=google_oauth.STATES[state]
   self.assertEqual(q['code_challenge_method'],['S256']);self.assertGreater(len(entry['verifier']),40);self.assertNotIn('private-secret',url)
   entry['expires']=time.time()-1
   with self.assertRaisesRegex(ValueError,'expirée'):google_oauth.finish(state,'code')
   self.assertNotIn(state,google_oauth.STATES)
   with self.assertRaises(ValueError):google_oauth.finish(state,'code')
 def test_missing_external_disk_uses_local_fallback_without_creating_mount(self):
  with tempfile.TemporaryDirectory() as t:
   external=Path(t)/'missing-volume';data=Path(t)/'profile'
   with patch.object(config,'EXTERNAL',external),patch.object(config,'EXPORTS',external/'exports'),patch.object(config,'DATA',data):
    self.assertEqual(config.production_root(),data/'productions_locales');self.assertFalse(external.exists())
 def test_kling_new_api_downloads_outputs_video(self):
  with patch.object(cloud_client,'settings',return_value=({'adapter':'kling','provider':'kling','model_var':'KLING_MODEL','default_model':'kling-3.0'},{'KLING_API_KEY':'private'})),patch.object(cloud_client,'request',side_effect=[{'code':0,'data':{'id':'job123'}},{'code':0,'data':[{'id':'job123','status':'succeeded','outputs':[{'type':'video','url':'https://cdn.example.test/result.mp4'}]}]}]),patch.object(cloud_client,'download_asset',return_value=b'video'*500),patch.object(providers,'mark_verified'):
   with tempfile.TemporaryDirectory() as t:self.assertTrue(cloud_client.other_video('kling_video','Un plan',Path(t)).is_file())
 def test_tripo_downloads_actual_glb_not_planning_card(self):
  responses=[{'code':0,'data':{'task_id':'task123'}},{'code':0,'data':{'status':'success','progress':100,'output':{'model_url':'https://cdn.example.test/car.glb'}}}]
  with patch.object(cloud_client,'settings',return_value=({'provider':'tripo','model_var':'TRIPO_MODEL','default_model':'v3.1-20260211'},{'TRIPO_API_KEY':'private'})),patch.object(cloud_client,'request',side_effect=responses),patch.object(cloud_client,'download_asset',return_value=b'glTF'+b'fixture'*20),patch.object(providers,'mark_verified'):
   with tempfile.TemporaryDirectory() as t:
    out=cloud_client.model_3d('tripo_3d','Voiture rouge',Path(t));self.assertEqual(out.read_bytes()[:4],b'glTF');self.assertNotIn('private',(Path(t)/'TACHE_DISTANTE.json').read_text())
