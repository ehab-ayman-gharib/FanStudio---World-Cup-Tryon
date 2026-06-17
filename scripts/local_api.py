import os
import io
import time
import json
import random
import base64
import requests
import uuid
from io import BytesIO
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

# Global job status store
jobs_cache = {}

# Initialize FastAPI app
app = FastAPI(title="FanStudio local API", description="Local API for World Cup 2026 FanStudio (connecting to local ComfyUI)")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants & Paths
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLUX_WORKFLOW_PATH = os.path.join(ROOT_DIR, "ComfyUI_Workflows", "flux-studio-app-World-Cup.json")
SHARP_WORKFLOW_PATH = os.path.join(ROOT_DIR, "ComfyUI_Workflows", "sharp_basic.json")
GARMENTS_DIR = os.path.join(ROOT_DIR, "public", "garments")

COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")



# Curated country schemes for stunning premium gradients and theme configurations
TEAM_THEMES = {
    "Argentina": {"colors": ["#74ACDF", "#FFFFFF", "#1E3A8A"], "group": "Group A"},
    "Egypt": {"colors": ["#CE1126", "#FFFFFF", "#000000"], "group": "Group A"},
    "Brazil": {"colors": ["#FFDF00", "#009B3A", "#002776"], "group": "Group B"},
    "Mexico": {"colors": ["#006847", "#FFFFFF", "#CE1126"], "group": "Group B"},
    "USA": {"colors": ["#0A3161", "#FFFFFF", "#B22234"], "group": "Group C"},
    "Germany": {"colors": ["#000000", "#DD0000", "#FFCC00"], "group": "Group C"},
    "France": {"colors": ["#002395", "#FFFFFF", "#ED2939"], "group": "Group D"},
    "England": {"colors": ["#FFFFFF", "#CF142B", "#0B162A"], "group": "Group D"},
    "Spain": {"colors": ["#C60B1E", "#FFC72C", "#8B0000"], "group": "Group E"},
    "Portugal": {"colors": ["#046A38", "#DA291C", "#FFCD00"], "group": "Group E"},
    "Morocco": {"colors": ["#C1272D", "#006233", "#111111"], "group": "Group F"},
    "Japan": {"colors": ["#0005A0", "#FFFFFF", "#BC002D"], "group": "Group F"},
    "Netherlands": {"colors": ["#21468B", "#FFFFFF", "#AE1C28"], "group": "Group G"},
    "Uruguay": {"colors": ["#0081C9", "#FFFFFF", "#FCD116"], "group": "Group G"},
    "Nigeria": {"colors": ["#008751", "#FFFFFF", "#004720"], "group": "Group H"},
    "Senegal": {"colors": ["#00853F", "#FDEF42", "#E31B23"], "group": "Group H"}
}

# Request/Response schemas
class Generate2DRequest(BaseModel):
    user_image: str  # Base64 string of selfie
    kit_image: str   # Base64 string of kit reference
    prompt_override: str | None = None
    num_variations: int = 1

class Generate3DRequest(BaseModel):
    image: str  # Base64 string of the selected 2D image

def test_comfyui_connection():
    try:
        resp = requests.get(f"{COMFYUI_URL}/history", timeout=2)
        return resp.status_code == 200
    except Exception:
        return False

def upload_image_to_comfy(img_bytes: bytes, filename: str) -> str:
    """Uploads binary image to ComfyUI input folder."""
    files = {"image": (filename, img_bytes)}
    data = {"overwrite": "true"}
    resp = requests.post(f"{COMFYUI_URL}/upload/image", files=files, data=data)
    resp.raise_for_status()
    return resp.json()["name"]

def wait_for_prompt_completion(prompt_id: str, timeout: int = 300) -> dict:
    """Polls history until the prompt is done."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        resp = requests.get(f"{COMFYUI_URL}/history/{prompt_id}")
        resp.raise_for_status()
        history = resp.json()
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(0.5)
    raise TimeoutError("ComfyUI prompt execution timed out")

def download_comfy_file(filename: str, type: str = "output") -> bytes:
    """Downloads a file from ComfyUI."""
    params = {"filename": filename, "type": type}
    resp = requests.get(f"{COMFYUI_URL}/view", params=params)
    resp.raise_for_status()
    return resp.content


def get_kit_reference_filename(team_name: str) -> str:
    """Finds the garment preview image path from the public/garments folder."""
    if not os.path.exists(GARMENTS_DIR):
        raise FileNotFoundError(f"Garments directory not found at: {GARMENTS_DIR}")
    
    # Clean up name to compare
    clean_team = team_name.lower().replace(" ", "").replace("-", "")
    
    for filename in os.listdir(GARMENTS_DIR):
        base, _ = os.path.splitext(filename)
        clean_base = base.lower().replace(" ", "").replace("-", "")
        if clean_base == clean_team or clean_base.startswith(clean_team) or clean_team.startswith(clean_base):
            return filename
            
    # Default fallback to first file in directory or raise error
    files = [f for f in os.listdir(GARMENTS_DIR) if os.path.isfile(os.path.join(GARMENTS_DIR, f))]
    if files:
        return files[0]
    raise FileNotFoundError(f"No garment preview image found in: {GARMENTS_DIR}")

@app.get("/api/health")
def health():
    comfy_alive = test_comfyui_connection()
    return {
        "status": "healthy" if comfy_alive else "degraded",
        "mode": "local",
        "comfyui_url": COMFYUI_URL,
        "comfyui_connected": comfy_alive
    }


def free_comfyui_memory():
    """Tells ComfyUI to unload unused models and free up GPU memory."""
    try:
        requests.post(f"{COMFYUI_URL}/free", json={"unload_models": True, "free_memory": True}, timeout=3)
        print("🧹 Cleared ComfyUI VRAM and cache.")
    except Exception as e:
        print(f"⚠️ Could not clear ComfyUI memory: {e}")


def run_generate_2d_task(job_id: str, req: Generate2DRequest):
    try:
        # Free VRAM from previous runs (e.g. SHARP) before starting FLUX
        free_comfyui_memory()
        # 1. Decode kit reference image
        kit_img_data = req.kit_image
        if "," in kit_img_data:
            kit_img_data = kit_img_data.split(",")[1]
        kit_bytes = base64.b64decode(kit_img_data)
        
        # 2. Decode user selfie
        user_img_data = req.user_image
        if "," in user_img_data:
            user_img_data = user_img_data.split(",")[1]
        user_img_bytes = base64.b64decode(user_img_data)

        # 3. Upload images to ComfyUI
        timestamp = int(time.time())
        user_comfy_filename = f"user_selfie_{timestamp}.png"
        kit_comfy_filename = f"kit_ref_{timestamp}.png"
        
        upload_image_to_comfy(user_img_bytes, user_comfy_filename)
        upload_image_to_comfy(kit_bytes, kit_comfy_filename)

        # 4. Load FLUX workflow JSON
        if not os.path.exists(FLUX_WORKFLOW_PATH):
            raise Exception(f"FLUX workflow file not found at: {FLUX_WORKFLOW_PATH}")
            
        with open(FLUX_WORKFLOW_PATH, "r") as f:
            workflow = json.load(f)

        # 5. Inject parameters & run requests in parallel or sequence
        prompt_ids = []
        for i in range(req.num_variations):
            run_workflow_data = json.loads(json.dumps(workflow))
            if "76" in run_workflow_data:
                run_workflow_data["76"]["inputs"]["image"] = user_comfy_filename
            if "360" in run_workflow_data:
                run_workflow_data["360"]["inputs"]["image"] = kit_comfy_filename
            if "75:73" in run_workflow_data:
                run_workflow_data["75:73"]["inputs"]["noise_seed"] = random.randint(1, 10**15)
            if "75:74" in run_workflow_data and req.prompt_override and req.prompt_override.strip():
                run_workflow_data["75:74"]["inputs"]["text"] = req.prompt_override

            p_id = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": run_workflow_data}).json()["prompt_id"]
            prompt_ids.append(p_id)

        # 6. Poll history and retrieve outputs
        generated_images_base64 = []
        for i, p_id in enumerate(prompt_ids):
            history_data = wait_for_prompt_completion(p_id)
            outputs = history_data.get("outputs", {})
            save_node = "9"
            if save_node not in outputs and "368" in outputs:
                save_node = "368"
                
            if save_node in outputs and "images" in outputs[save_node]:
                filename = outputs[save_node]["images"][0]["filename"]
                subfolder = outputs[save_node]["images"][0].get("subfolder", "")
                img_type = outputs[save_node]["images"][0].get("type", "output")
                
                img_bytes = download_comfy_file(filename, img_type)
                img_base64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
                generated_images_base64.append(img_base64)
            else:
                raise Exception("SaveImage node output not found in history.")

        jobs_cache[job_id] = {
            "status": "completed",
            "result": {"images": generated_images_base64}
        }
    except Exception as e:
        print(f"Error in generate-2d job {job_id}: {str(e)}")
        jobs_cache[job_id] = {
            "status": "failed",
            "error": str(e)
        }

@app.post("/api/generate-2d")
async def generate_2d(req: Generate2DRequest, background_tasks: BackgroundTasks):
    """Executes the FLUX + SAM3 workflow in ComfyUI asynchronously."""
    if not test_comfyui_connection():
        raise HTTPException(status_code=503, detail=f"ComfyUI server at {COMFYUI_URL} is unreachable.")
    
    job_id = str(uuid.uuid4())
    jobs_cache[job_id] = {"status": "pending"}
    background_tasks.add_task(run_generate_2d_task, job_id, req)
    return {"status": "pending", "job_id": job_id}


def run_generate_3d_task(job_id: str, req: Generate3DRequest):
    try:
        # Free VRAM from previous runs (e.g. FLUX) before starting SHARP
        free_comfyui_memory()
        # 1. Decode target image
        img_data = req.image
        if "," in img_data:
            img_data = img_data.split(",")[1]
        img_bytes = base64.b64decode(img_data)

        # 2. Upload to ComfyUI
        timestamp = int(time.time())
        img_filename = f"sharp_input_{timestamp}.png"
        upload_image_to_comfy(img_bytes, img_filename)

        # 3. Load SHARP workflow
        if not os.path.exists(SHARP_WORKFLOW_PATH):
            raise Exception(f"SHARP workflow file not found at: {SHARP_WORKFLOW_PATH}")
            
        with open(SHARP_WORKFLOW_PATH, "r") as f:
            workflow = json.load(f)

        # 4. Inject target image into node "1"
        if "1" in workflow:
            workflow["1"]["inputs"]["image"] = img_filename

        # 5. Run prompt
        p_id = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow}).json()["prompt_id"]

        # 6. Wait and download PLY file
        print(f"Waiting for SHARP completion (ID: {p_id})...")
        history_data = wait_for_prompt_completion(p_id)
        outputs = history_data.get("outputs", {})
        
        ply_filename = None
        for node_id, node_output in outputs.items():
            if "gussians" in node_output:
                ply_filename = node_output["gussians"][0]["filename"]
                break
            if "ply" in node_output:
                ply_filename = node_output["ply"][0]["filename"]
                break
            if "images" in node_output:
                for img in node_output["images"]:
                    if img["filename"].endswith(".ply"):
                        ply_filename = img["filename"]
                        break
        
        if not ply_filename:
            if "5" in outputs and "ply" in outputs["5"]:
                ply_filename = outputs["5"]["ply"][0]["filename"]
            elif "4" in outputs and "ply" in outputs["4"]:
                ply_filename = outputs["4"]["ply"][0]["filename"]
        
        if not ply_filename:
            history_str = json.dumps(history_data)
            import re
            ply_matches = re.findall(r'"([^"\s]+\.ply)"', history_str)
            if ply_matches:
                ply_filename = ply_matches[0]
                
        if not ply_filename:
            raise Exception("3D Gaussian Splat PLY filename not found in ComfyUI execution history.")

        # Download PLY from ComfyUI and save locally
        ply_bytes = download_comfy_file(ply_filename, "output")
        
        ply_cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".splat_cache")
        os.makedirs(ply_cache_dir, exist_ok=True)
        ply_path = os.path.join(ply_cache_dir, ply_filename)
        with open(ply_path, "wb") as pf:
            pf.write(ply_bytes)
        
        ply_url = f"/api/download-3d/{ply_filename}"
        
        jobs_cache[job_id] = {
            "status": "completed",
            "result": {
                "plyUrl": ply_url,
                "filename": ply_filename
            }
        }
    except Exception as e:
        print(f"Error in generate-3d job {job_id}: {str(e)}")
        jobs_cache[job_id] = {
            "status": "failed",
            "error": str(e)
        }

@app.post("/api/generate-3d")
async def generate_3d(req: Generate3DRequest, background_tasks: BackgroundTasks):
    """Executes the Apple SHARP 3DGS workflow in ComfyUI asynchronously."""
    if not test_comfyui_connection():
        raise HTTPException(status_code=503, detail=f"ComfyUI server at {COMFYUI_URL} is unreachable.")
    
    job_id = str(uuid.uuid4())
    jobs_cache[job_id] = {"status": "pending"}
    background_tasks.add_task(run_generate_3d_task, job_id, req)
    return {"status": "pending", "job_id": job_id}

@app.get("/api/job-status/{job_id}")
async def job_status(job_id: str):
    """Retrieves status and results of a running/completed background job."""
    if job_id not in jobs_cache:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_cache[job_id]

@app.get("/api/pre-warm")
def pre_warm():
    """Dummy endpoint matching Modal API pre-warming on page mount."""
    return {"status": "ready"}

@app.get("/api/download-3d/{filename}")
def download_3d(filename: str):
    """Serves the model file (.ply) from the local cache."""
    try:
        splat_cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".splat_cache")
        file_path = os.path.join(splat_cache_dir, filename)
        
        # 1. If file exists in local cache, serve it directly
        if os.path.exists(file_path):
            with open(file_path, "rb") as f:
                file_bytes = f.read()
            return Response(
                content=file_bytes,
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f"inline; filename={filename}",
                    "Cache-Control": "public, max-age=3600"
                }
            )
            
        # 2. Fallback: try to fetch from ComfyUI
        file_bytes = download_comfy_file(filename, "output")
        return Response(
            content=file_bytes,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"inline; filename={filename}"}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=404, detail=f"3D Model file not found: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("Starting FanStudio local backend on port 5000...")
    uvicorn.run(app, host="0.0.0.0", port=5000)
