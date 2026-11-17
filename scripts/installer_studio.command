#!/bin/zsh
set -eu
studio_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$studio_root"
if ! command -v python3 >/dev/null; then
  print 'Python 3.11 ou plus récent est requis pour le compagnon. La version navigateur reste utilisable sans Python.'
  exit 1
fi
python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11 ou plus récent requis"'
if [[ -e .venv ]]; then
  print 'Un environnement du Studio existe déjà. Il est conservé sans mise à jour.'
  .venv/bin/python -c 'import fastapi,uvicorn,PIL,numpy'
else
  python3 -m venv .venv
  .venv/bin/python -m pip install -r requirements.txt
fi
print 'Compagnon prêt. Lancer scripts/demarrer_studio.command.'
print 'Modèles et logiciels de montage sont détectés séparément. Paramètres optionnels dans .env.example.'
