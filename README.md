# FanStudio - World Cup 2026

An Interactive Generative 3D Fan Experience for the FIFA World Cup 2026. Fans can select their favorite team, capture a selfie, generate a cinematic 2D kit look avatar (FLUX + SAM 3), and convert their favorite look into an interactive 3D Gaussian Splat (SHARP).

The web application features a premium deep-indigo glassmorphic interface, official team logos, and high-fidelity 3D garment previews generated locally.


---

## 🚀 Key Features

1. **Premium Redesigned UI**: A sleek dark hybrid layout with glowing ambient neon gradients, subtle dot-grid backdrops, custom webkit scrollbars, and fluid transitions.
2. **Double-Pane Team Selector**: An interactive split view featuring:
   - **Left side**: A searchable, scrollable grid of participating national teams, each displaying their official crest logo and group stage details.
   - **Right side**: A detailed team card highlighting kit colors and a **Premium Garment Preview** loaded dynamically.
3. **ComfyUI-Powered Previews**: Automated script to generate high-fidelity, studio-quality 3D jersey mockups for every team, removing the need for low-res reference photos.
4. **Selfie Capture & Flat Gen**: Seamless capture via user webcam, passing image data to a custom ComfyUI FLUX pipeline to output personalized fan avatars wearing the team's official jersey.
5. **3D Splat Studio**: Volumetric reconstruction converting 2D avatars into interactive 3D Gaussian Splats (.splat format) loaded directly in the browser using Three.js / `@react-three/drei`.

---

## 🛠️ Utility & Automation Scripts

We have created several Python helper scripts under `scripts/` to automate the setup of the dataset assets and pipeline inputs:

### 1. Logo Scraper (`fetch_logos.py`)
Fetches high-quality official team logos/crests for all 48 participating countries from the web:
```bash
python scripts/fetch_logos.py
```
*Features multi-page pagination scanning and a keyword-based scoring algorithm to avoid site placeholders.*

### 2. Alpha Cleaner (`convert_logos_to_jpg.py`)
Converts transparent team crests into RGB JPGs on a solid white background:
```bash
python scripts/convert_logos_to_jpg.py
```
*Solves alpha-channel errors and noise artifacts during Flux image conditioning.*

### 3. Premium Studio Preview Generator (`generate_previews.py`)
Automates the local ComfyUI workflow to generate the premium mockups for all 48 teams:
```bash
python scripts/generate_previews.py
```
*Reads parameters from [Garment-WorldCup-Logo.json](file:///d:/Work/World-Cup-Kits-Tryon/FanStudio---World-Cup-Tryon/ComfyUI_Workflows/Garment-WorldCup-Logo.json), uploads assets, queues prompt tasks, and downloads output files directly to `public/garments/`. Features automatic resume support.*


---

## 💻 Local Development Setup

To run the application locally on your machine with a local GPU:

### Step A: Start ComfyUI
1. Make sure your local ComfyUI instance is running.
2. By default, the application expects it at `http://127.0.0.1:8188`.

### Step B: Run the local Python FastAPI server
1. Open a new terminal in the project directory.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn requests pillow pydantic bs4
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

## ☁️ Serverless Modal Deployment

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
Since FLUX and SAM checkpoints are very large, upload only the specific 5 models required for this project's workflows:

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

### Step D: Update Frontend API target
To point the frontend to your deployed Modal instance:
1. Open [src/config.ts](file:///d:/Work/World-Cup-Kits-Tryon/FanStudio---World-Cup-Tryon/src/config.ts).
2. Change the default backend target, or set the environment variable:
   ```bash
   $env:NEXT_PUBLIC_API_URL="https://your-username--fanstudio-worldcup-2026-serve.modal.run"
   npm run dev
   ```
