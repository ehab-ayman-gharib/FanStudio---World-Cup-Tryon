# FanStudio - World Cup 2026

An Interactive Generative 3D Fan Experience for the FIFA World Cup 2026. Fans can select their favorite team, capture a selfie, generate 4 cinematic 2D kit look variations (FLUX + SAM 3), and convert their favorite look into an interactive 3D Gaussian Splat (SHARP).

---

## 1. Local Development Setup

To run the application locally on your machine with your GPU:

### Step A: Start ComfyUI
1. Make sure your local ComfyUI instance is running.
2. By default, the application expects it at `http://127.0.0.1:8188`.

### Step B: Run the local Python FastAPI server
1. Open a new terminal in the project directory.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn requests pillow pydantic
   ```
3. Run the local API server:
   ```bash
   python scripts/local_api.py
   ```
   *The server will start on `http://localhost:5000`.*

### Step C: Run the Next.js Frontend
1. Open another terminal in the project directory.
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 2. Serverless Modal Deployment

To deploy the backend to Modal (serverless GPU scaling):

### Step A: Install and Authenticate Modal
1. Install modal:
   ```bash
   pip install modal
   ```
2. Authenticate with your Modal account:
   ```bash
   modal setup
   ```

### Step B: Upload Required Model Files
Since FLUX and SAM checkpoints are very large, uploading your entire local `models` directory is not recommended. Instead, run these target commands to upload only the specific 5 models required for this project's workflows:

```bash
# 1. Upload the FLUX.2 Klein UNet model
modal volume put comfy-models E:\ComfyUI\ComfyUI\models\unet\flux-2-klein-9b-fp8.safetensors /unet/flux-2-klein-9b-fp8.safetensors

# 2. Upload the Qwen CLIP text encoder
modal volume put comfy-models E:\ComfyUI\ComfyUI\models\clip\qwen_3_8b_fp4mixed.safetensors /clip/qwen_3_8b_fp4mixed.safetensors

# 3. Upload the FLUX VAE
modal volume put comfy-models E:\ComfyUI\ComfyUI\models\vae\flux2-vae.safetensors /vae/flux2-vae.safetensors

# 4. Upload the SAM 3.1 checkpoint
modal volume put comfy-models E:\ComfyUI\ComfyUI\models\checkpoints\sam3.1_multiplex_fp16.safetensors /checkpoints/sam3.1_multiplex_fp16.safetensors

# 5. Upload the SHARP 3D model
modal volume put comfy-models E:\ComfyUI\ComfyUI\models\sharp\sharp_2572gikvuh.pt /sharp/sharp_2572gikvuh.pt
```

### Step C: Deploy to Modal
Run the deploy command from the project root:
```bash
modal deploy scripts/modal_api.py
```
This will compile the custom container, clone the custom nodes (ControlNet-Aux, KJNodes, ComfyUI-Sharp, Flux2Klein, LayerStyle, RMBG), mount the models volume, and output a live public URL (e.g. `https://your-username--fanstudio-worldcup-2026-serve.modal.run`).

### Step D: Update Frontend API target
To point the frontend to your deployed Modal instance:
1. Open [src/config.ts](file:///d:/Work/World-Cup-Kits-Tryon/FanStudio%20-%20World%20Cup%202026/src/config.ts).
2. Change the default backend target, or set the environment variable:
   ```bash
   $env:NEXT_PUBLIC_API_URL="https://your-username--fanstudio-worldcup-2026-serve.modal.run"
   npm run dev
   ```
