"""Small, human-readable project database for the local Studio.

The project bible is JSON on purpose: it can be versioned, copied to another
machine and inspected without a proprietary database.  It stores the author's
words and adds production metadata around them; it never silently rewrites the
source dialogue.
"""

import json
import re
import threading
import uuid
import copy
from datetime import datetime, timezone
from pathlib import Path

from .config import ROOT, DATA
PROJECTS = DATA / "projects"
PROJECTS.mkdir(parents=True, exist_ok=True)
TEASER_ROOT = ROOT.parent / "TEASER_KACOU_183"
HISTORY = DATA / "history"
SAVE_LOCK = threading.RLock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", (value or "projet").lower()).strip("-")
    return value[:48] or "projet"


def default_project():
    return {
        "id": "revelation-studio",
        "title": "Révélation Studio",
        "author": "",
        "language": "fr-FR",
        "format": "16:9",
        "fps": 25,
        "status": "preproduction",
        "created_at": _now(),
        "updated_at": _now(),
        "source_root": str(ROOT.parent),
        "preserve_exact_text": True,
        "continuity": {
            "axis": "180 degrés",
            "screen_direction": "À verrouiller par séquence",
            "character_identity": "Bible de personnages obligatoire avant génération de plans",
            "look": "À définir par projet, puis raccordé par scènes",
        },
        "characters": [],
        "scenes": [],
        "assets": [
            {
                "name": "TEASER_KACOU_183",
                "path": str(ROOT.parent / "TEASER_KACOU_183"),
                "role": "teaser horizontal sans voix off",
            },
            {
                "name": "MOTION_DESIGN_STUDIO",
                "path": str(ROOT.parent / "MOTION_DESIGN_STUDIO"),
                "role": "titres After Effects, Fusion et exports alpha",
            },
        ],
        "workflow": [
            "intention et note du réalisateur",
            "bible personnages et accessoires",
            "scénario avec dialogues source",
            "découpage plan par plan et continuité",
            "références visuelles et prompts par scène",
            "storyboard puis animatique",
            "génération image/vidéo avec contrôle humain",
            "montage image et son",
            "étalonnage technique puis créatif",
            "conformation, contrôles et master",
        ],
    }


def ensure_default():
    p = PROJECTS / "revelation-studio.json"
    if not p.exists():
        p.write_text(json.dumps(default_project(), ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def list_projects():
    ensure_default()
    values = []
    for p in sorted(PROJECTS.glob("*.json")):
        try:
            values.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
    return values


def get_project(project_id: str):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,63}", project_id):
        return None
    p = PROJECTS / (project_id + ".json")
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_project(payload: dict, expected_revision=None):
    with SAVE_LOCK:
        project_id = slug(payload.get("id") or payload.get("title") or "projet")
        previous = get_project(project_id)
        if expected_revision is not None and (previous or {}).get('revision',0) != expected_revision:
            raise ValueError('Le projet a changé dans une autre fenêtre. Recharger avant de sauvegarder.')
        project = copy.deepcopy(previous or default_project())
        project.update(payload)
        project['id'] = project_id
        project['revision'] = (previous or {}).get('revision',0)+1
        project['updated_at'] = _now()
        if previous:
            folder=HISTORY/project_id;folder.mkdir(parents=True,exist_ok=True)
            stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'-'+uuid.uuid4().hex[:6]
            (folder/(stamp+'.json')).write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf-8')
        path=PROJECTS/(project_id+'.json');temp=path.with_suffix('.tmp')
        temp.write_text(json.dumps(project,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(path)
        return project


def history(project_id):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}',project_id):return []
    values=[]
    for p in sorted((HISTORY/project_id).glob('*.json'),reverse=True)[:60]:
        try:
            d=json.loads(p.read_text());values.append({'id':p.stem,'revision':d.get('revision',0),'title':d.get('title',''),'updated_at':d.get('updated_at'),'scenes':len(d.get('scenes',[]))})
        except (OSError,ValueError):continue
    return values


def restore(project_id,version_id,expected_revision):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,63}',project_id) or not re.fullmatch(r'[0-9]{8}T[0-9]{12}-[a-f0-9]{6}',version_id):raise ValueError('Version invalide.')
    path=HISTORY/project_id/(version_id+'.json')
    if not path.is_file():raise ValueError('Version introuvable.')
    old=json.loads(path.read_text());old['id']=project_id
    return save_project(old,expected_revision)


def add_scene(project_id: str, scene: dict):
    project = get_project(project_id)
    if project is None:
        return None
    scene = dict(scene)
    scene["id"] = slug(scene.get("id") or scene.get("title") or f"scene-{len(project['scenes']) + 1}")
    scene.setdefault("number", len(project["scenes"]) + 1)
    scene.setdefault("characters", [])
    scene.setdefault("dialogue_source", "")
    scene.setdefault("image_prompt", "")
    scene.setdefault("shot_list", [])
    project["scenes"].append(scene)
    return save_project(project)


def import_kacou_teaser(project_id: str = "revelation-studio"):
    """Load the existing Kacou 180–183 teaser bible without rewriting source text.

    The source package already contains the official titles and the director's
    30-second timing notes.  We import those editorial facts and leave the
    chapter 183 wording as an announcement placeholder because no official
    183 source text is present in this workspace.
    """
    catalogue_path = TEASER_ROOT / "V2_CINEMA" / "sources" / "chapitres.json"
    if not catalogue_path.exists():
        return None
    catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
    chapters = {int(row["number"]): row for row in catalogue if int(row.get("number", 0)) in {180, 181, 182}}
    directions = {
        180: {
            "action": "Installer une ouverture calme : livre ouvert au petit matin, puis faire apparaître le titre officiel.",
            "image_prompt": "Livre ouvert au petit matin, lumière naturelle douce, gros plan lent, profondeur de champ courte, palette ambre et noirs profonds, illustration éditoriale, aucune reconstitution documentaire.",
            "shot_list": [{"value": "plan rapproché", "lens": "50 mm", "movement": "travelling avant lent", "light": "lumière matinale motivée"}],
        },
        181: {
            "action": "Faire surgir Har Meguiddo dans une montagne couverte de brume, avec une coupe motivée par la progression du teaser.",
            "image_prompt": "Montagne dans la brume, échelle majestueuse mais lisible, caméra en plan large 35 mm, lumière diffuse venant de l'horizon, illustration éditoriale, pas de reconstitution historique.",
            "shot_list": [{"value": "plan général", "lens": "35 mm", "movement": "élévation lente", "light": "brume éclairée par l'horizon"}],
        },
        182: {
            "action": "Présenter les deux colombes au-dessus des eaux comme une image éditoriale, puis préparer le passage vers l'attente.",
            "image_prompt": "Deux colombes au-dessus d'eaux calmes, contre-jour doux, composition centrée et espace négatif pour le titre, plan moyen 50 mm, illustration éditoriale, pas de document historique.",
            "shot_list": [{"value": "plan moyen", "lens": "50 mm", "movement": "panoramique horizontal très lent", "light": "contre-jour doux"}],
        },
    }
    scenes = []
    source_material = []
    for number in (180, 181, 182):
        chapter = chapters.get(number)
        if not chapter:
            continue
        official = TEASER_ROOT / "V2_CINEMA" / "sources_officielles" / f"Kacou_{number}.json"
        publication_date = None
        if official.exists():
            try:
                publication_date = json.loads(official.read_text(encoding="utf-8")).get("publication_date")
            except (OSError, json.JSONDecodeError):
                publication_date = None
        d = directions[number]
        source_material.append({
            "number": number,
            "chapter": chapter["chapter"],
            "title": chapter["title"],
            "source": chapter.get("source"),
            "catalogue": chapter.get("catalogue"),
            "publication_date": publication_date,
            "local_file": str(official),
        })
        scenes.append({
            "id": f"kacou-{number}",
            "number": number - 179,
            "chapter_number": number,
            "title": chapter["title"],
            "action": d["action"],
            "dialogue_source": "Aucune voix off dans cette version : conserver le titre source et le silence narratif.",
            "image_prompt": d["image_prompt"],
            "characters": [],
            "shot_list": d["shot_list"],
            "source_url": chapter.get("source"),
            "source_file": str(official),
        })
    scenes.append({
        "id": "kacou-183-announcement",
        "number": 4,
        "chapter_number": 183,
        "title": "Kacou 183 — bientôt disponible",
        "action": "Passer de l'attente à la révélation finale : carton Kacou 183, mention BIENTÔT DISPONIBLE, puis adresse de diffusion.",
        "dialogue_source": "Aucune voix off dans cette version : annonce graphique uniquement.",
        "image_prompt": "Carton cinéma noir profond et or, titre Kacou 183, mention BIENTÔT DISPONIBLE, composition 16:9, marges de sécurité, lumière discrète, lisibilité de projection.",
        "characters": [],
        "shot_list": [{"value": "carton plein cadre", "lens": "—", "movement": "fondu et apparition typographique", "light": "or discret sur fond noir"}],
        "source_note": "Annonce éditoriale du réalisateur; le texte officiel de Kacou 183 n'est pas présent dans le dossier source.",
    })
    project = get_project(project_id) or default_project()
    project.update({
        "id": project_id,
        "title": "Kacou 183 — Teaser 30 s",
        "format": "16:9",
        "fps": 25,
        "status": "preproduction",
        "preserve_exact_text": True,
        "scenes": scenes,
        "source_material": {
            "root": str(TEASER_ROOT / "V2_CINEMA"),
            "chapters": source_material,
            "director_note": "Version horizontale 16:9, 30 secondes, sans voix off; les images sont des illustrations éditoriales et les titres restent à relire.",
        },
        "assets": [
            {"name": "TEASER_KACOU_183", "path": str(TEASER_ROOT), "role": "versions 30 s, références, vérifications"},
            {"name": "KACOU_183_CINEMA_SANS_VOIX_30s_16x9.mp4", "path": str(TEASER_ROOT / "KACOU_183_CINEMA_SANS_VOIX_30s_16x9.mp4"), "role": "référence de montage sans voix off"},
            {"name": "KACOU_183_BIENTOT_30s_16x9.mp4", "path": str(TEASER_ROOT / "KACOU_183_BIENTOT_30s_16x9.mp4"), "role": "référence teaser 30 secondes"},
        ],
    })
    return save_project(project)
