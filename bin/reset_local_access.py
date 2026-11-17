#!/usr/bin/env python3
"""Safely reset the local Studio login without touching projects or media.

This is intentionally a terminal-only recovery action.  There is no public
unauthenticated reset endpoint in the web server.  The old auth record is
copied to data/auth_backups before it is removed, and the next Studio launch
creates a fresh profile with the stronger password policy.
"""

from datetime import datetime
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
AUTH = DATA / "auth.json"
BACKUPS = DATA / "auth_backups"


def main() -> int:
    if not AUTH.exists():
        print("Aucun profil local à réinitialiser : l'écran de première ouverture est déjà disponible.")
        return 0
    print("Cette opération ne supprime ni projets, ni productions, ni modèles.")
    print("Elle sauvegarde uniquement l'ancien fichier d'authentification puis prépare une nouvelle création de profil.")
    confirmation = input("Taper RESET pour continuer : ").strip()
    if confirmation != "RESET":
        print("Opération annulée.")
        return 1
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = BACKUPS / f"auth-{stamp}.json"
    shutil.copy2(AUTH, backup)
    try:
        backup.chmod(0o600)
    except OSError:
        pass
    AUTH.unlink()
    print(f"Ancien profil sauvegardé dans : {backup}")
    print("Relancer Révélation AI Studio, puis choisir une identité et un mot de passe d'au moins 12 caractères.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
