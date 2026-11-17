"""Resource curator for ElevenLabs, stock media, and AI generation prompts."""
import json, hashlib, uuid
from pathlib import Path

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

class ResourceCurator:
    def __init__(self, project_path):
        self.project_path = Path(project_path)
        self.resources_dir = self.project_path / "ressources_video"
        self.resources_dir.mkdir(parents=True, exist_ok=True)
        (self.resources_dir / "archives").mkdir(exist_ok=True)
        (self.resources_dir / "stock").mkdir(exist_ok=True)
        (self.resources_dir / "generer").mkdir(exist_ok=True)
        (self.resources_dir / "musique").mkdir(exist_ok=True)
        (self.resources_dir / "son").mkdir(exist_ok=True)
        (self.resources_dir / "graphismes").mkdir(exist_ok=True)
        (self.resources_dir / "scripts").mkdir(exist_ok=True)

    def generate_elevenlabs_script(self, text, style="spirituel"):
        """Formats text for ElevenLabs with pauses and tone indicators."""
        # Custom logic based on the spiritual/cinematic style
        lines = text.split('\n')
        formatted = []
        for line in lines:
            if not line.strip():
                formatted.append("")
                continue
            if style == "spirituel":
                # Add dramatic pauses and tone for spiritual style
                if "?" in line:
                    formatted.append(f"[questioning]\n{line}\n[pause]")
                elif "Kc." in line:
                    formatted.append(f"[calm, solemn]\n{line}\n[pause]")
                else:
                    formatted.append(line)
            else:
                formatted.append(line)
        
        script_path = self.resources_dir / "scripts" / "elevenlabs_script.txt"
        script_path.write_text("\n".join(formatted), encoding="utf-8")
        return str(script_path)

    def curate_stock_list(self, themes):
        """Generates a list of suggested stock resources with links."""
        suggestions = {
            "hospital": "https://www.pexels.com/search/hospital/",
            "dark_room": "https://www.pexels.com/search/a%20person%20standing%20on%20a%20room/",
            "old_man": "https://www.pexels.com/photo/man-in-staircase-darkness-18321578/",
            "bible": "https://unsplash.com/photos/mkxjde3Cfnc",
            "ambient_music": "https://pixabay.com/music/search/dark%20ambient/"
        }
        
        result = []
        for theme in themes:
            if theme in suggestions:
                result.append({"theme": theme, "url": suggestions[theme]})
        
        list_path = self.resources_dir / "stock" / "suggestions.json"
        list_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        return result

    def create_ai_prompts(self, scenes):
        """Creates detailed prompts for AI video/image generation."""
        prompts = []
        for scene in scenes:
            prompt = f"Cinematic {scene.get('style', 'documentary')} shot, {scene.get('description', '')}. Dark moody lighting, blue accents, 4k."
            prompts.append({"id": scene.get('id', uuid.uuid4().hex[:6]), "prompt": prompt})
        
        prompt_path = self.resources_dir / "generer" / "ai_prompts.json"
        prompt_path.write_text(json.dumps(prompts, indent=2), encoding="utf-8")
        return prompts

def init_curator(project_id):
    from .config import DATA
    return ResourceCurator(DATA / "projects" / project_id)
