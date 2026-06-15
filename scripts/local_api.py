import os
import io
import time
import json
import random
import base64
import requests
from io import BytesIO
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

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
    image: str  # Base64 string of selfie
    team: str   # Selected country name
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

def ply_to_splat(input_bytes: bytes) -> bytes:
    """
    Converts a 3DGS PLY file to the compact .splat binary format that Three.js/drei can parse.
    
    .splat format per point (32 bytes):
      - position: 3 × float32 (12 bytes)
      - scale:    3 × float32 (12 bytes) 
      - color:    4 × uint8   (4 bytes)  — RGBA
      - rotation: 4 × uint8   (4 bytes)  — quaternion normalized to 0-255
    """
    try:
        import numpy as np
        
        # Parse PLY header to extract properties and vertex count
        header_end = b"end_header\n"
        header_end_idx = input_bytes.find(header_end)
        if header_end_idx == -1:
            header_end = b"end_header\r\n"
            header_end_idx = input_bytes.find(header_end)
            
        if header_end_idx == -1:
            raise ValueError("No end_header found in PLY")
            
        header_bytes = input_bytes[:header_end_idx]
        binary_bytes = input_bytes[header_end_idx + len(header_end):]
        
        header_text = header_bytes.decode('ascii', errors='ignore')
        
        num_vertices = 0
        properties = []
        
        for line in header_text.splitlines():
            line = line.strip()
            if line.startswith("element vertex"):
                num_vertices = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                if len(parts) >= 3:
                    prop_type = parts[1]
                    prop_name = parts[2]
                    
                    # Map to numpy data types
                    if prop_type in ("float", "float32"):
                        np_type = "f4"
                    elif prop_type in ("double", "float64"):
                        np_type = "f8"
                    elif prop_type in ("char", "int8"):
                        np_type = "i1"
                    elif prop_type in ("uchar", "uint8"):
                        np_type = "u1"
                    elif prop_type in ("short", "int16"):
                        np_type = "i2"
                    elif prop_type in ("ushort", "uint16"):
                        np_type = "u2"
                    elif prop_type in ("int", "int32"):
                        np_type = "i4"
                    elif prop_type in ("uint", "uint32"):
                        np_type = "u4"
                    else:
                        np_type = "f4"
                    properties.append((prop_name, np_type))
                    
        # Parse binary elements using numpy structured array (extremely fast!)
        ply_dtype = np.dtype(properties)
        expected_size = num_vertices * ply_dtype.itemsize
        data_bytes = binary_bytes[:expected_size]
        
        vertex = np.frombuffer(data_bytes, dtype=ply_dtype)
        total_vertex_count = len(vertex)
        
        # Extract positions
        x = np.array(vertex['x'], dtype=np.float32)
        y = np.array(vertex['y'], dtype=np.float32)
        z = np.array(vertex['z'], dtype=np.float32)
        
        # Extract opacity (stored as logit in 3DGS PLY)
        opacity_raw = np.array(vertex['opacity'], dtype=np.float32)
        opacity = 1.0 / (1.0 + np.exp(-opacity_raw))  # sigmoid
        
        # Filter low-opacity points to reduce size
        mask = opacity >= 0.05
        x, y, z, opacity_raw, opacity = x[mask], y[mask], z[mask], opacity_raw[mask], opacity[mask]
        
        n_points = len(x)
        print(f"⚡ Converting PLY to .splat: {n_points} points (filtered from {total_vertex_count})")
        
        # Extract scale (stored as log-scale in 3DGS PLY)
        scale_0 = np.array(vertex['scale_0'], dtype=np.float32)[mask]
        scale_1 = np.array(vertex['scale_1'], dtype=np.float32)[mask]
        scale_2 = np.array(vertex['scale_2'], dtype=np.float32)[mask]
        sx = np.exp(scale_0)
        sy = np.exp(scale_1)
        sz = np.exp(scale_2)
        
        # Extract rotation quaternion
        rot_0 = np.array(vertex['rot_0'], dtype=np.float32)[mask]
        rot_1 = np.array(vertex['rot_1'], dtype=np.float32)[mask]
        rot_2 = np.array(vertex['rot_2'], dtype=np.float32)[mask]
        rot_3 = np.array(vertex['rot_3'], dtype=np.float32)[mask]
        # Normalize quaternion
        qlen = np.sqrt(rot_0**2 + rot_1**2 + rot_2**2 + rot_3**2)
        qlen = np.maximum(qlen, 1e-10)
        rot_0 /= qlen
        rot_1 /= qlen
        rot_2 /= qlen
        rot_3 /= qlen
        
        # Extract color from spherical harmonics DC component
        SH_C0 = 0.28209479177387814
        f_dc_0 = np.array(vertex['f_dc_0'], dtype=np.float32)[mask]
        f_dc_1 = np.array(vertex['f_dc_1'], dtype=np.float32)[mask]
        f_dc_2 = np.array(vertex['f_dc_2'], dtype=np.float32)[mask]
        r = np.clip((0.5 + SH_C0 * f_dc_0) * 255, 0, 255).astype(np.uint8)
        g = np.clip((0.5 + SH_C0 * f_dc_1) * 255, 0, 255).astype(np.uint8)
        b = np.clip((0.5 + SH_C0 * f_dc_2) * 255, 0, 255).astype(np.uint8)
        a = np.clip(opacity * 255, 0, 255).astype(np.uint8)
        
        # Encode quaternion to uint8 (map [-1, 1] to [0, 255])
        rot_0_u8 = np.clip(((rot_0 + 1.0) * 0.5) * 255, 0, 255).astype(np.uint8)
        rot_1_u8 = np.clip(((rot_1 + 1.0) * 0.5) * 255, 0, 255).astype(np.uint8)
        rot_2_u8 = np.clip(((rot_2 + 1.0) * 0.5) * 255, 0, 255).astype(np.uint8)
        rot_3_u8 = np.clip(((rot_3 + 1.0) * 0.5) * 255, 0, 255).astype(np.uint8)
        
        # Sort by scale (largest first) for better rendering
        sizes = sx * sy * sz
        sort_idx = np.argsort(-sizes)
        
        # Apply sort order to all arrays
        x, y, z = x[sort_idx], y[sort_idx], z[sort_idx]
        sx, sy, sz = sx[sort_idx], sy[sort_idx], sz[sort_idx]
        r, g, b, a = r[sort_idx], g[sort_idx], b[sort_idx], a[sort_idx]
        rot_0_u8, rot_1_u8 = rot_0_u8[sort_idx], rot_1_u8[sort_idx]
        rot_2_u8, rot_3_u8 = rot_2_u8[sort_idx], rot_3_u8[sort_idx]
        
        # Build binary .splat buffer vectorized (32 bytes per point)
        # Layout: [pos_x, pos_y, pos_z, scale_x, scale_y, scale_z] as float32 (24 bytes)
        #         [r, g, b, a, rot0, rot1, rot2, rot3] as uint8 (8 bytes)
        splat_dtype = np.dtype([
            ('px', '<f4'), ('py', '<f4'), ('pz', '<f4'),
            ('sx', '<f4'), ('sy', '<f4'), ('sz', '<f4'),
            ('r', 'u1'), ('g', 'u1'), ('b', 'u1'), ('a', 'u1'),
            ('q0', 'u1'), ('q1', 'u1'), ('q2', 'u1'), ('q3', 'u1'),
        ])
        splat_arr = np.empty(n_points, dtype=splat_dtype)
        splat_arr['px'] = x; splat_arr['py'] = y; splat_arr['pz'] = z
        splat_arr['sx'] = sx; splat_arr['sy'] = sy; splat_arr['sz'] = sz
        splat_arr['r'] = r; splat_arr['g'] = g; splat_arr['b'] = b; splat_arr['a'] = a
        splat_arr['q0'] = rot_0_u8; splat_arr['q1'] = rot_1_u8
        splat_arr['q2'] = rot_2_u8; splat_arr['q3'] = rot_3_u8
        
        splat_bytes = splat_arr.tobytes()
        print(f"✅ Converted to .splat: {len(input_bytes)/1024/1024:.1f}MB PLY → {len(splat_bytes)/1024/1024:.1f}MB .splat ({n_points} points)")
        return splat_bytes
    except Exception as e:
        print(f"⚠️ PLY-to-splat conversion failed: {e}")
        return input_bytes

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


@app.post("/api/generate-2d")
async def generate_2d(req: Generate2DRequest):
    """Executes the FLUX + SAM3 workflow in ComfyUI."""
    if not test_comfyui_connection():
        raise HTTPException(status_code=503, detail=f"ComfyUI server at {COMFYUI_URL} is unreachable.")
    
    # 1. Validate kit reference image
    try:
        kit_filename = get_kit_reference_filename(req.team)
        kit_path = os.path.join(GARMENTS_DIR, kit_filename)
        with open(kit_path, "rb") as f:
            kit_bytes = f.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load kit reference for {req.team}: {str(e)}")
    
    # 2. Decode user selfie
    try:
        user_img_data = req.image
        if "," in user_img_data:
            user_img_data = user_img_data.split(",")[1]
        user_img_bytes = base64.b64decode(user_img_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid user image base64 data: {str(e)}")

    # 3. Upload images to ComfyUI
    timestamp = int(time.time())
    user_comfy_filename = f"user_selfie_{timestamp}.png"
    kit_comfy_filename = f"kit_ref_{req.team.lower()}_{timestamp}.png"
    
    try:
        upload_image_to_comfy(user_img_bytes, user_comfy_filename)
        upload_image_to_comfy(kit_bytes, kit_comfy_filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload images to ComfyUI: {str(e)}")

    # 4. Load FLUX workflow JSON
    if not os.path.exists(FLUX_WORKFLOW_PATH):
        raise HTTPException(status_code=500, detail=f"FLUX workflow file not found at: {FLUX_WORKFLOW_PATH}")
        
    with open(FLUX_WORKFLOW_PATH, "r") as f:
        workflow = json.load(f)

    # 5. Inject parameters & run requests in parallel or sequence
    # Since we need `num_variations` (default 4), let's run them.
    # To run them, we queue requests with different seeds.
    # We can execute them sequentially and collect the prompt_ids.
    prompt_ids = []
    
    for i in range(req.num_variations):
        # Create a deep copy of the workflow to avoid mutations across variations
        run_workflow_data = json.loads(json.dumps(workflow))
        
        # Inject inputs into nodes
        # Node "76" (LoadImage for user selfie)
        if "76" in run_workflow_data:
            run_workflow_data["76"]["inputs"]["image"] = user_comfy_filename
            
        # Node "360" (LoadImage for kit reference image)
        if "360" in run_workflow_data:
            run_workflow_data["360"]["inputs"]["image"] = kit_comfy_filename
            
        # Node "75:73" (RandomNoise) - Set unique random seed
        if "75:73" in run_workflow_data:
            run_workflow_data["75:73"]["inputs"]["noise_seed"] = random.randint(1, 10**15)
            
        # Node "75:74" (CLIPTextEncode - Positive prompt)
        if "75:74" in run_workflow_data and req.prompt_override and req.prompt_override.strip():
            run_workflow_data["75:74"]["inputs"]["text"] = req.prompt_override

        try:
            p_id = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": run_workflow_data}).json()["prompt_id"]
            prompt_ids.append(p_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to submit prompt variation {i+1} to ComfyUI: {str(e)}")

    # 6. Poll history and retrieve outputs
    generated_images_base64 = []
    for i, p_id in enumerate(prompt_ids):
        try:
            print(f"Waiting for prompt variation {i+1}/{len(prompt_ids)} (ID: {p_id})...")
            history_data = wait_for_prompt_completion(p_id)
            
            # Find output images. Node "9" is VAE Decode -> SaveImage of the output
            # Node "368" is the concatenated 2x2 grid. Let's return Node "9" which is the clean generated image.
            outputs = history_data.get("outputs", {})
            save_node = "9"
            if save_node not in outputs and "368" in outputs:
                save_node = "368" # fallback to grid if node 9 is missing
                
            if save_node in outputs and "images" in outputs[save_node]:
                filename = outputs[save_node]["images"][0]["filename"]
                subfolder = outputs[save_node]["images"][0].get("subfolder", "")
                img_type = outputs[save_node]["images"][0].get("type", "output")
                
                # Fetch image bytes
                img_bytes = download_comfy_file(filename, img_type)
                img_base64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode("utf-8")
                generated_images_base64.append(img_base64)
            else:
                raise Exception("SaveImage node output not found in history.")
        except Exception as e:
            print(f"Error on variation {i+1}: {str(e)}")
            # Return placeholder/empty or throw
            raise HTTPException(status_code=500, detail=f"Error generating variation {i+1}: {str(e)}")

    return {"images": generated_images_base64}

@app.post("/api/generate-3d")
async def generate_3d(req: Generate3DRequest):
    """Executes the Apple SHARP 3DGS workflow in ComfyUI."""
    if not test_comfyui_connection():
        raise HTTPException(status_code=503, detail=f"ComfyUI server at {COMFYUI_URL} is unreachable.")

    # 1. Decode target image
    try:
        img_data = req.image
        if "," in img_data:
            img_data = img_data.split(",")[1]
        img_bytes = base64.b64decode(img_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid target image base64 data: {str(e)}")

    # 2. Upload to ComfyUI
    timestamp = int(time.time())
    img_filename = f"sharp_input_{timestamp}.png"
    try:
        upload_image_to_comfy(img_bytes, img_filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload target image to ComfyUI: {str(e)}")

    # 3. Load SHARP workflow
    if not os.path.exists(SHARP_WORKFLOW_PATH):
        raise HTTPException(status_code=500, detail=f"SHARP workflow file not found at: {SHARP_WORKFLOW_PATH}")
        
    with open(SHARP_WORKFLOW_PATH, "r") as f:
        workflow = json.load(f)

    # 4. Inject target image into node "1"
    if "1" in workflow:
        workflow["1"]["inputs"]["image"] = img_filename

    # 5. Run prompt
    try:
        p_id = requests.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow}).json()["prompt_id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit SHARP prompt to ComfyUI: {str(e)}")

    # 6. Wait and download PLY file
    try:
        print(f"Waiting for SHARP completion (ID: {p_id})...")
        history_data = wait_for_prompt_completion(p_id)
        outputs = history_data.get("outputs", {})
        
        # Apple SHARP outputs the PLY file. Let's find node "5" or "4" which saves/previews the PLY.
        # Let's inspect where the PLY filename is saved.
        # In sharp_basic.json, Node "5" is SharpPredict which generates the PLY file.
        # Let's scan history outputs for any keys matching "ply" or check node "5".
        ply_filename = None
        for node_id, node_output in outputs.items():
            if "gussians" in node_output: # typo in some ComfyUI geompack wrappers
                ply_filename = node_output["gussians"][0]["filename"]
                break
            if "ply" in node_output:
                ply_filename = node_output["ply"][0]["filename"]
                break
            if "images" in node_output:
                # Fallback, if it saves the ply under a custom format
                for img in node_output["images"]:
                    if img["filename"].endswith(".ply"):
                        ply_filename = img["filename"]
                        break
        
        # If not found directly, let's guess by looking at the output prefix from Node 5.
        # Node 5 has output_prefix = "sharp". The file is saved inside ComfyUI output directory as sharp_000xx.ply.
        if not ply_filename:
            # Look up standard geompack outputs or predict outputs
            if "5" in outputs and "ply" in outputs["5"]:
                ply_filename = outputs["5"]["ply"][0]["filename"]
            elif "4" in outputs and "ply" in outputs["4"]:
                ply_filename = outputs["4"]["ply"][0]["filename"]
        
        # Let's fallback search if not in history keys:
        if not ply_filename:
            # Let's check history and try to find any filename ending in .ply
            history_str = json.dumps(history_data)
            import re
            ply_matches = re.findall(r'"([^"\s]+\.ply)"', history_str)
            if ply_matches:
                ply_filename = ply_matches[0]
                
        if not ply_filename:
            # Let's raise an error or check output folder
            raise Exception("3D Gaussian Splat PLY filename not found in ComfyUI execution history.")

        # Download PLY from ComfyUI and convert to .splat format for the browser
        ply_bytes = download_comfy_file(ply_filename, "output")
        splat_bytes = ply_to_splat(ply_bytes)
        
        # Save the converted .splat file locally for download endpoint
        splat_filename = ply_filename.replace(".ply", ".splat")
        splat_cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".splat_cache")
        os.makedirs(splat_cache_dir, exist_ok=True)
        splat_path = os.path.join(splat_cache_dir, splat_filename)
        with open(splat_path, "wb") as sf:
            sf.write(splat_bytes)
        
        splat_url = f"/api/download-3d/{splat_filename}"
        
        return {
            "plyUrl": splat_url,
            "filename": splat_filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating or retrieving 3D splat: {str(e)}")

@app.get("/api/download-3d/{filename}")
def download_3d(filename: str):
    """Serves the converted .splat file from the local cache."""
    try:
        splat_cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".splat_cache")
        splat_path = os.path.join(splat_cache_dir, filename)
        
        if os.path.exists(splat_path):
            with open(splat_path, "rb") as f:
                splat_bytes = f.read()
            return Response(
                content=splat_bytes,
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f"inline; filename={filename}",
                    "Cache-Control": "public, max-age=3600"
                }
            )
        # Fallback: try to fetch from ComfyUI and convert on the fly
        ply_filename = filename.replace(".splat", ".ply")
        ply_bytes = download_comfy_file(ply_filename, "output")
        splat_bytes = ply_to_splat(ply_bytes)
        return Response(
            content=splat_bytes,
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
