"""Deterministic, offline motion typography from a timed text script.

The script is data. Neither parsing nor rendering executes user-supplied code.
All time intervals are half-open and rounded to the selected frame rate.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

from .outputs import FFMPEG, ease, font, js

WIDTH, HEIGHT = 1920, 1080
SAFE_X = 192
TIME = r"\d+(?::\d{1,2}){0,2}(?:[.,]\d+)?"
RANGE = re.compile(rf"^\s*({TIME})\s*s?\s*(?:->|→|–|—|-)\s*({TIME})\s*s?\s*$")
ANIMATIONS = {"fondu": "fondu", "fade": "fondu", "montee": "montee", "montée": "montee", "slide": "montee", "zoom": "zoom"}


def _time(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    if len(parts) > 1 and any(float(x) >= 60 for x in parts[1:]):
        raise ValueError("Le timecode doit utiliser des minutes et secondes inférieures à 60.")
    total = 0.0
    for part in parts:
        total = total * 60 + float(part)
    return total


def parse_script(script: str, seconds: float, fps: int = 25) -> dict:
    """Return a validated plan, retaining each displayed source text verbatim.

    Accept either one displayed title per line, or consistently timed lines:
    ``0-4 | Title | Optional subtitle | fondu``. Surrounding delimiter spaces
    are syntax; internal spelling, accents, punctuation and spaces are kept.
    """
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or not 3 <= seconds <= 120:
        raise ValueError("La durée doit être comprise entre 3 et 120 secondes.")
    if isinstance(fps, bool) or not isinstance(fps, int) or not 24 <= fps <= 60:
        raise ValueError("La cadence doit être un entier de 24 à 60 images/seconde.")
    if not isinstance(script, str) or len(script) > 14000:
        raise ValueError("Le script doit être du texte de 14 000 caractères maximum.")
    if any(ord(c) < 32 and c not in "\n\r\t" for c in script):
        raise ValueError("Le script contient un caractère de contrôle non pris en charge.")
    lines = [line.strip() for line in script.splitlines() if line.strip()]
    if not lines:
        raise ValueError("Ajoute les textes à animer, un carton par ligne.")
    if len(lines) > 40:
        raise ValueError("Un motion design peut contenir jusqu’à 40 cartons.")
    frame_count = round(seconds * fps)
    duration = frame_count / fps
    modes = [bool(RANGE.fullmatch(line.split("|", 1)[0])) for line in lines]
    timed = all(modes)
    if any(modes) and not timed:
        raise ValueError("Utilise des horaires sur toutes les lignes, ou aucune. Exemple : 0-4 | Mon titre | Sous-titre | fondu")
    cues, warnings = [], []
    previous_end = 0
    for index, line in enumerate(lines):
        if timed:
            fields = line.split("|")
            if not 2 <= len(fields) <= 4:
                raise ValueError(f"Ligne {index + 1} : format attendu début-fin | texte | sous-titre facultatif | animation.")
            match = RANGE.fullmatch(fields[0])
            start, end = _time(match[1]), _time(match[2])
            title = fields[1].strip()
            subtitle = fields[2].strip() if len(fields) > 2 else ""
            animation_name = fields[3].strip().lower() if len(fields) > 3 else "montee"
            animation = ANIMATIONS.get(animation_name or "montee")
            if animation is None:
                raise ValueError(f"Ligne {index + 1} : animation inconnue. Choisir fondu, montee ou zoom.")
            if not (0 <= start < end <= seconds + 1e-8):
                raise ValueError(f"Ligne {index + 1} : les horaires doivent rester entre 0 et {seconds:g} secondes, début avant fin.")
            start_frame, end_frame = round(start * fps), round(end * fps)
        else:
            if "|" in line:
                raise ValueError(f"Ligne {index + 1} : ajoute une plage horaire avant les séparateurs |, par exemple 0-4 | Texte | Sous-titre | fondu.")
            title, subtitle, animation = line, "", "montee"
            start_frame = round(index * frame_count / len(lines))
            end_frame = round((index + 1) * frame_count / len(lines))
        if not title:
            raise ValueError(f"Ligne {index + 1} : le texte principal ne peut pas être vide.")
        if len(title) > 500 or len(subtitle) > 500:
            raise ValueError(f"Ligne {index + 1} : limite de 500 caractères par titre ou sous-titre ; répartis le texte sur plusieurs cartons.")
        if start_frame < previous_end:
            raise ValueError(f"Ligne {index + 1} : les cartons doivent être ordonnés et ne pas se chevaucher.")
        length = (end_frame - start_frame) / fps
        if length < 0.6:
            raise ValueError(f"Ligne {index + 1} : chaque carton doit durer au moins 0,6 seconde.")
        if start_frame > previous_end:
            warnings.append(f"Un espace sans texte est prévu de {previous_end / fps:g} à {start_frame / fps:g} s.")
        read_time = max(1.5, (len(title.split()) + len(subtitle.split())) / 3 + 0.7)
        if length < read_time:
            warnings.append(f"Carton {index + 1} : {length:g} s pour {len(title.split()) + len(subtitle.split())} mots ; environ {read_time:.1f} s conseillé pour la lecture.")
        fade_frames = max(2, min(round(0.65 * fps), (end_frame - start_frame - 1) // 3))
        cues.append({"id": f"cue_{index + 1:02d}", "title": title, "subtitle": subtitle,
                     "start": start_frame / fps, "end": end_frame / fps,
                     "start_frame": start_frame, "end_frame": end_frame,
                     "fade_frames": fade_frames, "animation": animation})
        previous_end = end_frame
    if previous_end < frame_count:
        warnings.append(f"La fin reste sans texte de {previous_end / fps:g} à {duration:g} s.")
    return {"schema_version": 1, "source_script": script, "mode": "timed" if timed else "distributed",
            "duration": duration, "fps": fps, "frame_count": frame_count, "width": WIDTH, "height": HEIGHT,
            "safe_area": {"left": SAFE_X, "right": WIDTH - SAFE_X, "top": 108, "bottom": 972},
            "cues": cues, "warnings": warnings, "text_rewritten": False,
            "rules": ["Un carton à la fois ; progression temporelle explicite.", "Marge de sécurité de 10 %.",
                      "Entrée et sortie amorties ; texte conservé et temps de lecture signalé.",
                      "Le mouvement accompagne la hiérarchie du titre et du sous-titre."]}


def _wrap(text: str, family: str, max_size: int, width: int, max_lines: int) -> tuple[list[str], int]:
    """Wrap only for layout; the canonical source remains unchanged in the plan."""
    if not text:
        return [], max_size
    for size in range(max_size, 21, -2):
        face = font(family, size)
        lines, current = [], ""
        # Keep whitespace in source. Layout may wrap at spaces but never changes words.
        for word in text.split(" "):
            candidate = current + (" " if current else "") + word
            if current and face.getlength(candidate) > width:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
        if len(lines) <= max_lines and all(face.getlength(line) <= width for line in lines):
            return lines, size
    raise ValueError("Un texte est trop long pour la zone sûre en Full HD. Répartis-le sur plusieurs cartons ou raccourcis un mot très long.")


def _text_layer(lines: list[str], family: str, size: int, color: tuple) -> Image.Image:
    face = font(family, size)
    leading = round(size * 1.2)
    width = max(1, math.ceil(max(face.getlength(line) for line in lines))) + 12
    boxes = [face.getbbox(line or " ") for line in lines]
    height = (len(lines) - 1) * leading + max(box[3] - box[1] for box in boxes) + 12
    result = Image.new("RGBA", (width, height))
    painter = ImageDraw.Draw(result)
    for i, (line, box) in enumerate(zip(lines, boxes)):
        painter.text(((width - face.getlength(line)) / 2, 6 + i * leading - box[1]), line, font=face, fill=color)
    return result


def _prepare(plan: dict, settings: dict) -> list[dict]:
    style = settings.get("style", "cinema")
    if style not in ("cinema", "clean", "bold", "neon", "lower"):
        raise ValueError("Style de motion design inconnu.")
    color = settings.get("color", "#dfba75")
    if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        raise ValueError("La couleur doit utiliser le format #RRGGBB.")
    rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    family = style if style in ("cinema", "bold") else "clean"
    plan["style"], plan["color"] = style, color
    prepared = []
    for cue in plan["cues"]:
        lines, size = _wrap(cue["title"], family, 136 if style == "cinema" else 124, WIDTH - 2 * SAFE_X - 20, 3)
        sublines, subsize = _wrap(cue["subtitle"], "clean", 40, WIDTH - 2 * SAFE_X - 20, 2)
        title = _text_layer(lines, family, size, (*rgb, 255))
        subtitle = _text_layer(sublines, "clean", subsize, (242, 240, 233, 255)) if sublines else None
        total = title.height + (52 + subtitle.height if subtitle else 0)
        # The lower-third style retains the same safe area and fits whole blocks.
        top = min(HEIGHT - 108 - total - 20, 790) if style == "lower" else (HEIGHT - total) // 2
        x = SAFE_X if style == "lower" else (WIDTH - title.width) // 2
        sx = SAFE_X if style == "lower" else ((WIDTH - subtitle.width) // 2 if subtitle else 0)
        sy = top + title.height + 52
        cue["layout"] = {"title_lines": lines, "subtitle_lines": sublines, "font_family": family,
                         "title_font_size": size, "subtitle_font_size": subsize,
                         "title_center": [x + title.width / 2, top + title.height / 2],
                         "subtitle_center": [sx + subtitle.width / 2, sy + subtitle.height / 2] if subtitle else None}
        if size < 52 or subsize < 28:
            plan["warnings"].append(f"Carton {len(prepared) + 1} : texte dense ; vérifier la lecture sur l’écran de diffusion.")
        # Cache a tight raster bounding box instead of re-rasterizing text per frame.
        left, right = min(x, sx) if subtitle else x, max(x + title.width, sx + subtitle.width) if subtitle else x + title.width
        block = Image.new("RGBA", (right - left, total))
        block.alpha_composite(title, (x - left, 0))
        if subtitle:
            block.alpha_composite(subtitle, (sx - left, title.height + 52))
        prepared.append({"cue": cue, "image": block, "left": left, "top": top})
    return prepared


def _frame(item: dict | None, frame_number: int) -> Image.Image:
    frame = Image.new("RGBA", (WIDTH, HEIGHT))
    if item is None:
        return frame
    cue, block = item["cue"], item["image"]
    inside = frame_number - cue["start_frame"]
    remaining = cue["end_frame"] - 1 - frame_number
    entry = ease(inside / cue["fade_frames"])
    exit_alpha = ease(remaining / cue["fade_frames"])
    alpha = entry * exit_alpha
    layer = block.copy()
    x, y = item["left"], item["top"]
    if cue["animation"] == "zoom":
        scale = 0.94 + 0.06 * entry
        size = (max(1, round(layer.width * scale)), max(1, round(layer.height * scale)))
        layer = layer.resize(size, Image.Resampling.LANCZOS)
        x += (block.width - layer.width) // 2
        y += (block.height - layer.height) // 2
    elif cue["animation"] == "montee":
        y += round(42 * (1 - entry))
    if alpha < 1:
        opacity = max(0, min(255, round(alpha * 255)))
        layer.putalpha(layer.getchannel("A").point([i * opacity // 255 for i in range(256)]))
    frame.alpha_composite(layer, (x, y))
    return frame


def _native_ae(plan: dict, title: str, path: Path) -> None:
    data = {"plan": plan, "name": title}
    source = '''#target aftereffects
(function(){var s=__DATA__, p=s.plan; app.beginUndoGroup("Revelation Motion Script");
try { if(!app.project)app.newProject(); var c=app.project.items.addComp("REVELATION - "+s.name,p.width,p.height,1,p.duration,p.fps);c.motionBlur=true;
function add(q,text,size,center,color,name){if(!text)return;var l=c.layers.addText(text);l.name=q.id+" - "+name;l.inPoint=q.start;l.outPoint=q.end;var prop=l.property("ADBE Text Properties").property("ADBE Text Document"),d=prop.value;d.font=q.layout.font_family==="cinema"&&name==="Titre"?"Baskerville":"ArialMT";if(q.layout.font_family==="bold"&&name==="Titre")d.font="Arial-BoldMT";d.fontSize=size;d.fillColor=color;d.applyFill=true;d.justification=ParagraphJustification.CENTER_JUSTIFY;d.autoLeading=false;d.leading=size*1.2;prop.setValue(d);var rect=l.sourceRectAtTime(q.start,false),tr=l.property("ADBE Transform Group");tr.property("ADBE Anchor Point").setValue([rect.left+rect.width/2,rect.top+rect.height/2]);var pos=tr.property("ADBE Position"),scale=tr.property("ADBE Scale"),opacity=tr.property("ADBE Opacity"),f=q.fade_frames/p.fps,end=q.end-1/p.fps;pos.setValue(center);opacity.setValueAtTime(q.start,0);opacity.setValueAtTime(q.start+f,100);opacity.setValueAtTime(end-f,100);opacity.setValueAtTime(end,0);if(q.animation==="montee"){pos.setValueAtTime(q.start,[center[0],center[1]+42]);pos.setValueAtTime(q.start+f,center);}if(q.animation==="zoom"){scale.setValueAtTime(q.start,[94,94,100]);scale.setValueAtTime(q.start+f,[100,100,100]);}var props=[opacity,pos,scale];for(var j=0;j<props.length;j++){var pr=props[j];for(var k=1;k<=pr.numKeys;k++){var dims=pr===scale?pr.value.length:1,ins=[],outs=[];for(var z=0;z<dims;z++){ins.push(new KeyframeEase(0,65));outs.push(new KeyframeEase(0,65));}pr.setTemporalEaseAtKey(k,ins,outs);}}l.motionBlur=true;l.comment="Texte source conservé dans MOTION_PLAN.json";}
var color=[parseInt(p.color.substr(1,2),16)/255,parseInt(p.color.substr(3,2),16)/255,parseInt(p.color.substr(5,2),16)/255];
for(var i=0;i<p.cues.length;i++){var q=p.cues[i];add(q,q.layout.title_lines.join("\\r"),q.layout.title_font_size,q.layout.title_center,color,"Titre");add(q,q.layout.subtitle_lines.join("\\r"),q.layout.subtitle_font_size,q.layout.subtitle_center,[.949,.941,.914],"Sous-titre");}c.time=p.cues[0].start+Math.min(1,(p.cues[0].end-p.cues[0].start)/2);c.openInViewer();
}finally{app.endUndoGroup();}})();
'''.replace("__DATA__", js(data))
    path.write_text(source, encoding="utf-8")


def _native_fusion(plan: dict, path: Path) -> None:
    """Editable multi-cue Fusion graph; alpha envelopes gate every cue exactly."""
    n = plan["frame_count"] - 1
    rgb = [int(plan["color"][i:i + 2], 16) / 255 for i in (1, 3, 5)]
    nodes = [f'''Transparent = Background {{ Inputs = {{ GlobalOut=Input{{Value={n}}}, Width=Input{{Value=1920}}, Height=Input{{Value=1080}}, UseFrameFormatSettings=Input{{Value=0}}, TopLeftAlpha=Input{{Value=0}} }} }}''']
    previous = "Transparent"
    for index, cue in enumerate(plan["cues"], 1):
        prefix = f"Carton{index:02d}"
        start, end, fade = cue["start_frame"], cue["end_frame"] - 1, cue["fade_frames"]
        keys = {0: 0, start: 0, start + fade: 1, end - fade: 1, end: 0, n: 0}
        # When the last endpoint coincides with an interior key, the zero wins.
        keys[start], keys[end] = 0, 0
        keytext = ",".join(f"[{t}]={{{v},Flags={{Linear=true}}}}" for t, v in sorted(keys.items()))
        nodes.append(f"{prefix}Fondu = BezierSpline {{ KeyFrames = {{ {keytext} }} }}")
        layout = cue["layout"]
        def text_node(name, content, size, center, color, family):
            # Fusion point positions use a bottom-left origin.
            x, y = center[0] / WIDTH, 1 - center[1] / HEIGHT
            return f'''{name} = TextPlus {{ Inputs = {{ GlobalOut=Input{{Value={n}}}, Width=Input{{Value=1920}}, Height=Input{{Value=1080}}, UseFrameFormatSettings=Input{{Value=0}}, StyledText=Input{{Value={js(content)}}}, Font=Input{{Value={js(family)}}}, Style=Input{{Value="Regular"}}, Size=Input{{Value={size / HEIGHT}}}, Center=Input{{Value={{{x},{y}}}}}, Red1=Input{{Value={color[0]}}}, Green1=Input{{Value={color[1]}}}, Blue1=Input{{Value={color[2]}}}, HorizontalJustificationNew=Input{{Value=3}}, VerticalJustificationNew=Input{{Value=3}} }} }}'''
        nodes.append(text_node(prefix + "Titre", "\n".join(layout["title_lines"]), layout["title_font_size"], layout["title_center"], rgb, "Baskerville" if layout["font_family"] == "cinema" else "Arial"))
        foreground = prefix + "Titre"
        if cue["subtitle"]:
            nodes.append(text_node(prefix + "SousTitre", "\n".join(layout["subtitle_lines"]), layout["subtitle_font_size"], layout["subtitle_center"], [.949, .941, .914], "Arial"))
            nodes.append(f'''{prefix}Textes = Merge {{ Inputs = {{ Background=Input{{SourceOp="{foreground}",Source="Output"}}, Foreground=Input{{SourceOp="{prefix}SousTitre",Source="Output"}} }} }}''')
            foreground = prefix + "Textes"
        # Animate through editable Fusion expressions, containing only generated numbers.
        ramp = f"(1-pow(1-min(1,max(0,(time-{start})/{fade})),3))"
        motion_inputs = ""
        if cue["animation"] == "montee":
            motion_inputs = f', Center=Input{{Value={{0.5,0.5}},Expression="Point(0.5,0.5-{42 / HEIGHT}*(1-{ramp}))"}}'
        elif cue["animation"] == "zoom":
            motion_inputs = f', Size=Input{{Value=1,Expression="0.94+0.06*{ramp}"}}'
        if motion_inputs:
            nodes.append(f'''{prefix}Mouvement = Transform {{ Inputs = {{ Input=Input{{SourceOp="{foreground}",Source="Output"}}{motion_inputs} }} }}''')
            foreground = prefix + "Mouvement"
        result = "Resultat" if index == len(plan["cues"]) else prefix + "Composite"
        nodes.append(f'''{result} = Merge {{ Inputs = {{ Background=Input{{SourceOp="{previous}",Source="Output"}}, Foreground=Input{{SourceOp="{foreground}",Source="Output"}}, Blend=Input{{SourceOp="{prefix}Fondu",Source="Value"}} }}, ViewInfo=OperatorInfo{{Pos={{{index * 150},220}}}} }}''')
        previous = result
    path.write_text("{ Tools = ordered() {\n" + ",\n".join(nodes) + "\n} }\n", encoding="utf-8")


def _validate_media(path: Path, plan: dict, alpha: bool = False) -> dict:
    command = [str(FFMPEG), "-hide_banner", "-v", "error", "-nostats", "-progress", "pipe:1", "-i", str(path), "-map", "0:v:0", "-f", "null", "-"]
    result = subprocess.run(command, capture_output=True, timeout=max(120, plan["duration"] * 8))
    if result.returncode:
        raise RuntimeError(f"Décodage de contrôle impossible : {path.name}\n{result.stderr.decode(errors='replace')[-1200:]}")
    pairs = dict(line.split("=", 1) for line in result.stdout.decode().splitlines() if "=" in line)
    frames = int(pairs.get("frame", 0))
    if frames != plan["frame_count"]:
        raise RuntimeError(f"Durée incorrecte : {path.name}, {frames} images au lieu de {plan['frame_count']}.")
    report = {"file": path.name, "decoded": True, "decoded_frames": frames, "duration": frames / plan["fps"], "bytes": path.stat().st_size}
    if alpha:
        cue = plan["cues"][0]
        sample_time = (cue["start"] + cue["end"]) / 2
        sample = subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-ss", str(sample_time), "-i", str(path), "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "-"], capture_output=True, timeout=60)
        if sample.returncode or len(sample.stdout) != WIDTH * HEIGHT * 4:
            raise RuntimeError("Impossible de vérifier le canal alpha du master.")
        extrema = Image.frombytes("RGBA", (WIDTH, HEIGHT), sample.stdout).getchannel("A").getextrema()
        if extrema[0] != 0 or extrema[1] < 240:
            raise RuntimeError("Le canal alpha du master ne contient pas les zones transparentes et opaques attendues.")
        report.update({"alpha_verified": True, "alpha_min": extrema[0], "alpha_max": extrema[1], "alpha_sample_time": sample_time})
    return report


def render(settings: dict, out: Path, progress=lambda value: None, image_source=None) -> dict:
    """Render a validated motion script with preview, alpha master and native files."""
    script = settings.get("motion_script", "")
    seconds, fps = settings.get("seconds", 30), settings.get("fps", 25)
    if not script.strip():
        title, subtitle = settings.get("title", "RÉVÉLATION"), settings.get("subtitle", "")
        if "|" in title + subtitle or "\n" in title + subtitle:
            raise ValueError("Renseigne le script pour les titres contenant plusieurs lignes ou un caractère |.")
        script = f"0-{seconds} | {title} | {subtitle} | montee"
    plan = parse_script(script, seconds, fps)
    cached = _prepare(plan, settings)
    if image_source is not None:
        with Image.open(image_source) as source:layer=source.convert('RGBA')
        layer.thumbnail((WIDTH-160,HEIGHT-100),Image.Resampling.LANCZOS)
        cached=[{'cue':plan['cues'][0],'image':layer,'left':(WIDTH-layer.width)//2,'top':(HEIGHT-layer.height)//2}]

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    progress(8)
    first = cached[0]
    poster = _frame(first, (first["cue"]["start_frame"] + first["cue"]["end_frame"]) // 2)
    poster.save(out / "apercu_transparent.png")
    matte = Image.new("RGBA", poster.size, (12, 17, 29, 255))
    matte.alpha_composite(poster)
    matte.convert("RGB").save(out / "apercu.jpg", quality=92)
    alpha_path, preview_path = out / "MOTION_TRANSPARENT.mov", out / "APERCU_MOTION.mp4"
    args = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(fps), "-i", "-",
            "-f", "lavfi", "-i", f"color=c=0x0c111d:s={WIDTH}x{HEIGHT}:r={fps}",
            "-filter_complex", "[0:v]split=2[alpha][fg];[1:v][fg]overlay=shortest=1:format=auto,format=yuv420p[preview]",
            "-map", "[alpha]", "-an", "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-threads", "4", str(alpha_path),
            "-map", "[preview]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-movflags", "+faststart", "-threads", "4", str(preview_path)]
    log_path = out / "RENDU_MOTION.log"
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stderr=log)
        current = 0
        try:
            for frame_number in range(plan["frame_count"]):
                while current < len(cached) and frame_number >= cached[current]["cue"]["end_frame"]:
                    current += 1
                item = cached[current] if current < len(cached) and frame_number >= cached[current]["cue"]["start_frame"] else None
                process.stdin.write(_frame(item, frame_number).tobytes())
                if frame_number % fps == 0:
                    progress(12 + round(70 * frame_number / plan["frame_count"]))
            process.stdin.close()
            code = process.wait(timeout=max(120, plan["duration"] * 4))
        except BaseException:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=10)
            raise
        if code:
            raise RuntimeError(log_path.read_text(encoding="utf-8")[-1800:])
    progress(84)
    validation = {"status": "verified", "method": "full_decode_and_frame_count_plus_alpha_sample",
                  "media": [_validate_media(preview_path, plan), _validate_media(alpha_path, plan, True)],
                  "native_projects": "generated_not_opened_in_host", "audio": "none"}
    plan["render_validation"] = validation
    if image_source is None:
        _native_ae(plan, settings.get("title", "Motion design"), out / "motion_after_effects.jsx")
    else:
        import shutil
        shutil.copy2(image_source,out/'TEXTE_PHOTOSHOP.png')
        source_code='#target aftereffects\n(function(){app.beginUndoGroup("Photoshop vers Motion");try{if(!app.project)app.newProject();var root=File($.fileName).parent;var f=new File(root.fsName+"/TEXTE_PHOTOSHOP.png"),item=app.project.importFile(new ImportOptions(f)),c=app.project.items.addComp("PHOTOSHOP_ANIME",1920,1080,1,'+str(plan['duration'])+','+str(plan['fps'])+');var l=c.layers.add(item),tr=l.property("ADBE Transform Group"),p=tr.property("ADBE Opacity");p.setValueAtTime(0,0);p.setValueAtTime(.8,100);p.setValueAtTime('+str(max(.9,plan['duration']-.8))+',100);p.setValueAtTime('+str(plan['duration']-1/plan['fps'])+',0);c.openInViewer();}finally{app.endUndoGroup();}})();'
        (out/'motion_after_effects.jsx').write_text(source_code,encoding='utf-8')

    if image_source is None:_native_fusion(plan, out / "motion_fusion.setting")
    (out / "MOTION_PLAN.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "RENDER_VALIDATION.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "SCRIPT_SOURCE.txt").write_text(script, encoding="utf-8")
    guide = f'''# Motion design — script et fichiers de montage

{WIDTH} × {HEIGHT}, {fps} images/seconde, {plan['duration']:g} secondes, {len(plan['cues'])} cartons. Aucun son n’a été ajouté.

- `APERCU_MOTION.mp4` : aperçu H.264 sur fond sombre, lisible dans un navigateur.
- `MOTION_TRANSPARENT.mov` : master ProRes 4444 avec alpha, à placer sur une piste supérieure dans Premiere ou Resolve ; interpréter l’alpha comme droit si nécessaire.
- `motion_after_effects.jsx` : After Effects > Fichier > Scripts > Exécuter un fichier de script. Crée une nouvelle composition et des calques de texte modifiables, sans effacer le projet ouvert.
- `motion_fusion.setting` : ouvrir une composition Fusion à {fps} i/s, sur {plan['frame_count']} images commençant à 0 ; glisser ce fichier dans le graphe, puis relier `Resultat` à MediaOut. TextPlus, courbes et mouvements restent modifiables.
- `MOTION_PLAN.json` et `SCRIPT_SOURCE.txt` : horaires, textes source inchangés, cadrage et consignes de lecture.
- `RENDER_VALIDATION.json` : résultat du décodage intégral, comptage des images et contrôle du canal alpha. Les sources natives doivent être contrôlées dans leur application ; les moteurs typographiques peuvent différer.

## Écrire un script

Une ligne par carton, automatiquement répartie sur la durée. Pour un minutage précis, utiliser sur toutes les lignes :

`0-4 | Le texte exact du titre | Le sous-titre facultatif | fondu`

Animations : `fondu`, `montee`, `zoom`. Les champs sont séparés par `|`. Les horaires acceptent les secondes décimales ou `minutes:secondes`. Les cartons ne se chevauchent pas. Une ligne est du texte à afficher ; les indications de réalisation sont des réglages du formulaire, pas du code à exécuter.

## Continuité graphique

La hiérarchie titre/sous-titre, les marges sûres de 10 % et les entrées amorties accompagnent la lecture. Une pause entre deux cartons est conservée si le script la demande. Contrôler la lisibilité dans le montage final, sur le format réel de diffusion. Les sous-titres ne sont pas une transcription audio.

## Remarques sur le rythme

'''
    guide += "\n".join("- " + warning for warning in plan["warnings"]) or "Aucune alerte de lecture détectée sur ce script."
    (out / "UTILISATION_MOTION.md").write_text(guide + "\n", encoding="utf-8")
    progress(98)
    return plan
