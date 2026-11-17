import base64, io, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from app import providers, cloud_client, registry

class CloudConnectors(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.patches=[patch.object(providers,'CONFIG_FILE',self.root/'keys.json'),patch.object(providers,'CHECKS_FILE',self.root/'checks.json'),patch.dict(os.environ,{},clear=True)]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def configure(self,mid):
  c=providers.connector(mid);vals={k:'secret-test' for k in c['required']}
  if 'FREELLMAPI_BASE_URL' in vals:vals['FREELLMAPI_BASE_URL']='https://gateway.test'
  if 'CLOUDFLARE_ACCOUNT_ID' in vals:vals['CLOUDFLARE_ACCOUNT_ID']='a'*32
  if 'ELEVENLABS_VOICE_ID' in vals:vals['ELEVENLABS_VOICE_ID']='voice123'
  providers.configure(c['provider'],vals)
 def test_all_text_adapters_use_official_urls_and_extract_text(self):
  fixtures={'claude_sonnet':{'content':[{'type':'text','text':'Texte exact'}]},'gemini_flash':{'candidates':[{'content':{'parts':[{'text':'Texte exact'}]}}]},'cohere_command':{'message':{'content':[{'text':'Texte exact'}]}},'cloudflare_llama':{'result':{'response':'Texte exact'}}}
  for mid,c in providers.CONNECTORS.items():
   if c['kind']!='text':continue
   with self.subTest(mid=mid):
    self.configure(mid)
    with patch.object(cloud_client,'request',return_value=fixtures.get(mid,{'choices':[{'message':{'content':'Texte exact'}}]})) as send:
     self.assertEqual(cloud_client.text(mid,'Paroles source « exactes »'), 'Texte exact');args=send.call_args.args;self.assertTrue(args[0].startswith('https://'));self.assertNotIn('flow-ia',args[0]);self.assertIn('Paroles source',json.dumps(args[1],ensure_ascii=False));self.assertNotIn('secret-test',json.dumps(args[1]));self.assertTrue(providers.status()[c['provider']]['last_verified'])
 def test_secret_storage_and_status_never_return_key(self):
  self.configure('groq_llama');self.assertEqual(providers.CONFIG_FILE.stat().st_mode&0o777,0o600)
  self.assertNotIn('secret-test',json.dumps(providers.status()))
  providers.mark_verified('groq','model');providers.configure('groq',{'GROQ_API_KEY':'changed-key'})
  self.assertIsNone(providers.status()['groq']['last_verified'])
 def test_unknown_services_never_send_requests(self):
  with patch.object(cloud_client,'request') as send:
   for mid in ['flow_ia','adis_ia','ia_studio','replica']:
    with self.assertRaisesRegex(RuntimeError,'aucune API'):cloud_client.text(mid,'texte')
   send.assert_not_called()
 def test_cloud_inventory_uses_credentials_not_local_api_directory(self):
  self.configure('groq_llama')
  with patch.object(registry,'request_json',side_effect=RuntimeError()):data={m['id']:m for m in registry.inventory()}
  self.assertTrue(data['groq_llama']['can_run']);self.assertFalse(data['flow_ia']['can_run']);self.assertFalse(data['gemini_image']['can_run'])
 def test_image_result_decodes_and_keeps_reference(self):
  self.configure('gemini_image');im=Image.new('RGB',(16,16),'red');raw=io.BytesIO();im.save(raw,format='PNG');ref=self.root/'ref.png';ref.write_bytes(raw.getvalue())
  response={'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'image/png','data':base64.b64encode(raw.getvalue()).decode()}}]}}]}
  with patch.object(cloud_client,'request',return_value=response) as req:
   result=cloud_client.image('gemini_image','Personnage inchangé',self.root,[ref]);self.assertTrue(result[0].is_file());self.assertEqual(len(req.call_args.args[1]['contents'][0]['parts']),2)
 def test_veo_polls_operation_and_downloads_media(self):
  self.configure('veo');responses=[{'name':'models/veo-3.1-generate-preview/operations/job123'},{'done':True,'response':{'generateVideoResponse':{'generatedSamples':[{'video':{'uri':'https://generativelanguage.googleapis.com/v1beta/files/file123:download'}}]}}},b'x'*2000]
  with patch.object(cloud_client,'request',side_effect=responses) as req,patch.object(cloud_client.time,'sleep'):
   output=cloud_client.video('veo','Plan cinématographique',self.root);self.assertEqual(output.stat().st_size,2000);self.assertEqual(req.call_count,3)
 def test_veo_does_not_send_keys_to_unexpected_download_host(self):
  self.configure('veo')
  with patch.object(cloud_client,'request',return_value={'name':'operations/job123','done':True,'response':{'generateVideoResponse':{'generatedSamples':[{'video':{'uri':'https://unexpected.test/a'}}]}}}) as req:
   with self.assertRaisesRegex(RuntimeError,'clé non transmise'):cloud_client.video('veo','plan',self.root)
   self.assertEqual(req.call_count,1)
