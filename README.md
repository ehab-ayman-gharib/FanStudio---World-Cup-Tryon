# FanStudio - World Cup 2026

An Interactive Generative 3D Fan Experience for the FIFA World Cup 2026. Fans can select their favorite team, capture a selfie, generate a cinematic 2D kit look avatar (FLUX + SAM 3.1), and reconstruct their favorite look into an interactive 3D Gaussian Splat (SHARP) to view in real-time.

The web application features a premium slate/glassmorphic light interface, official team logos, custom webkit scrollbars, and high-fidelity 3D garment previews generated locally.

---

## 🚀 Interactive Screens & Flow

The FanStudio user interface is divided into a 4-step wizard that guides users through the generative pipeline:

### 1. Select Your Team (`TeamSelector`)
* **Searchable Team Grid**: A scrollable, searchable list of participating national teams, showing team crests and group stage assignments.
* **Smart Logo Fallbacks**: Crest logos load dynamically, checking multiple formats (`.jpg`, `.png`, `.webp`, `.svg`, `.jpeg` and capitalized variants) to prevent broken image cards.
* **Premium Garment Preview**: The right side features a premium studio look mockup loaded from `public/garments/`. Hovering over the card activates a **smooth zoom-and-pan magnifying effect** for close-up jersey inspections.
* **Kit Color Palettes**: Displays the official palette colors defined for each nation.

### 2. Identity Capture (`CameraCapture`)
* **Webcam Integration**: Captures selfies directly via the user's web camera (requires HTTPS/localhost).
* **Silhouette Alignment Guide**: Displays a responsive face-contour overlay (silhouette ellipse, neck boundaries, and horizontal eye alignment guidelines) to ensure the user’s portrait aligns perfectly for optimal generative segmentation.
* **Local File Upload**: Allows fallback uploads for PNG, JPG, or WEBP files up to 5MB.
* **Review & Retake**: Instant validation showing preview, with quick-action toggles to retake or confirm.

### 3. 2D Look Generation & Gallery (`LookViewer2D`)
* **ComfyUI FLUX + SAM 3.1 Pipeline**: Transmits the confirmed selfie to ComfyUI. The server uses Segment Anything 3 (SAM) to isolate the user’s clothing and overlays the official national jersey via FLUX image-to-image conditioning.
* **Stadium Loader Messages**: Cycles through immersive status messages (e.g. *"Tailoring your official jersey..."*, *"Ironing your national team crest..."*, *"Lacing up your soccer boots..."*) during backend processing.
* **Look Customizer**: Displays the generated flat 2D avatar inside a custom preview card.
* **Fullscreen Zoom Modal**: An interactive light-box modal expands the portrait to fullscreen on click.
* **Direct PNG Download**: Exports the flat 2D portrait.

### 4. 3D Splat Studio (`Viewport3D`)
* **Apple SHARP Reconstruction**: Converts the selected 2D avatar portrait into an interactive 3D Gaussian Splat.
* **Fast PLY-to-Splat Conversion**: The backend parses the large 3DGS PLY data and converts it into a highly compressed, sorted `.splat` binary format using numpy structured arrays.
* **Three.js / React Three Fiber Renderer**: Renders the volumetric splat directly in the browser via Canvas and `@react-three/drei`'s `Splat` loader.
* **Interactive Control Deck**: Swipe to orbit, drag to rotate, or toggle between 2D and 3D preview modes.
* **Smartphone Gyroscope Parallax**: Mobile visitors can enable gyroscope permissions. Tilting or rotating the phone shifts the camera viewport dynamically, producing a stunning volumetric depth-of-field parallax effect.
* **Splat Downloader**: Download the compiled `.splat` model for standalone spatial players.

---

## 🛠️ Utility & Automation Scripts

We have created several helper scripts under `scripts/` to automate setup and asset preparation:

### 1. Logo Scraper (`fetch_logos.py`)
Scrapes high-quality official team logos/crests for the participating countries:
```bash
python scripts/fetch_logos.py
```

### 2. Alpha Cleaner (`convert_logos_to_jpg.py`)
Converts transparent team crests into RGB JPGs on solid white backdrops:
```bash
python scripts/convert_logos_to_jpg.py
```
*Solves alpha-channel errors and noise artifacts during Flux image conditioning.*

### 3. Premium Studio Preview Generator (`generate_previews.py`)
Automates the local ComfyUI workflow to generate the initial high-fidelity garment mockups for all teams:
```bash
python scripts/generate_previews.py
```
*Uses parameters from [Garment-WorldCup-Logo.json](file:///d:/Work/World-Cup-Kits-Tryon/FanStudio---World-Cup-Tryon/ComfyUI_Workflows/Garment-WorldCup-Logo.json) to upload assets, queue ComfyUI prompts, and download generated WEBP output files directly to `public/garments/`.*

### 4. Splat Analyzer (`analyze_splat.py`)
Inspects binary header layout details and calculates centroid dimensions of generated `.splat` point clouds:
```bash
python scripts/analyze_splat.py
```

---

## 💻 Local Development Setup

To run the application locally on your machine with a local GPU:

### Step A: Start ComfyUI
1. Make sure your local ComfyUI instance is running.
2. By default, the application expects it at `http://127.0.0.1:8188`.

### Step B: Run the local Python FastAPI server
1. Open a new terminal in the project directory.
2. Install Python dependencies (including `numpy` for PLY-to-Splat parsing):
   ```bash
   pip install fastapi uvicorn requests pillow pydantic numpy bs4
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
Upload the 5 specific model files required for the generation workflows:

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
