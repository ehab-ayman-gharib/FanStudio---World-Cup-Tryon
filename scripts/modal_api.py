import modal
import json
import os
import time
import base64
import random
import subprocess
import requests
from io import BytesIO
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# --- 1. MODAL APP & STORAGE DEFINITION ---
app = modal.App("fanstudio-worldcup-2026")
vol = modal.Volume.from_name("comfy-models", create_if_missing=True)
nfs = modal.NetworkFileSystem.from_name("fanstudio-shared-nfs", create_if_missing=True)

# Define base system image for ComfyUI running on CUDA
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libgomp1")
    .pip_install(
        "fastapi[standard]", 
        "python-multipart",
        "requests",
        "pillow",
        "numpy",
        "torch",
        "torchvision",
        "torchaudio",
        "timm",
        "plyfile",
        "trimesh",
        "scipy",
        "einops",
        "open-clip-torch",
        "diffusers",
        "transformers"
    )
    .run_commands(
        "git clone https://github.com/comfyanonymous/ComfyUI.git /root/ComfyUI",
        "cd /root/ComfyUI && pip install -r requirements.txt",
        "rm -rf /root/ComfyUI/models"
    )
    # Clone required custom nodes
    .run_commands(
        "git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git /root/ComfyUI/custom_nodes/comfyui_controlnet_aux",
        "cd /root/ComfyUI/custom_nodes/comfyui_controlnet_aux && pip install -r requirements.txt"
    )
    .run_commands(
        "git clone https://github.com/kijai/ComfyUI-KJNodes.git /root/ComfyUI/custom_nodes/ComfyUI-KJNodes",
        "cd /root/ComfyUI/custom_nodes/ComfyUI-KJNodes && pip install -r requirements.txt"
    )
    .run_commands(
        "git clone https://github.com/PozzettiAndrea/ComfyUI-Sharp.git /root/ComfyUI/custom_nodes/ComfyUI-Sharp",
        "cd /root/ComfyUI/custom_nodes/ComfyUI-Sharp && pip install -r requirements.txt --upgrade",
        "git clone https://github.com/PozzettiAndrea/ComfyUI-GeometryPack.git /root/ComfyUI/custom_nodes/ComfyUI-GeometryPack"
    )
    .run_commands(
        "git clone https://github.com/capitan01R/ComfyUI-Flux2Klein-Enhancer.git /root/ComfyUI/custom_nodes/ComfyUI-Flux2Klein-Enhancer"
    )
    .run_commands(
        "git clone https://github.com/chflame163/ComfyUI_LayerStyle.git /root/ComfyUI/custom_nodes/ComfyUI_LayerStyle",
        "cd /root/ComfyUI/custom_nodes/ComfyUI_LayerStyle && pip install -r requirements.txt",
        "git clone https://github.com/SoraSearch/ComfyUI-RMBG.git /root/ComfyUI/custom_nodes/ComfyUI-RMBG"
    )
)

# --- 2. REQUEST SCHEMAS ---
class Generate2DRequest(BaseModel):
    user_image: str  # Base64 string
    kit_image: str   # Base64 string
    prompt_override: str | None = None
    num_variations: int = 1

class Generate3DRequest(BaseModel):
    image: str  # Base64 string

# --- 3. STAGE 1: FLUX GENERATION WORKER ---
@app.cls(
    gpu="L4",
    image=image,
    volumes={"/root/ComfyUI/models": vol},
    scaledown_window=60,
    timeout=600
)
class ComfyFLUXWorker:
    @modal.enter()
    def start_comfy_server(self):
        try:
            response = requests.get("http://127.0.0.1:8188/history", timeout=1)
            if response.status_code == 200:
                print("♻️ Reusing warm FLUX ComfyUI server instance!")
                return
        except Exception:
            pass

        print("🌀 Launching FLUX ComfyUI instance on L4...")
        subprocess.Popen([
            "python", "main.py", 
            "--listen", "127.0.0.1", 
            "--force-fp16"
        ], cwd="/root/ComfyUI")
        
        for _ in range(45):
            try:
                response = requests.get("http://127.0.0.1:8188/history")
                if response.status_code == 200:
                    print("⚡ FLUX ComfyUI server is warm!")
                    return
            except requests.exceptions.ConnectionError:
                time.sleep(1)
        raise Exception("ComfyUI server failed to initialize on L4.")

    @modal.method()
    def process(self, user_img_bytes: bytes, kit_img_bytes: bytes, seed: int, prompt_override: str | None, workflow_json_str: str) -> bytes:
        timestamp = int(time.time() * 1000)
        user_filename = f"user_selfie_{timestamp}.png"
        kit_filename = f"kit_ref_{timestamp}.png"
        
        # Save to ComfyUI input folder
        input_dir = "/root/ComfyUI/input"
        os.makedirs(input_dir, exist_ok=True)
        
        with open(f"{input_dir}/{user_filename}", "wb") as f:
            f.write(user_img_bytes)
        with open(f"{input_dir}/{kit_filename}", "wb") as f:
            f.write(kit_img_bytes)

        workflow = json.loads(workflow_json_str)

        # Inject inputs
        if "76" in workflow:
            workflow["76"]["inputs"]["image"] = user_filename
        if "360" in workflow:
            workflow["360"]["inputs"]["image"] = kit_filename
        if "75:73" in workflow:
            workflow["75:73"]["inputs"]["noise_seed"] = seed
        if "75:74" in workflow and prompt_override and prompt_override.strip():
            workflow["75:74"]["inputs"]["text"] = prompt_override

        # Submit prompt
        prompt_res = requests.post("http://127.0.0.1:8188/prompt", json={"prompt": workflow}).json()
        prompt_id = prompt_res.get("prompt_id")
        if not prompt_id:
            raise Exception(f"Queue failed: {prompt_res}")

        # Poll for completion
        while True:
            history = requests.get(f"http://127.0.0.1:8188/history/{prompt_id}").json()
            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                save_node = "9"
                if save_node not in outputs and "368" in outputs:
                    save_node = "368"
                if save_node in outputs and "images" in outputs[save_node]:
                    filename = outputs[save_node]["images"][0]["filename"]
                    break
                else:
                    raise Exception("Output image node not found in history.")
            time.sleep(0.5)

        output_path = f"/root/ComfyUI/output/{filename}"
        with open(output_path, "rb") as f:
            return f.read()

# --- 4. STAGE 2: APPLE SHARP 3DGS WORKER ---
@app.cls(
    gpu="T4",
    image=image,
    volumes={"/root/ComfyUI/models": vol},
    network_file_systems={"/shared": nfs},
    scaledown_window=60,
    timeout=600
)
class ComfySHARPWorker:
    @modal.enter()
    def start_comfy_server(self):
        try:
            response = requests.get("http://127.0.0.1:8188/history", timeout=1)
            if response.status_code == 200:
                print("♻️ Reusing warm SHARP ComfyUI server instance!")
                return
        except Exception:
            pass

        print("🌀 Launching SHARP ComfyUI instance on T4...")
        subprocess.Popen([
            "python", "main.py", 
            "--listen", "127.0.0.1", 
            "--force-fp16"
        ], cwd="/root/ComfyUI")
        
        for _ in range(45):
            try:
                response = requests.get("http://127.0.0.1:8188/history")
                if response.status_code == 200:
                    print("⚡ SHARP ComfyUI server is warm!")
                    return
            except requests.exceptions.ConnectionError:
                time.sleep(1)
        raise Exception("ComfyUI server failed to initialize on T4.")

    @modal.method()
    def process(self, img_bytes: bytes, workflow_json_str: str) -> str:
        timestamp = int(time.time() * 1000)
        img_filename = f"sharp_input_{timestamp}.png"
        
        input_dir = "/root/ComfyUI/input"
        os.makedirs(input_dir, exist_ok=True)
        
        with open(f"{input_dir}/{img_filename}", "wb") as f:
            f.write(img_bytes)

        workflow = json.loads(workflow_json_str)

        # Inject input
        if "1" in workflow:
            workflow["1"]["inputs"]["image"] = img_filename

        # Submit prompt
        prompt_res = requests.post("http://127.0.0.1:8188/prompt", json={"prompt": workflow}).json()
        prompt_id = prompt_res.get("prompt_id")
        if not prompt_id:
            raise Exception(f"Queue failed: {prompt_res}")

        # Poll for completion
        while True:
            history = requests.get(f"http://127.0.0.1:8188/history/{prompt_id}").json()
            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                
                # Scan outputs for any generated PLY file
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
                
                # Check direct nodes if not found
                if not ply_filename:
                    if "5" in outputs and "ply" in outputs["5"]:
                        ply_filename = outputs["5"]["ply"][0]["filename"]
                    elif "4" in outputs and "ply" in outputs["4"]:
                        ply_filename = outputs["4"]["ply"][0]["filename"]

                if ply_filename:
                    break
                else:
                    # Fallback string search for .ply in history json
                    import re
                    matches = re.findall(r'"([^"\s]+\.ply)"', json.dumps(history[prompt_id]))
                    if matches:
                        ply_filename = matches[0]
                        break
            time.sleep(0.5)

        # Write straight to the shared NFS instead of encoding as big base64 payload here
        output_path = f"/root/ComfyUI/output/{ply_filename}"
        shared_filename = f"sharp_{int(time.time())}_{random.randint(1000, 9999)}.ply"
        os.makedirs("/shared", exist_ok=True)
        shared_path = f"/shared/{shared_filename}"
        
        with open(output_path, "rb") as f_in:
            with open(shared_path, "wb") as f_out:
                f_out.write(f_in.read())
                
        return shared_filename

# --- 5. FASTAPI CPU ROUTER TIER ---
web_app = FastAPI(title="FanStudio Modal API", description="Production serverless API hosted on Modal")
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Host workflow definitions inside the CPU router to read and inject
FLUX_WORKFLOW_RAW = ""
SHARP_WORKFLOW_RAW = ""

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

def load_workflows():
    global FLUX_WORKFLOW_RAW, SHARP_WORKFLOW_RAW
    # Since Modal deploys with local context, we can read files in the directory
    flux_path = "ComfyUI_Workflows/flux-studio-app-World-Cup.json"
    sharp_path = "ComfyUI_Workflows/sharp_basic.json"
    
    if os.path.exists(flux_path):
        with open(flux_path, "r") as f:
            FLUX_WORKFLOW_RAW = f.read()
    if os.path.exists(sharp_path):
        with open(sharp_path, "r") as f:
            SHARP_WORKFLOW_RAW = f.read()

# Run loader on startup
load_workflows()

@web_app.post("/api/generate-2d")
async def generate_2d(req: Generate2DRequest):
    if not FLUX_WORKFLOW_RAW:
        load_workflows()
        if not FLUX_WORKFLOW_RAW:
            raise HTTPException(status_code=500, detail="FLUX workflow configuration missing on server.")

    try:
        user_img_bytes = base64.b64decode(req.user_image.split(",")[1] if "," in req.user_image else req.user_image)
        kit_img_bytes = base64.b64decode(req.kit_image.split(",")[1] if "," in req.kit_image else req.kit_image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode base64 images: {str(e)}")

    worker = ComfyFLUXWorker()
    
    # Launch variations in parallel via Modal remote calls
    jobs = []
    for _ in range(req.num_variations):
        seed = random.randint(1, 10**15)
        jobs.append(
            worker.process.remote.aio(
                user_img_bytes, 
                kit_img_bytes, 
                seed, 
                req.prompt_override, 
                FLUX_WORKFLOW_RAW
            )
        )

    results_base64 = []
    try:
        results = await modal.gather(*jobs)
        for r_bytes in results:
            img_b64 = "data:image/png;base64," + base64.b64encode(r_bytes).decode("utf-8")
            results_base64.append(img_b64)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FLUX generation pipeline error: {str(e)}")

    return {"images": results_base64}

@web_app.post("/api/generate-3d")
async def generate_3d(req: Generate3DRequest):
    if not SHARP_WORKFLOW_RAW:
        load_workflows()
        if not SHARP_WORKFLOW_RAW:
            raise HTTPException(status_code=500, detail="SHARP workflow configuration missing on server.")

    try:
        img_bytes = base64.b64decode(req.image.split(",")[1] if "," in req.image else req.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")

    worker = ComfySHARPWorker()
    try:
        shared_filename = await worker.process.remote.aio(img_bytes, SHARP_WORKFLOW_RAW)
        
        # Convert PLY -> .splat and write to shared NFS
        filepath = f"/shared/{shared_filename}"
        with open(filepath, "rb") as f:
            ply_bytes = f.read()
        
        splat_bytes = ply_to_splat(ply_bytes)
        splat_filename = shared_filename.replace(".ply", ".splat")
        splat_path = f"/shared/{splat_filename}"
        with open(splat_path, "wb") as sf:
            sf.write(splat_bytes)
            
        # Clean up the raw PLY file to save disk space
        try:
            os.remove(filepath)
        except Exception:
            pass
        
        return {
            "plyUrl": f"/api/download-3d/{splat_filename}",
            "filename": splat_filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SHARP 3D generation pipeline error: {str(e)}")

@web_app.get("/api/download-3d/{filename}")
def download_3d(filename: str):
    """Streams the converted .splat point cloud file from the shared NetworkFileSystem."""
    filepath = f"/shared/{filename}"
    if not os.path.exists(filepath):
        # If the requested file is a .splat but only the .ply exists, do on-the-fly conversion
        if filename.endswith(".splat"):
            ply_path = filepath.replace(".splat", ".ply")
            if os.path.exists(ply_path):
                try:
                    with open(ply_path, "rb") as f:
                        ply_bytes = f.read()
                    splat_bytes = ply_to_splat(ply_bytes)
                    with open(filepath, "wb") as f_out:
                        f_out.write(splat_bytes)
                    return Response(
                        content=splat_bytes,
                        media_type="application/octet-stream",
                        headers={"Content-Disposition": f"inline; filename={filename}"}
                    )
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to convert PLY on-the-fly: {str(e)}")
        raise HTTPException(status_code=404, detail="3D Splat file not found.")
    try:
        with open(filepath, "rb") as f:
            splat_bytes = f.read()
        return Response(
            content=splat_bytes,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "Cache-Control": "public, max-age=3600"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load 3D model: {str(e)}")

@app.function(
    network_file_systems={"/shared": nfs}
)
@modal.asgi_app()
def serve():
    return web_app
