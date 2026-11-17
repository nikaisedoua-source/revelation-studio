import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from app import host_shortcut
class ReturnShortcuts(unittest.TestCase):
 def test_explicit_active_task_precedes_other_footage(self):
  with tempfile.TemporaryDirectory() as t:
   data=Path(t);(data/'jobs').mkdir();(data/'jobs'/'abc123abc123.json').write_text('{}')
   with patch.object(host_shortcut,'DATA',data):self.assertEqual(host_shortcut.task_id('REVELATION_JOB:abc123abc123\n/media/def456def456/file.mov'),'abc123abc123')
 def test_rejects_unknown_and_ambiguous_tasks(self):
  with tempfile.TemporaryDirectory() as t,patch.object(host_shortcut,'DATA',Path(t)):
   for text in ['','/media/abc123abc123/a.mov','/abc123abc123/a.mov\n/def456def456/b.mov']:
    with self.subTest(text=text),self.assertRaises(ValueError):host_shortcut.task_id(text)
 def test_link_rejects_anything_except_a_task_id(self):
  with self.assertRaises(ValueError):host_shortcut.open_task('https://invalid.test')
