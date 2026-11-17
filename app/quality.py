"""Production-readiness checks for Révélation AI Studio.

The checker is deliberately conservative: a catalogue entry, a prepared
bridge, or a storyboard placeholder is evidence of preparation, not proof of
an executed render.  The result is JSON so it can be shown in the UI and kept
alongside a production manifest.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _item(key: str, label: str, score: float, evidence: str, next_action: str = "") -> dict[str, Any]:
    score = max(0.0, min(10.0, round(float(score), 1)))
    status = "ok" if score >= 9.5 else "partial" if score >= 5 else "blocked"
    return {
        "key": key,
        "label": label,
        "score": score,
        "status": status,
        "evidence": evidence,
        "next_action": next_action,
    }


def _scene_rows(project: dict[str, Any]) -> list[dict[str, Any]]:
    rows = project.get("scenes") or []
    return [row for row in rows if isinstance(row, dict)]


def _job_files(jobs: list[dict[str, Any]]) -> set[str]:
    names: set[str] = set()
    for job in jobs:
        if job.get("status") != "complete":
            continue
        for entry in job.get("files") or []:
            name = entry.get("name") if isinstance(entry, dict) else None
            if name:
                names.add(str(name))
    return names


def assess(project: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Return a weighted, human-readable readiness report.

    ``context`` is produced by the local status endpoint and contains no
    secrets.  Scores are intentionally not rounded up: a missing Adobe
    validation, for example, remains a visible blocker until the bridge has
    actually written a heartbeat/result file.
    """

    rows = _scene_rows(project)
    characters = [x for x in (project.get("characters") or []) if isinstance(x, dict)]
    continuity = project.get("continuity") or {}
    jobs = context.get("jobs") or []
    files = _job_files(jobs)
    apps = context.get("apps") or {}
    models = context.get("models") or []
    auth = context.get("auth") or {}
    external = bool(context.get("external_mounted"))
    ffmpeg = bool(context.get("ffmpeg"))

    items: list[dict[str, Any]] = []
    items.append(_item(
        "bible", "Bible de production",
        10 if project.get("title") and project.get("author") else 5 if project.get("title") else 0,
        f"Titre: {'oui' if project.get('title') else 'non'} · réalisateur: {'oui' if project.get('author') else 'non'}.",
        "Renseigner l’identité du réalisateur avant la validation finale." if not project.get("author") else "",
    ))
    dialogue_count = sum(bool(str(row.get("dialogue_source", "")).strip()) for row in rows)
    dialogue_score = 10 if rows and dialogue_count == len(rows) else 7 if rows and dialogue_count else 3 if rows else 0
    items.append(_item(
        "dialogue", "Paroles source protégées", dialogue_score,
        f"{dialogue_count}/{len(rows)} scène(s) ont un champ de paroles source; le verrou preserve_exact_text={bool(project.get('preserve_exact_text'))}.",
        "Compléter les paroles exactes scène par scène; ne pas les remplacer par une proposition de moteur." if dialogue_score < 10 else "",
    ))
    continuity_score = 10 if characters and all(c.get("name") and c.get("costume") for c in characters) and continuity.get("axis") else 6 if characters or continuity else 2
    items.append(_item(
        "continuity", "Continuité des personnages et de l’axe", continuity_score,
        f"{len(characters)} personnage(s), axe: {continuity.get('axis', 'non renseigné')}.",
        "Décrire costume, accessoire, voix et axe pour chaque personnage." if continuity_score < 10 else "",
    ))
    prompt_count = sum(bool(str(row.get("image_prompt", "")).strip()) for row in rows)
    shot_count = sum(bool(row.get("shot_list")) for row in rows)
    visual_score = 10 if rows and prompt_count == len(rows) and shot_count == len(rows) else 7 if rows and prompt_count else 4 if rows else 0
    items.append(_item(
        "visual", "Storyboard, cadre et références par scène", visual_score,
        f"Prompts image: {prompt_count}/{len(rows)} · listes de plans: {shot_count}/{len(rows)}.",
        "Ajouter valeur de plan, focale, lumière motivée, axe et référence de continuité à chaque scène." if visual_score < 10 else "",
    ))
    finished_visual = bool(files.intersection({"titre_transparent.mov", "MOTION_TRANSPARENT.mov", "FILM_ANIMATIQUE.mp4", "GRAPHIC_ALPHA.mov", "ANIMATIQUE_PREVIEW.mp4"}))
    post_score = 10 if external and ffmpeg and finished_visual else 7 if external and ffmpeg else 4 if external else 0
    items.append(_item(
        "post", "Rendus image et exports interchangeables", post_score,
        f"Samsung T7={'monté' if external else 'absent'} · ffmpeg={'présent' if ffmpeg else 'absent'} · rendu local={'oui' if finished_visual else 'aucun récent'}.",
        "Brancher le Samsung T7, puis exécuter au moins un pack motion/animatique validé." if post_score < 10 else "",
    ))
    color_done = bool(files.intersection({"LOOK_CREATIF_REC709.cube", "LOOK_ASC_CDL.cc", "PARAMETRES_ET_PIPELINE.json"}))
    items.append(_item(
        "color", "Pipeline couleur documenté", 7 if color_done else 5,
        "LUT/CDL/pipeline présents dans une production terminée." if color_done else "Aucun pack couleur terminé dans l’historique récent.",
        "Générer le pack LUT + CDL et le vérifier sur des rushes dans Resolve/Lumetri." if not color_done else "",
    ))
    sound_done = bool(files.intersection({"SOURCES_SONORES.json", "BANQUE_SONORE_ET_DROITS.md"}))
    items.append(_item(
        "sound", "Son, droits et traçabilité", 6 if sound_done else 4,
        "Fiche de sources et licences présente." if sound_done else "Aucune fiche sonore terminée dans l’historique récent.",
        "Créer la fiche de banque sonore et conserver l’URL de licence de chaque fichier choisi." if not sound_done else "",
    ))
    connected = sum(bool(app.get("connected")) for app in apps.values())
    installed = sum(bool(app.get("installed")) for app in apps.values())
    integration_score = 10 if connected >= 4 else 8 if connected >= 2 else 6 if installed >= 2 else 3 if installed else 1
    items.append(_item(
        "integrations", "Ponts After Effects, Photoshop, Premiere, Resolve et Blender", integration_score,
        f"{connected}/{len(apps)} pont(s) actifs · {installed}/{len(apps)} logiciel(s) détectés.",
        "Ouvrir chaque logiciel, charger son pont local et produire un résultat/heartbeat avant de déclarer la chaîne intégrée." if integration_score < 10 else "",
    ))
    runnable = sum(bool(model.get("execution_verified")) for model in models)
    model_score = 10 if runnable >= 4 else 8 if runnable >= 2 else 5 if runnable else 0
    items.append(_item(
        "models", "Moteurs locaux réellement exécutables", model_score,
        f"{runnable} modèle(s) avec une génération réussie enregistrée; les autres restent à configurer ou à tester.",
        "Exécuter un test par famille (texte, voix, transcription, image/vision) et conserver la sortie." if model_score < 10 else "",
    ))
    security_score = 10 if auth.get("configured") and os.path.exists(context.get("auth_path", "")) else 0
    items.append(_item(
        "security", "Accès local et protection des secrets", security_score,
        "Profil local configuré; les clés externes ne sont pas écrites dans le dépôt." if security_score else "Profil local non configuré.",
        "Créer le profil réalisateur depuis l’écran de première ouverture." if not security_score else "",
    ))

    weighted = sum(item["score"] for item in items) / len(items) if items else 0
    blockers = [item for item in items if item["score"] < 9.5]
    return {
        "project_id": project.get("id", "revelation-studio"),
        "title": project.get("title", "Révélation Studio"),
        "score": round(weighted, 1),
        "scale": 10,
        "status": "prêt pour validation finale" if not blockers else "en préparation contrôlée",
        "items": items,
        "blockers": [{"label": item["label"], "next_action": item["next_action"]} for item in blockers],
        "method": "Moyenne de dix contrôles; aucun score n’est arrondi à 10 sans preuve locale.",
    }


def _render_verified(out):
    try:return json.loads((out/'RENDER_VALIDATION.json').read_text()).get('status')=='verified'
    except (OSError, ValueError):return False


def file_manifest(root: Path) -> list[dict[str, Any]]:
    """Return stable file metadata, excluding macOS AppleDouble files."""
    entries: list[dict[str, Any]] = []
    for path in sorted(root.iterdir(), key=lambda p: p.name):
        if not path.is_file() or path.name.startswith("._") or path.name == "PRODUCTION_MANIFEST.json":
            continue
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            for block in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(block)
        entries.append({"name": path.name, "bytes": path.stat().st_size, "sha256": digest.hexdigest()})
    return entries


def write_pack_manifest(out: Path, job_id: str, settings: dict[str, Any], status: str = "complete") -> Path:
    """Write the audit files that accompany every generated pack."""
    files = file_manifest(out)
    try:render_info=json.loads((out/'RENDER_VALIDATION.json').read_text())
    except (ValueError,OSError):render_info={}
    payload = {
        "schema": "revelation-production-manifest/v1",
        "job_id": job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "project_id": settings.get("project_id", "revelation-studio"),
        "kind": settings.get("kind", "unknown"),
        "title": settings.get("title", ""),
        "format": {"width": render_info.get("width",1920), "height": render_info.get("height",1080), "fps": render_info.get("fps",settings.get("fps", 25))},
        "source_text_policy": "preserve_exact_dialogue=true; propositions remain separate",
        "cinema_controls": ["intention", "axis 180 degrés", "raccord regard/mouvement", "focale et valeur de plan", "lumière motivée", "son séparé", "contrôle couleur"],
        "settings": settings,
        "files": files,
        "review": {
            "local_render_verified": _render_verified(out),
            "software_conform_verified": False,
            "license_verified": False,
            "human_picture_lock_required": True,
            "note": "Les deux derniers contrôles doivent être faits dans le logiciel cible et avec les licences des médias utilisés.",
        },
    }
    manifest = out / "PRODUCTION_MANIFEST.json"
    manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    checklist = out / "VALIDATION_CHECKLIST.md"
    checklist.write_text(
        "# Contrôle de livraison\n\n"
        "- [ ] Intention, durée, format et axe relus par le réalisateur\n"
        "- [ ] Paroles source comparées au scénario et conservées sans réécriture involontaire\n"
        "- [ ] Continuité des personnages, costumes, accessoires, regards et palette contrôlée\n"
        "- [ ] Fichiers ouverts dans le logiciel cible (After Effects, Photoshop, Premiere, Resolve ou Blender)\n"
        "- [ ] Espaces couleur, scopes, exposition et raccords vérifiés sur les rushes\n"
        "- [ ] Sons, bruitages, musique et licences consignés avec URL et date\n"
        "- [ ] Master exporté, relu en entier et archivé avec ce manifeste\n\n"
        "Le Studio ne transforme pas une préparation en master final sans ces validations humaines.\n",
        encoding="utf-8",
    )
    return manifest
