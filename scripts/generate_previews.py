import os
import re
import json
import time
import random
import requests
from urllib.parse import urljoin

# Config
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
WORKFLOW_PATH = "ComfyUI_Workflows/Garment-WorldCup-Logo.json"
KITS_DIR = "../Kits References"

LOGOS_DIR = "public/logos"
GARMENTS_DIR = "public/garments"

os.makedirs(GARMENTS_DIR, exist_ok=True)

def test_comfy_connection():
    try:
        resp = requests.get(f"{COMFYUI_URL}/history", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False

def upload_to_comfy(file_path, filename):
    print(f"  Uploading {filename} to ComfyUI...")
    with open(file_path, "rb") as f:
        files = {"image": (filename, f.read())}
        data = {"overwrite": "true"}
        resp = requests.post(f"{COMFYUI_URL}/upload/image", files=files, data=data)
        resp.raise_for_status()
        return resp.json()["name"]

def wait_for_completion(prompt_id, timeout=300):
    start_time = time.time()
    while time.time() - start_time < timeout:
        resp = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")
        resp.raise_for_status()
        history = resp.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(1)
    raise TimeoutError("ComfyUI prompt execution timed out")

def download_comfy_file(filename, file_type="output"):
    params = {"filename": filename, "type": file_type}
    resp = requests.get(f"{COMFYUI_URL}/view", params=params)
    resp.raise_for_status()
    return resp.content

def load_teams():
    teams = []
    teams_ts_path = "src/constants/teams.ts"
    
    if not os.path.exists(teams_ts_path):
        print(f"Error: '{teams_ts_path}' not found.")
        return teams
        
    with open(teams_ts_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Regex parser for typescript TEAMS array items
    matches = re.findall(
        r'\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*filename:\s*"([^"]+)"',
        content
    )
    
    for team_id, name, filename in matches:
        teams.append({
            "id": team_id,
            "name": name,
            "filename": filename
        })
        
    return teams

def generate_previews():
    if not test_comfy_connection():
        print(f"Error: ComfyUI server at {COMFYUI_URL} is unreachable.")
        print("Please verify that ComfyUI is running locally before executing this script.")
        return
        
    if not os.path.exists(WORKFLOW_PATH):
        print(f"Error: Workflow template '{WORKFLOW_PATH}' does not exist.")
        return
        
    with open(WORKFLOW_PATH, "r") as f:
        workflow_template = json.load(f)
        
    teams = load_teams()
    print(f"Loaded {len(teams)} teams from teams.ts.")
    
    for idx, team in enumerate(teams, 1):
        team_id = team["id"]
        team_name = team["name"]
        kit_filename = team["filename"]
        
        # Output paths (web app checks for .webp first, then .png, .jpg)
        output_webp = os.path.join(GARMENTS_DIR, f"{team_id}.webp")
        output_jpg = os.path.join(GARMENTS_DIR, f"{team_id}.jpg")
        
        # Resume check: skip if preview already exists
        if os.path.exists(output_webp) or os.path.exists(output_jpg):
            print(f"[{idx}/{len(teams)}] Skipping {team_name} (preview already exists).")
            continue
            
        print(f"\n[{idx}/{len(teams)}] Processing preview for {team_name}...")
        
        # 1. Resolve kit image
        kit_path = os.path.join(KITS_DIR, kit_filename)
        if not os.path.exists(kit_path):
            # Try matching case-insensitively, or matching base name ignoring extension
            found = False
            for f in os.listdir(KITS_DIR):
                if f.lower() == kit_filename.lower():
                    kit_path = os.path.join(KITS_DIR, f)
                    found = True
                    break
            
            if not found:
                kit_base = os.path.splitext(kit_filename)[0].lower()
                for f in os.listdir(KITS_DIR):
                    f_base, _ = os.path.splitext(f)
                    if f_base.lower() == kit_base:
                        kit_path = os.path.join(KITS_DIR, f)
                        found = True
                        break
                        
            if not found:
                print(f"  Warning: Reference kit '{kit_filename}' not found for {team_name} in {KITS_DIR}. Skipping.")
                continue

                
        # 2. Resolve logo image (looks for {team_id}.jpg, png, jpeg, etc.)
        logo_path = None
        for ext in ['.jpg', '.jpeg', '.png', '.webp']:
            test_path = os.path.join(LOGOS_DIR, f"{team_id}{ext}")
            if os.path.exists(test_path):
                logo_path = test_path
                break
                
        if not logo_path:
            # Try capitalized fallback (e.g. Qatar.png)
            capitalized = team_id.capitalize()
            for ext in ['.jpg', '.jpeg', '.png', '.webp']:
                test_path = os.path.join(LOGOS_DIR, f"{capitalized}{ext}")
                if os.path.exists(test_path):
                    logo_path = test_path
                    break
                    
        if not logo_path:
            print(f"  Warning: Logo image for team '{team_id}' not found in {LOGOS_DIR}. Skipping.")
            continue
            
        try:
            # 3. Upload inputs to ComfyUI
            timestamp = int(time.time())
            comfy_kit_name = f"preview_kit_{team_id}_{timestamp}{os.path.splitext(kit_path)[1]}"
            comfy_logo_name = f"preview_logo_{team_id}_{timestamp}{os.path.splitext(logo_path)[1]}"
            
            upload_to_comfy(kit_path, comfy_kit_name)
            upload_to_comfy(logo_path, comfy_logo_name)
            
            # 4. Modify workflow parameters
            workflow = json.loads(json.dumps(workflow_template))
            
            # Node "360" (Kit reference load image)
            if "360" in workflow:
                workflow["360"]["inputs"]["image"] = comfy_kit_name
            else:
                raise KeyError("Could not find LoadImage Node '360' for kit reference in workflow.")
                
            # Node "374" (Logo load image)
            if "374" in workflow:
                workflow["374"]["inputs"]["image"] = comfy_logo_name
            else:
                raise KeyError("Could not find LoadImage Node '374' for logo in workflow.")
                
            # Node "75:73" (RandomNoise)
            if "75:73" in workflow:
                workflow["75:73"]["inputs"]["noise_seed"] = random.randint(1, 10**15)
                
            # 5. Queue Prompt
            print(f"  Submitting prompt to ComfyUI...")
            resp = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow})
            resp.raise_for_status()
            prompt_id = resp.json()["prompt_id"]
            
            # 6. Poll history and download output
            print(f"  Waiting for output generation (ID: {prompt_id})...")
            history_data = wait_for_completion(prompt_id)
            outputs = history_data.get("outputs", {})
            
            # SaveImage node is node "9"
            save_node = "9"
            if save_node in outputs and "images" in outputs[save_node]:
                out_filename = outputs[save_node]["images"][0]["filename"]
                out_type = outputs[save_node]["images"][0].get("type", "output")
                
                # Fetch image bytes
                img_bytes = download_comfy_file(out_filename, out_type)
                
                # Save preview to public/garments
                with open(output_webp, "wb") as out_f:
                    out_f.write(img_bytes)
                print(f"  Successfully saved generated garment preview to {output_webp}")
            else:
                print("  Error: Could not locate SaveImage node '9' outputs in ComfyUI history.")
                
        except Exception as e:
            print(f"  Exception occurred during execution for {team_name}: {e}")
            
    print("\nGarment Preview Generation Completed!")

if __name__ == "__main__":
    generate_previews()
