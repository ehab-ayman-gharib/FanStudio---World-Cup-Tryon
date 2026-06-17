import modal
import asyncio
import json
import os
import time

# Set PyTorch allocator configuration to prevent memory fragmentation OOMs
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
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
    .entrypoint([])
    .apt_install("git", "libgl1", "libglib2.0-0", "wget", "libgomp1", "ffmpeg")
    .run_commands(
        "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "fastapi[standard]", 
        "python-multipart",
        "requests",
        "pillow",
        "numpy<2",
        "timm",
        "plyfile",
        "trimesh",
        "scipy",
        "einops",
        "open-clip-torch",
        "diffusers",
        "transformers",
        "onnxruntime-gpu==1.19.0"
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
        "git clone https://github.com/1038lab/ComfyUI-RMBG.git /root/ComfyUI/custom_nodes/ComfyUI-RMBG"
    )
    .run_commands(
        "python -c \"from huggingface_hub import hf_hub_download; "
        "hf_hub_download(repo_id='yzd-v/DWPose', filename='yolox_l.onnx', local_dir='/root/controlnet_aux_cache/yzd-v/DWPose'); "
        "hf_hub_download(repo_id='hr16/DWPose-TorchScript-BatchSize5', filename='dw-ll_ucoco_384_bs5.torchscript.pt', local_dir='/root/controlnet_aux_cache/hr16/DWPose-TorchScript-BatchSize5')\""
    )
    .run_commands(
        "pip install \"numpy<2\""
    )
    # Cache Apple SHARP model checkpoint to speed up cold starts
    .run_commands(
        "mkdir -p /root/sharp_cache && wget -q https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt -O /root/sharp_cache/sharp_2572gikvuh.pt"
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
    gpu="A100",
    cpu=4.0,
    memory=32768,
    image=image,
    volumes={"/root/ComfyUI/models": vol},
    scaledown_window=300,
    timeout=600,
    max_containers=1
)
class ComfyFLUXWorker:
    is_warmed_up = False
    @modal.enter()
    def start_comfy_server(self):
        # 1. Link ControlNet Aux checkpoints directly from local image cache (SSD) instead of persistent volume
        # This prevents network file system latency (which takes 12 seconds to load)
        import shutil
        aux_ckpts_path = "/root/ComfyUI/custom_nodes/comfyui_controlnet_aux/ckpts"
        if os.path.exists(aux_ckpts_path) and not os.path.islink(aux_ckpts_path):
            try:
                shutil.rmtree(aux_ckpts_path)
            except Exception as e:
                print(f"Error removing default aux ckpts folder: {e}")
        if not os.path.exists(aux_ckpts_path):
            os.symlink("/root/controlnet_aux_cache", aux_ckpts_path)
            print("🔗 Symlinked ControlNet auxiliary checkpoints to local image cache!")

        try:
            response = requests.get("http://127.0.0.1:8188/history", timeout=1)
            if response.status_code == 200:
                print("♻️ Reusing warm FLUX ComfyUI server instance!")
                return
        except Exception:
            pass

        print("🌀 Launching FLUX ComfyUI instance on L4 (highvram defaults)...")
        subprocess.Popen([
            "python", "main.py", 
            "--listen", "127.0.0.1", 
            "--disable-auto-launch",
            "--enable-manager",
            "--port", "8188",
            "--enable-cors-header", "*"
        ], cwd="/root/ComfyUI")
        
        for _ in range(45):
            try:
                response = requests.get("http://127.0.0.1:8188/history")
                if response.status_code == 200:
                    print("⚡ FLUX ComfyUI server is warm!")
                    time.sleep(2.5)  # Settle time to let background imports/subsystems finish initializing
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
                    status_info = history[prompt_id].get("status", {})
                    raise Exception(f"Output node {save_node} not found. Available output nodes: {list(outputs.keys())}. Status: {status_info}")
            time.sleep(0.5)
        
        ComfyFLUXWorker.is_warmed_up = True
        output_path = f"/root/ComfyUI/output/{filename}"
        try:
            from PIL import Image
            import io
            with Image.open(output_path) as img:
                out_buf = io.BytesIO()
                # Convert to high-quality compressed JPEG to speed up network payload transfer (3MB -> ~300KB)
                img.convert("RGB").save(out_buf, format="JPEG", quality=85)
                return out_buf.getvalue()
        except Exception as e:
            print(f"⚠️ Image compression failed, falling back to raw bytes: {e}")
            with open(output_path, "rb") as f:
                return f.read()

    @modal.method()
    def warmup(self) -> str:
        if ComfyFLUXWorker.is_warmed_up:
            print("♻️ FLUX worker is already warm, skipping dummy run.")
            return "ok"
            
        global FLUX_WORKFLOW_RAW
        if not FLUX_WORKFLOW_RAW:
            load_workflows()
        
        from PIL import Image
        from io import BytesIO
        img = Image.new("RGB", (256, 256), color="gray")
        buf = BytesIO()
        img.save(buf, format="PNG")
        dummy_bytes = buf.getvalue()
        
        try:
            print("🔥 Pre-warming FLUX worker models (dummy run)...")
            workflow = json.loads(FLUX_WORKFLOW_RAW)
            if "75:62" in workflow:
                workflow["75:62"]["inputs"]["steps"] = 1
            if "75:66" in workflow:
                workflow["75:66"]["inputs"]["width"] = 256
                workflow["75:66"]["inputs"]["height"] = 256
            
            self.process.local(dummy_bytes, dummy_bytes, 42, None, json.dumps(workflow))
            ComfyFLUXWorker.is_warmed_up = True
            print("⚡ FLUX worker is fully warm!")
        except Exception as e:
            print(f"⚠️ FLUX pre-warming failed: {e}")
        return "ok"

# --- 4. STAGE 2: APPLE SHARP 3DGS WORKER ---
@app.cls(
    gpu="L4",
    image=image,
    volumes={"/root/ComfyUI/models": vol},
    network_file_systems={"/shared": nfs},
    scaledown_window=300,
    timeout=600,
    max_containers=1
)
class ComfySHARPWorker:
    @modal.enter()
    def start_comfy_server(self):
        import shutil
        os.makedirs("/root/ComfyUI/models/sharp", exist_ok=True)
        cache_sharp = "/root/sharp_cache/sharp_2572gikvuh.pt"
        target_sharp = "/root/ComfyUI/models/sharp/sharp_2572gikvuh.pt"
        if os.path.exists(cache_sharp) and not os.path.exists(target_sharp):
            print("🔗 Symlinking SHARP model checkpoint from local image cache...")
            os.symlink(cache_sharp, target_sharp)

        try:
            response = requests.get("http://127.0.0.1:8188/history", timeout=1)
            if response.status_code == 200:
                print("♻️ Reusing warm SHARP ComfyUI server instance!")
                return
        except Exception:
            pass

        print("🌀 Launching SHARP ComfyUI instance on L4...")
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
                    time.sleep(2.5)  # Settle time to let background imports/subsystems finish initializing
                    return
            except requests.exceptions.ConnectionError:
                time.sleep(1)
        raise Exception("ComfyUI server failed to initialize on L4.")

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
    expose_headers=["Content-Length", "Content-Disposition"],
)

@web_app.get("/api/health")
def health():
    return {"status": "healthy"}

@web_app.get("/api/pre-warm")
def pre_warm():
    flux_worker = ComfyFLUXWorker()
    # Spawn enqueues the task on Modal's cloud queue instantly, starting the GPU instance in the background
    flux_worker.warmup.spawn()
    return {"status": "warming"}

# Host workflow definitions inside the CPU router to read and inject
FLUX_WORKFLOW_RAW = base64.b64decode("ewogICI5IjogewogICAgImlucHV0cyI6IHsKICAgICAgImZpbGVuYW1lX3ByZWZpeCI6ICJGbHV4Mi1LbGVpbiIsCiAgICAgICJpbWFnZXMiOiBbCiAgICAgICAgIjc1OjY1IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJTYXZlSW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiU2F2ZSBJbWFnZSIKICAgIH0KICB9LAogICI3NiI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJpbWFnZSI6ICJXaGF0c0FwcCBJbWFnZSAyMDI2LTA2LTEwIGF0IDYuNDYuNDggUE0uanBlZyIKICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJMb2FkSW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTG9hZCBJbWFnZSIKICAgIH0KICB9LAogICIzNDMiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiZGlyZWN0aW9uIjogInVwIiwKICAgICAgIm1hdGNoX2ltYWdlX3NpemUiOiB0cnVlLAogICAgICAiaW1hZ2UxIjogWwogICAgICAgICIzNjciLAogICAgICAgIDAKICAgICAgXSwKICAgICAgImltYWdlMiI6IFsKICAgICAgICAiMzY2IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJJbWFnZUNvbmNhbmF0ZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJJbWFnZSBDb25jYXRlbmF0ZSIKICAgIH0KICB9LAogICIzNDQiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiaW1hZ2VzIjogWwogICAgICAgICIzNDMiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlByZXZpZXdJbWFnZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJQcmV2aWV3IEltYWdlIgogICAgfQogIH0sCiAgIjM1MCI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ3aWR0aCI6IFsKICAgICAgICAiMzUzIiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJoZWlnaHQiOiBbCiAgICAgICAgIjM1MyIsCiAgICAgICAgMQogICAgICBdLAogICAgICAiY29sb3IiOiAiIzgwODA4MCIKICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJMYXllclV0aWxpdHk6IENvbG9ySW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTGF5ZXJVdGlsaXR5OiBDb2xvckltYWdlIgogICAgfQogIH0sCiAgIjM1MSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ4IjogMCwKICAgICAgInkiOiAwLAogICAgICAicmVzaXplX3NvdXJjZSI6IGZhbHNlLAogICAgICAiZGVzdGluYXRpb24iOiBbCiAgICAgICAgIjM1MCIsCiAgICAgICAgMAogICAgICBdLAogICAgICAic291cmNlIjogWwogICAgICAgICI3NiIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibWFzayI6IFsKICAgICAgICAiMzU0IiwKICAgICAgICAxCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJJbWFnZUNvbXBvc2l0ZU1hc2tlZCIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJJbWFnZUNvbXBvc2l0ZU1hc2tlZCIKICAgIH0KICB9LAogICIzNTIiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiaW1hZ2VzIjogWwogICAgICAgICIzNTEiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlByZXZpZXdJbWFnZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJQcmV2aWV3IEltYWdlIgogICAgfQogIH0sCiAgIjM1MyI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJpbWFnZSI6IFsKICAgICAgICAiMzU0IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJHZXRJbWFnZVNpemUiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiR2V0IEltYWdlIFNpemUiCiAgICB9CiAgfSwKICAiMzU0IjogewogICAgImlucHV0cyI6IHsKICAgICAgIm1vZGVsIjogIlJNQkctMi4wIiwKICAgICAgInNlbnNpdGl2aXR5IjogMSwKICAgICAgInByb2Nlc3NfcmVzIjogMTAyNCwKICAgICAgIm1hc2tfYmx1ciI6IDAsCiAgICAgICJtYXNrX29mZnNldCI6IDAsCiAgICAgICJpbnZlcnRfb3V0cHV0IjogZmFsc2UsCiAgICAgICJyZWZpbmVfZm9yZWdyb3VuZCI6IGZhbHNlLAogICAgICAiYmFja2dyb3VuZCI6ICJBbHBoYSIsCiAgICAgICJiYWNrZ3JvdW5kX2NvbG9yIjogIiMyMjIyMjIiLAogICAgICAiaW1hZ2UiOiBbCiAgICAgICAgIjc2IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJSTUJHIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlJlbW92ZSBCYWNrZ3JvdW5kIChSTUJHKSIKICAgIH0KICB9LAogICIzNjAiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiaW1hZ2UiOiAidXpiZWtpc3RhbiAyMDI2IGtpdHMgKDEpLmpwZyIKICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJMb2FkSW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTG9hZCBJbWFnZSIKICAgIH0KICB9LAogICIzNjYiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiZGlyZWN0aW9uIjogImxlZnQiLAogICAgICAibWF0Y2hfaW1hZ2Vfc2l6ZSI6IHRydWUsCiAgICAgICJpbWFnZTEiOiBbCiAgICAgICAgIjc1OjMzMiIsCiAgICAgICAgMAogICAgICBdLAogICAgICAiaW1hZ2UyIjogWwogICAgICAgICI3NiIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiSW1hZ2VDb25jYW5hdGUiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiSW1hZ2UgQ29uY2F0ZW5hdGUiCiAgICB9CiAgfSwKICAiMzY3IjogewogICAgImlucHV0cyI6IHsKICAgICAgImRpcmVjdGlvbiI6ICJsZWZ0IiwKICAgICAgIm1hdGNoX2ltYWdlX3NpemUiOiB0cnVlLAogICAgICAiaW1hZ2UxIjogWwogICAgICAgICI3NTo2NSIsCiAgICAgICAgMAogICAgICBdLAogICAgICAiaW1hZ2UyIjogWwogICAgICAgICI3NTozNTgiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIkltYWdlQ29uY2FuYXRlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIkltYWdlIENvbmNhdGVuYXRlIgogICAgfQogIH0sCiAgIjM2OCI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJmaWxlbmFtZV9wcmVmaXgiOiAiV29ybGRDdXAtIiwKICAgICAgImltYWdlcyI6IFsKICAgICAgICAiMzQzIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJTYXZlSW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiU2F2ZSBJbWFnZSIKICAgIH0KICB9LAogICI3NTo2MSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJzYW1wbGVyX25hbWUiOiAiZXVsZXIiCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiS1NhbXBsZXJTZWxlY3QiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiS1NhbXBsZXJTZWxlY3QiCiAgICB9CiAgfSwKICAiNzU6NjQiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAibm9pc2UiOiBbCiAgICAgICAgIjc1OjczIiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJndWlkZXIiOiBbCiAgICAgICAgIjc1OjYzIiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJzYW1wbGVyIjogWwogICAgICAgICI3NTo2MSIsCiAgICAgICAgMAogICAgICBdLAogICAgICAic2lnbWFzIjogWwogICAgICAgICI3NTo2MiIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibGF0ZW50X2ltYWdlIjogWwogICAgICAgICI3NTo2NiIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiU2FtcGxlckN1c3RvbUFkdmFuY2VkIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlNhbXBsZXJDdXN0b21BZHZhbmNlZCIKICAgIH0KICB9LAogICI3NTo2NSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJzYW1wbGVzIjogWwogICAgICAgICI3NTo2NCIsCiAgICAgICAgMAogICAgICBdLAogICAgICAidmFlIjogWwogICAgICAgICI3NTo3MiIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiVkFFRGVjb2RlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlZBRSBEZWNvZGUiCiAgICB9CiAgfSwKICAiNzU6NzMiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAibm9pc2Vfc2VlZCI6IDY5OTY5NzI2NTA3MTA4NgogICAgfSwKICAgICJjbGFzc190eXBlIjogIlJhbmRvbU5vaXNlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlJhbmRvbU5vaXNlIgogICAgfQogIH0sCiAgIjc1OjcwIjogewogICAgImlucHV0cyI6IHsKICAgICAgInVuZXRfbmFtZSI6ICJmbHV4LTIta2xlaW4tOWItZnA4LnNhZmV0ZW5zb3JzIiwKICAgICAgIndlaWdodF9kdHlwZSI6ICJkZWZhdWx0IgogICAgfSwKICAgICJjbGFzc190eXBlIjogIlVORVRMb2FkZXIiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTG9hZCBEaWZmdXNpb24gTW9kZWwiCiAgICB9CiAgfSwKICAiNzU6NzEiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY2xpcF9uYW1lIjogInF3ZW5fM184Yl9mcDRtaXhlZC5zYWZldGVuc29ycyIsCiAgICAgICJ0eXBlIjogImZsdXgyIiwKICAgICAgImRldmljZSI6ICJkZWZhdWx0IgogICAgfSwKICAgICJjbGFzc190eXBlIjogIkNMSVBMb2FkZXIiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTG9hZCBDTElQIgogICAgfQogIH0sCiAgIjc1OjY2IjogewogICAgImlucHV0cyI6IHsKICAgICAgIndpZHRoIjogNzY4LAogICAgICAiaGVpZ2h0IjogMTM0NCwKICAgICAgImJhdGNoX3NpemUiOiAxCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiRW1wdHlGbHV4MkxhdGVudEltYWdlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIkVtcHR5IEZsdXggMiBMYXRlbnQiCiAgICB9CiAgfSwKICAiNzU6NjMiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY2ZnIjogMSwKICAgICAgIm1vZGVsIjogWwogICAgICAgICI3NTozNDUiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgInBvc2l0aXZlIjogWwogICAgICAgICI3NTozNDUiLAogICAgICAgIDEKICAgICAgXSwKICAgICAgIm5lZ2F0aXZlIjogWwogICAgICAgICI3NTozNjU6MzYyIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJDRkdHdWlkZXIiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiQ0ZHR3VpZGVyIgogICAgfQogIH0sCiAgIjc1OjYyIjogewogICAgImlucHV0cyI6IHsKICAgICAgInN0ZXBzIjogNCwKICAgICAgIndpZHRoIjogMTAyNCwKICAgICAgImhlaWdodCI6IDEwMjQKICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJGbHV4MlNjaGVkdWxlciIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJGbHV4MlNjaGVkdWxlciIKICAgIH0KICB9LAogICI3NTo3MiI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ2YWVfbmFtZSI6ICJmbHV4Mi12YWUuc2FmZXRlbnNvcnMiCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiVkFFTG9hZGVyIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIkxvYWQgVkFFIgogICAgfQogIH0sCiAgIjc1Ojc0IjogewogICAgImlucHV0cyI6IHsKICAgICAgInRleHQiOiAiUmVwbGFjZSB0aGUgZW52aXJvbm1lbnQgd2l0aCBhIHNvY2NlciBzdGFkaXVtLiBcbkNoYW5nZSB0aGUgb3V0Zml0cyB0byBtYXRjaCBleGFjdGx5IHRoZSB0aGlyZCBpbWFnZSdzIHJlZmVyZW5jZSBzb2NjZXIgb3V0Zml0IiwKICAgICAgImNsaXAiOiBbCiAgICAgICAgIjc1OjcxIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJDTElQVGV4dEVuY29kZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJDTElQIFRleHQgRW5jb2RlIChQb3NpdGl2ZSBQcm9tcHQpIgogICAgfQogIH0sCiAgIjc1OjE1MSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ0ZXh0IjogIm5vIGV4dHJhIGhhbmRzLCBubyB3YXRlcm1hcmtzLCBubyBkaXN0b3J0ZWQgZmFjZXMsIGVhY2ggcGVyc29uIGhhcyBvbmx5IDIgaGFuZHMgb25seSIsCiAgICAgICJjbGlwIjogWwogICAgICAgICI3NTo3MSIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiQ0xJUFRleHRFbmNvZGUiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiQ0xJUCBUZXh0IEVuY29kZSAoUHJvbXB0KSIKICAgIH0KICB9LAogICI3NTozMzE6MzE5IjogewogICAgImlucHV0cyI6IHsKICAgICAgImNvbmRpdGlvbmluZyI6IFsKICAgICAgICAiNzU6MzQyOjMzOSIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibGF0ZW50IjogWwogICAgICAgICI3NTozMzE6MzIwIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJSZWZlcmVuY2VMYXRlbnQiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiUmVmZXJlbmNlTGF0ZW50IgogICAgfQogIH0sCiAgIjc1OjMzMTozMjAiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAicGl4ZWxzIjogWwogICAgICAgICI3NTozMzIiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgInZhZSI6IFsKICAgICAgICAiNzU6NzIiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlZBRUVuY29kZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJWQUUgRW5jb2RlIgogICAgfQogIH0sCiAgIjc1OjMzMTozMjEiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY29uZGl0aW9uaW5nIjogWwogICAgICAgICI3NTozNDI6MzQxIiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJsYXRlbnQiOiBbCiAgICAgICAgIjc1OjMzMTozMjAiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlJlZmVyZW5jZUxhdGVudCIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJSZWZlcmVuY2VMYXRlbnQiCiAgICB9CiAgfSwKICAiNzU6MzMyIjogewogICAgImlucHV0cyI6IHsKICAgICAgInByZXByb2Nlc3NvciI6ICJEV1ByZXByb2Nlc3NvciIsCiAgICAgICJyZXNvbHV0aW9uIjogNTEyLAogICAgICAiaW1hZ2UiOiBbCiAgICAgICAgIjc2IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJBSU9fUHJlcHJvY2Vzc29yIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIkFJTyBBdXggUHJlcHJvY2Vzc29yIgogICAgfQogIH0sCiAgIjc1OjMzNCI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJpbWFnZXMiOiBbCiAgICAgICAgIjc1OjMzMiIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiUHJldmlld0ltYWdlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlByZXZpZXcgSW1hZ2UiCiAgICB9CiAgfSwKICAiNzU6MzQyOjMzOSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJjb25kaXRpb25pbmciOiBbCiAgICAgICAgIjc1OjE1MSIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibGF0ZW50IjogWwogICAgICAgICI3NTozNDI6MzQwIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJSZWZlcmVuY2VMYXRlbnQiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiUmVmZXJlbmNlTGF0ZW50IgogICAgfQogIH0sCiAgIjc1OjM0MjozNDAiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAicGl4ZWxzIjogWwogICAgICAgICIzNTEiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgInZhZSI6IFsKICAgICAgICAiNzU6NzIiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlZBRUVuY29kZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJWQUUgRW5jb2RlIgogICAgfQogIH0sCiAgIjc1OjM0MjozNDEiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY29uZGl0aW9uaW5nIjogWwogICAgICAgICI3NTo3NCIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibGF0ZW50IjogWwogICAgICAgICI3NTozNDI6MzQwIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJSZWZlcmVuY2VMYXRlbnQiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiUmVmZXJlbmNlTGF0ZW50IgogICAgfQogIH0sCiAgIjc1OjM0NSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJzdHJlbmd0aCI6IDEuMDUsCiAgICAgICJyZWZlcmVuY2VfaW5kZXgiOiAwLAogICAgICAic3BhdGlhbF9mYWRlIjogIm5vbmUiLAogICAgICAic3BhdGlhbF9mYWRlX3N0cmVuZ3RoIjogMC41LAogICAgICAiZGVidWciOiBmYWxzZSwKICAgICAgIm1vZGVsIjogWwogICAgICAgICI3NTo3MCIsCiAgICAgICAgMAogICAgICBdLAogICAgICAiY29uZGl0aW9uaW5nIjogWwogICAgICAgICI3NTozNjU6MzY0IiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJGbHV4MktsZWluUmVmTGF0ZW50Q29udHJvbGxlciIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJGTFVYLjIgS2xlaW4gUmVmIExhdGVudCBDb250cm9sbGVyIgogICAgfQogIH0sCiAgIjc1OjM1NSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJja3B0X25hbWUiOiAic2FtMy4xX211bHRpcGxleF9mcDE2LnNhZmV0ZW5zb3JzIgogICAgfSwKICAgICJjbGFzc190eXBlIjogIkNoZWNrcG9pbnRMb2FkZXJTaW1wbGUiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiTG9hZCBDaGVja3BvaW50IChTYW0zLjEpIgogICAgfQogIH0sCiAgIjc1OjM1NiI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ1cHNjYWxlX21ldGhvZCI6ICJuZWFyZXN0LWV4YWN0IiwKICAgICAgIm1lZ2FwaXhlbHMiOiAxLAogICAgICAicmVzb2x1dGlvbl9zdGVwcyI6IDEsCiAgICAgICJpbWFnZSI6IFsKICAgICAgICAiMzYwIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJJbWFnZVNjYWxlVG9Ub3RhbFBpeGVscyIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJDaGFuZ2UgdGhlIHNpemUiCiAgICB9CiAgfSwKICAiNzU6MzU3OjI2MyI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJ0aHJlc2hvbGQiOiAwLjUsCiAgICAgICJyZWZpbmVfaXRlcmF0aW9ucyI6IDIsCiAgICAgICJpbmRpdmlkdWFsX21hc2tzIjogZmFsc2UsCiAgICAgICJtb2RlbCI6IFsKICAgICAgICAiNzU6MzU1IiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJpbWFnZSI6IFsKICAgICAgICAiNzU6MzU2IiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJjb25kaXRpb25pbmciOiBbCiAgICAgICAgIjc1OjM1NzoyNjQiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlNBTTNfRGV0ZWN0IiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlNBTTMgRGV0ZWN0IgogICAgfQogIH0sCiAgIjc1OjM1NzoyNjQiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAidGV4dCI6ICJzaGlydHMsIHNob3J0cywgc29jY2VyIHRlZXMsIHNvY2NlciBzaG9ydHMsIGxvZ28sIHNsb2dhbiwgc3ltYm9sLCBmbGFnIiwKICAgICAgImNsaXAiOiBbCiAgICAgICAgIjc1OjM1NSIsCiAgICAgICAgMQogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiQ0xJUFRleHRFbmNvZGUiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiQ0xJUCBUZXh0IEVuY29kZSAoUHJvbXB0KSIKICAgIH0KICB9LAogICI3NTozNTgiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY29sb3IiOiAiMCwgMjU1LCAwIiwKICAgICAgImRldmljZSI6ICJncHUiLAogICAgICAiaW1hZ2UiOiBbCiAgICAgICAgIjc1OjM1NiIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibWFzayI6IFsKICAgICAgICAiNzU6MzYxIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJEcmF3TWFza09uSW1hZ2UiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiRHJhdyBNYXNrIE9uIEltYWdlIgogICAgfQogIH0sCiAgIjc1OjM1OSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJpbWFnZXMiOiBbCiAgICAgICAgIjc1OjM1OCIsCiAgICAgICAgMAogICAgICBdCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiUHJldmlld0ltYWdlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlByZXZpZXcgSW1hZ2UiCiAgICB9CiAgfSwKICAiNzU6MzYxIjogewogICAgImlucHV0cyI6IHsKICAgICAgIm1hc2siOiBbCiAgICAgICAgIjc1OjM1NzoyNjMiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIkludmVydE1hc2siLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiSW52ZXJ0TWFzayIKICAgIH0KICB9LAogICI3NTozNjU6MzYyIjogewogICAgImlucHV0cyI6IHsKICAgICAgImNvbmRpdGlvbmluZyI6IFsKICAgICAgICAiNzU6MzMxOjMxOSIsCiAgICAgICAgMAogICAgICBdLAogICAgICAibGF0ZW50IjogWwogICAgICAgICI3NTozNjU6MzYzIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJSZWZlcmVuY2VMYXRlbnQiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiUmVmZXJlbmNlTGF0ZW50IgogICAgfQogIH0sCiAgIjc1OjM2NTozNjMiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAicGl4ZWxzIjogWwogICAgICAgICI3NTozNTgiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgInZhZSI6IFsKICAgICAgICAiNzU6NzIiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlZBRUVuY29kZSIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJWQUUgRW5jb2RlIgogICAgfQogIH0sCiAgIjc1OjM2NTozNjQiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAiY29uZGl0aW9uaW5nIjogWwogICAgICAgICI3NTozMzE6MzIxIiwKICAgICAgICAwCiAgICAgIF0sCiAgICAgICJsYXRlbnQiOiBbCiAgICAgICAgIjc1OjM2NTozNjMiLAogICAgICAgIDAKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIlJlZmVyZW5jZUxhdGVudCIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICJSZWZlcmVuY2VMYXRlbnQiCiAgICB9CiAgfQp9").decode("utf-8")
SHARP_WORKFLOW_RAW = base64.b64decode("ewogICIxIjogewogICAgImlucHV0cyI6IHsKICAgICAgImltYWdlIjogIkZsdXgyLUtsZWluXzAwMzU5Xy5wbmciCiAgICB9LAogICAgImNsYXNzX3R5cGUiOiAiTG9hZEltYWdlIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIkxvYWQgSW1hZ2UiCiAgICB9CiAgfSwKICAiMiI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJwcmVjaXNpb24iOiAiYXV0byIKICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJMb2FkU2hhcnBNb2RlbCIsCiAgICAiX21ldGEiOiB7CiAgICAgICJ0aXRsZSI6ICIoRG93bilMb2FkIFNIQVJQIE1vZGVsIgogICAgfQogIH0sCiAgIjQiOiB7CiAgICAiaW5wdXRzIjogewogICAgICAicHJldmlld19nYXVzc2lhbiI6ICIiLAogICAgICAicGx5X3BhdGgiOiBbCiAgICAgICAgIjUiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgImV4dHJpbnNpY3MiOiBbCiAgICAgICAgIjUiLAogICAgICAgIDEKICAgICAgXSwKICAgICAgImludHJpbnNpY3MiOiBbCiAgICAgICAgIjUiLAogICAgICAgIDIKICAgICAgXQogICAgfSwKICAgICJjbGFzc190eXBlIjogIkdlb21QYWNrUHJldmlld0dhdXNzaWFuIiwKICAgICJfbWV0YSI6IHsKICAgICAgInRpdGxlIjogIlByZXZpZXcgR2F1c3NpYW4iCiAgICB9CiAgfSwKICAiNSI6IHsKICAgICJpbnB1dHMiOiB7CiAgICAgICJmb2NhbF9sZW5ndGhfbW0iOiAzNSwKICAgICAgIm91dHB1dF9wcmVmaXgiOiAic2hhcnAiLAogICAgICAibW9kZWwiOiBbCiAgICAgICAgIjIiLAogICAgICAgIDAKICAgICAgXSwKICAgICAgImltYWdlIjogWwogICAgICAgICIxIiwKICAgICAgICAwCiAgICAgIF0KICAgIH0sCiAgICAiY2xhc3NfdHlwZSI6ICJTaGFycFByZWRpY3QiLAogICAgIl9tZXRhIjogewogICAgICAidGl0bGUiOiAiU0hBUlAgUHJlZGljdCAoSW1hZ2UgdG8gUExZKSIKICAgIH0KICB9Cn0=").decode("utf-8")


def load_workflows():
    global FLUX_WORKFLOW_RAW, SHARP_WORKFLOW_RAW
    flux_candidates = [
        "/root/ComfyUI_Workflows/flux-studio-app-World-Cup.json",
        "ComfyUI_Workflows/flux-studio-app-World-Cup.json",
        "/ComfyUI_Workflows/flux-studio-app-World-Cup.json"
    ]
    sharp_candidates = [
        "/root/ComfyUI_Workflows/sharp_basic.json",
        "ComfyUI_Workflows/sharp_basic.json",
        "/ComfyUI_Workflows/sharp_basic.json"
    ]
    
    for path in flux_candidates:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    FLUX_WORKFLOW_RAW = f.read()
                print(f"Loaded FLUX workflow from: {path}")
                break
            except Exception as e:
                print(f"Failed to load FLUX path {path}: {e}")
                
    for path in sharp_candidates:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    SHARP_WORKFLOW_RAW = f.read()
                print(f"Loaded SHARP workflow from: {path}")
                break
            except Exception as e:
                print(f"Failed to load SHARP path {path}: {e}")

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
    seed = random.randint(1, 10**15)
    try:
        # Spawn job asynchronously in the background on Modal
        call = worker.process.spawn(
            user_img_bytes, 
            kit_img_bytes, 
            seed, 
            req.prompt_override, 
            FLUX_WORKFLOW_RAW
        )
        return {"status": "pending", "job_id": call.object_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to spawn FLUX job: {str(e)}")

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
        # Spawn job asynchronously in the background on Modal
        call = worker.process.spawn(img_bytes, SHARP_WORKFLOW_RAW)
        return {"status": "pending", "job_id": call.object_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to spawn SHARP job: {str(e)}")

@web_app.get("/api/job-status/{job_id}")
async def job_status(job_id: str):
    try:
        call = modal.FunctionCall.from_id(job_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid job ID: {str(e)}")

    try:
        # Non-blocking get check with a very short timeout
        result = await call.get.aio(timeout=0.1)
    except TimeoutError:
        return {"status": "pending"}
    except asyncio.TimeoutError:
        return {"status": "pending"}
    except Exception as e:
        return {"status": "failed", "error": str(e)}

    # Process and return the results based on type
    try:
        if isinstance(result, bytes):
            # 2D Generation finished, return base64 images (detecting format prefix)
            mime = "image/png"
            if len(result) > 4:
                if result[:3] == b"\xff\xd8\xff":
                    mime = "image/jpeg"
                elif result[:4] == b"RIFF" and result[8:12] == b"WEBP":
                    mime = "image/webp"
            img_b64 = f"data:{mime};base64," + base64.b64encode(result).decode("utf-8")
            return {
                "status": "completed",
                "result": {"images": [img_b64]}
            }
        elif isinstance(result, str):
            # 3D Generation finished, return the PLY file directly
            shared_filename = result
            filepath = f"/shared/{shared_filename}"
            
            # NFS propagation wait loop (wait up to 5s for files to sync across Modal containers)
            for _ in range(10):
                if os.path.exists(filepath):
                    break
                await asyncio.sleep(0.5)

            if not os.path.exists(filepath):
                raise Exception("Generated 3D PLY file not found on NetworkFileSystem.")

            return {
                "status": "completed",
                "result": {
                    "plyUrl": f"/api/download-3d/{shared_filename}",
                    "filename": shared_filename
                }
            }
        else:
            raise Exception("Unknown result type from job worker.")
    except Exception as e:
        return {"status": "failed", "error": f"Post-processing failed: {str(e)}"}

@web_app.get("/api/download-3d/{filename}")
def download_3d(filename: str):
    """Streams the model file (.ply) from the shared NetworkFileSystem."""
    filepath = f"/shared/{filename}"
    
    # NFS propagation wait loop (wait up to 5s for files to sync across Modal containers)
    import time
    for _ in range(10):
        if os.path.exists(filepath):
            break
        time.sleep(0.5)
        
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="3D model file not found.")
    try:
        with open(filepath, "rb") as f:
            file_bytes = f.read()
        return Response(
            content=file_bytes,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f"inline; filename={filename}",
                "Cache-Control": "public, max-age=3600",
                "Content-Length": str(len(file_bytes)),
                "Access-Control-Expose-Headers": "Content-Length, Content-Disposition",
                "Content-Encoding": "identity"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load 3D model: {str(e)}")

@app.function(
    image=image,
    network_file_systems={"/shared": nfs}
)
@modal.asgi_app()
def serve():
    return web_app
