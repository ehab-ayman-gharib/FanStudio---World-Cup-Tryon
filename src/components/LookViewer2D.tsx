"use client";
 
import React, { useState, useEffect, useRef } from "react";
import { Download, Box, RotateCcw, AlertTriangle, ZoomIn, X, ArrowLeft } from "lucide-react";
import { API_BASE_URL } from "../config";
 
interface LookViewer2DProps {
  userImage: string;
  selectedTeam: {
    id: string;
    name: string;
    filename: string;
    theme: {
      colors: string[];
    };
  };
  onView3D: (selected2DImage: string) => void;
  onRestart: () => void;
}
 
const LOADER_MESSAGES = [
  "Pitch is getting ready...",
  "Ironing your national team crest...",
  "Tailoring your official jersey...",
  "Lacing up your soccer boots...",
  "Turning on stadium floodlights...",
  "Positioning fans in the stands...",
  "Getting ready to step on the field..."
];
 
export default function LookViewer2D({
  userImage,
  selectedTeam,
  onView3D,
  onRestart,
}: LookViewer2DProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaderMessage, setLoaderMessage] = useState(LOADER_MESSAGES[0]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({
    transformOrigin: "center center",
    transform: "scale(1)",
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;

    setZoomStyle({
      transformOrigin: `${x}% ${y}%`,
      transform: "scale(1.25)",
    });
  };

  const handleMouseLeave = () => {
    setZoomStyle({
      transformOrigin: "center center",
      transform: "scale(1)",
    });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
      const x = ((touch.clientX - left) / width) * 100;
      const y = ((touch.clientY - top) / height) * 100;

      setZoomStyle({
        transformOrigin: `${x}% ${y}%`,
        transform: "scale(1.35)",
      });
    }
  };

  const handleTouchEnd = () => {
    setZoomStyle({
      transformOrigin: "center center",
      transform: "scale(1)",
    });
  };

  const hasTriggered = useRef(false);
 
  // Cycle loader messages
  useEffect(() => {
    if (!loading) return;
    let messageIdx = 0;
    const interval = setInterval(() => {
      messageIdx = (messageIdx + 1) % LOADER_MESSAGES.length;
      setLoaderMessage(LOADER_MESSAGES[messageIdx]);
    }, 3500);
    return () => clearInterval(interval);
  }, [loading]);

  // Simulated progress timer for soccer ball spray animation
  useEffect(() => {
    if (!loading) return;
    setProgress(0);
    const startTime = Date.now();
    const duration = 14000; // 14s simulated progress target
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const computed = Math.min(95, Math.round((elapsed / duration) * 100));
      setProgress(computed);
    }, 100);
    return () => clearInterval(interval);
  }, [loading]);
 
  // Helper to convert image URL to base64 on frontend
  const imageUrlToBase64 = async (url: string): Promise<string> => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };
 
  // Call generation API on mount
  useEffect(() => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;
 
    async function triggerGeneration() {
      try {
        setLoading(true);
        setError(null);
 
        // Convert kit reference image to base64 on client
        let kitB64 = "";
        try {
          const kitUrl = `/garments/${selectedTeam.filename}`;
          kitB64 = await imageUrlToBase64(kitUrl);
        } catch (e: any) {
          throw new Error(`Failed to load kit reference image: ${e.message}`);
        }
 
        const response = await fetch(`${API_BASE_URL}/api/generate-2d`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_image: userImage,
            kit_image: kitB64,
            num_variations: 1,
          }),
        });
 
        if (!response.ok) {
          const detail = await response.json().catch(() => ({ detail: "Unknown server error" }));
          throw new Error(detail.detail || "Generation failed");
        }
 
        const data = await response.json();
        const jobId = data.job_id;
        if (!jobId) {
          throw new Error("No job ID returned from server.");
        }
 
        // Poll for completion
        let completed = false;
        let attempts = 0;
        const maxAttempts = 180; // 6 minutes max
        let resultImages: string[] = [];
 
        while (!completed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          attempts++;
 
          const statusRes = await fetch(`${API_BASE_URL}/api/job-status/${jobId}`);
          if (!statusRes.ok) {
            const statusDetail = await statusRes.json().catch(() => ({ detail: "Failed to poll status" }));
            throw new Error(statusDetail.detail || "Failed to query status");
          }
 
          const statusData = await statusRes.json();
          if (statusData.status === "completed") {
            completed = true;
            resultImages = statusData.result.images || [];
            setProgress(100);
          } else if (statusData.status === "failed") {
            throw new Error(statusData.error || "Generation pipeline failed");
          }
        }
 
        if (!completed) {
          throw new Error("Generation request timed out. Please try again.");
        }
 
        setImages(resultImages);
        if (resultImages.length > 0) {
          setSelectedIdx(0);
        }
      } catch (err: any) {
        console.error("2D Generation Error:", err);
        setError(err.message || "Failed to connect to backend server. Make sure the API is running.");
      } finally {
        setLoading(false);
      }
    }
 
    triggerGeneration();
  }, [userImage, selectedTeam]);
 
  const downloadSelected = () => {
    if (selectedIdx === null || !images[selectedIdx]) return;
    const link = document.createElement("a");
    link.href = images[selectedIdx];
    link.download = `fanstudio_flux_${selectedTeam.id}_${selectedIdx + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
 
  const handleView3D = () => {
    if (selectedIdx !== null && images[selectedIdx]) {
      onView3D(images[selectedIdx]);
    }
  };
 
  const primaryColor = selectedTeam.theme.colors[0] || "#00F0FF";
  const teamCode = selectedTeam.name.substring(0, 3).toUpperCase();

  // Circle radius and circumference for SVG progress
  const radius = 40;
  const circumference = 2 * Math.PI * radius; // 251.2
  const strokeDashoffset = circumference - (circumference * progress) / 100;
  
  // Calculate spray nozzle position
  const angle = (progress / 100) * 360 * (Math.PI / 180) - Math.PI / 2;
  const nozzleX = 50 + radius * Math.cos(angle);
  const nozzleY = 50 + radius * Math.sin(angle);
 
  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
        {/* 1. BRAND TOP BAR */}
        <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
          <div className="flex justify-start">
            <button
              onClick={onRestart}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
              title="Cancel and restart"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
            FANSTUDIO
          </span>
          <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
            STEP 03/04
          </div>
        </div>

        {/* 2. STEP INDICATORS */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase border-b border-[#282d34]/60 pb-4">
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">01 TEAM</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">02 CAPTURE</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">03 PHOTO</span>
            <div className="h-1.5 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-slate-500">04 3D</span>
            <div className="h-1 bg-[#282d34] rounded-full" />
          </div>
        </div>

        {/* 3. SOCCER VANISHING SPRAY LOADING INTERFACE */}
        <div className="w-full max-w-md mx-auto bg-gradient-to-b from-[#162a1b] to-[#0e1811] border-2 border-[#243e2a] rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center gap-8 min-h-[460px] relative overflow-hidden dot-grid">
          
          {/* Subtle field markings in background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03)_0%,transparent_70%)] pointer-events-none" />
          <div className="absolute -left-20 top-1/2 w-40 h-40 border-2 border-white/5 rounded-full pointer-events-none" />
          <div className="absolute -right-20 top-1/2 w-40 h-40 border-2 border-white/5 rounded-full pointer-events-none" />

          {/* Core Spraying Animation Canvas */}
          <div className="relative w-48 h-48 flex items-center justify-center">
            
            {/* SVG circle track, spray trail, and nozzle */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
              {/* Ground spray guide track */}
              <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="5" fill="none" />
              
              {/* Blurred under-glow of spray line */}
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#FFFFFF"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                className="blur-sm opacity-25 transition-all duration-150"
              />

              {/* Fuzzy white foaming spray progress circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke="#FFFFFF"
                strokeWidth="6"
                strokeDasharray="2 4"
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
                className="transition-all duration-150 filter drop-shadow-[0_0_2px_rgba(255,255,255,0.8)]"
              />

              {/* Nozzle projection line and spray particles emitter node */}
              <g className="transition-all duration-150">
                <circle cx={nozzleX} cy={nozzleY} r="3" fill="#ADFF00" className="animate-ping" />
                <circle cx={nozzleX} cy={nozzleY} r="1.5" fill="#FFFFFF" />
              </g>
            </svg>

            {/* Classic Soccer Ball SVG in the center */}
            <div className="relative z-10 w-28 h-28 animate-pulse-glow">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.65)]">
                {/* White leather base */}
                <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke="#0e1811" strokeWidth="2.5" />
                
                {/* Center Pentagons */}
                <polygon points="50,38 60,45 56,57 44,57 40,45" fill="#0e1811" />
                
                {/* Outer Seams */}
                <line x1="50" y1="38" x2="50" y2="22" stroke="#0e1811" strokeWidth="2.5" />
                <line x1="60" y1="45" x2="73" y2="40" stroke="#0e1811" strokeWidth="2.5" />
                <line x1="56" y1="57" x2="66" y2="70" stroke="#0e1811" strokeWidth="2.5" />
                <line x1="44" y1="57" x2="34" y2="70" stroke="#0e1811" strokeWidth="2.5" />
                <line x1="40" y1="45" x2="27" y2="40" stroke="#0e1811" strokeWidth="2.5" />

                {/* hex segment lines */}
                <polygon points="50,22 62,10 74,18 73,40 60,45" fill="none" stroke="#0e1811" strokeWidth="2.5" />
                <polygon points="50,22 38,10 26,18 27,40 40,45" fill="none" stroke="#0e1811" strokeWidth="2.5" />
                <polygon points="73,40 88,48 82,66 66,70 56,57" fill="none" stroke="#0e1811" strokeWidth="2.5" />
                <polygon points="27,40 12,48 18,66 34,70 44,57" fill="none" stroke="#0e1811" strokeWidth="2.5" />
                <polygon points="66,70 60,86 40,86 34,70" fill="none" stroke="#0e1811" strokeWidth="2.5" />

                {/* Peripheral shaded parts */}
                <polygon points="62,10 50,4 38,10 50,15" fill="#0e1811" stroke="#0e1811" strokeWidth="1" />
                <polygon points="88,48 95,60 82,66" fill="#0e1811" stroke="#0e1811" strokeWidth="1" />
                <polygon points="12,48 5,60 18,66" fill="#0e1811" stroke="#0e1811" strokeWidth="1" />
                <polygon points="60,86 50,96 40,86 50,80" fill="#0e1811" stroke="#0e1811" strokeWidth="1" />
              </svg>
            </div>
            
            {/* Micro foam bubbles floating around */}
            <div className="absolute top-4 left-6 w-2 h-2 rounded-full bg-white/40 animate-ping" />
            <div className="absolute bottom-8 right-8 w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: '1s' }} />
          </div>
          
          <div className="text-center flex flex-col gap-2.5 z-10">
            <h3 className="text-white font-headline text-3xl tracking-wider uppercase animate-neon-green">
              TAILORING OUTFITS
            </h3>
            <p className="text-[#ADFF00] font-label text-[10px] tracking-widest uppercase">
              SPRAYING FOAM... {progress}%
            </p>
            <p className="text-slate-400 text-xs italic font-body font-medium px-4 h-8 mt-1">
              "{loaderMessage}"
            </p>
          </div>
        </div>
      </div>
    );
  }
 
  if (error) {
    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
        {/* 1. BRAND TOP BAR */}
        <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
          <div className="flex justify-start">
            <button
              onClick={onRestart}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
              title="Restart"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
            FANSTUDIO
          </span>
          <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
            STEP 03/04
          </div>
        </div>

        {/* 2. STEP INDICATORS */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase border-b border-[#282d34]/60 pb-4">
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">01 TEAM</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">02 CAPTURE</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">03 PHOTO</span>
            <div className="h-1.5 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-slate-500">04 3D</span>
            <div className="h-1 bg-[#282d34] rounded-full" />
          </div>
        </div>

        <div className="w-full max-w-md mx-auto bg-[#1b1e22]/90 border border-[#282d34] rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center animate-fade-in-up min-h-[460px]">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-headline text-xl uppercase tracking-wider">INFERENCE ERROR</h3>
            <p className="text-slate-400 text-xs mt-2 px-4 leading-relaxed font-body">
              {error}
            </p>
          </div>
          <button
            onClick={onRestart}
            className="w-full bg-[#1b1e22] hover:bg-[#1b1e22]/80 text-white font-headline tracking-wide uppercase py-3.5 rounded-2xl border border-[#282d34] transition-all text-xs cursor-pointer"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }
 
  if (images.length === 1) {
    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
        {/* 1. BRAND TOP BAR */}
        <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
          <div className="flex justify-start">
            <button
              onClick={onRestart}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
              title="Restart"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
            FANSTUDIO
          </span>
          <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
            STEP 03/04
          </div>
        </div>

        {/* 2. STEP INDICATORS */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase border-b border-[#282d34]/60 pb-4">
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">01 TEAM</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">02 CAPTURE</span>
            <div className="h-1 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-[#ADFF00]">03 PHOTO</span>
            <div className="h-1.5 bg-[#ADFF00] rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <span className="text-slate-500">04 3D</span>
            <div className="h-1 bg-[#282d34] rounded-full" />
          </div>
        </div>

        {/* MAIN HUD LAYOUT CONTENT */}
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center animate-fade-in relative mt-2">
          
          {/* Portrait Photo Viewport with Kiosk HUD guide framing with hover zoom-and-pan */}
          <div className="w-full max-w-sm aspect-[3/4] rounded-[32px] overflow-hidden border-2 shadow-2xl relative bg-[#121417] flex flex-col justify-between cursor-zoom-in group"
               style={{ borderColor: primaryColor, boxShadow: `0 0 30px ${primaryColor}20` }}
               onMouseMove={handleMouseMove}
               onMouseLeave={handleMouseLeave}
               onTouchStart={handleTouchMove}
               onTouchMove={handleTouchMove}
               onTouchEnd={handleTouchEnd}>
            
            {/* Zoom hint overlay indicator, disappears on hover */}
            <div className="absolute top-3 right-3 bg-[#121417]/80 border border-[#282d34] p-2 rounded-xl text-slate-400 group-hover:opacity-0 transition-opacity z-20 pointer-events-none shadow-sm">
              <ZoomIn className="w-4 h-4 text-[#ADFF00]" />
            </div>
   
            {/* HUD CORNER BRACKETS */}
            <div className="absolute inset-4 border border-white/5 pointer-events-none z-10 rounded-2xl">
              {/* Top-Left Bracket */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#ADFF00]" />
              {/* Top-Right Bracket */}
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#ADFF00]" />
              {/* Bottom-Left Bracket */}
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#ADFF00]" />
              {/* Bottom-Right Bracket */}
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#ADFF00]" />
            </div>

            {/* Core Generated Look Image */}
            <img
              src={images[0]}
              alt="Generated kit look"
              className="w-full h-full object-cover relative z-0 transition-transform"
              style={{
                ...zoomStyle,
                objectPosition: "top",
                transition: zoomStyle.transform === "scale(1)"
                  ? "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
                  : "transform 0.08s ease-out"
              }}
            />
          </div>
   
          {/* Action Control Panel */}
          <div className="w-full md:w-80 flex flex-col gap-5 bg-[#1b1e22]/90 border border-[#282d34] rounded-[32px] p-6 backdrop-blur-xl shadow-xl">
            <div>
              <h2 className="text-2xl font-headline tracking-wider text-white uppercase leading-none">YOUR MATCHDAY LOOK</h2>
              <p className="text-slate-500 text-xs mt-2 font-body leading-relaxed">
                Successfully generated your {selectedTeam.name} kit avatar!
              </p>
            </div>
   
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleView3D}
                className="w-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-xs font-black cursor-pointer"
              >
                <Box className="w-4 h-4" />
                VIEW IN 3D STUDIO
              </button>
   
              <button
                onClick={downloadSelected}
                className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-400" />
                DOWNLOAD PHOTO
              </button>
            </div>
   
            <div className="border-t border-[#282d34] pt-3">
              <button
                onClick={onRestart}
                className="w-full text-slate-500 hover:text-[#FF007A] font-label font-bold py-1 text-[10px] tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                START OVER
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
 
  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
      {/* 1. BRAND TOP BAR */}
      <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
        <div className="flex justify-start">
          <button
            onClick={onRestart}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
            title="Restart"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
          FANSTUDIO
        </span>
        <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
          STEP 03/04
        </div>
      </div>

      {/* 2. STEP INDICATORS */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase border-b border-[#282d34]/60 pb-4">
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[#ADFF00]">01 TEAM</span>
          <div className="h-1 bg-[#ADFF00] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[#ADFF00]">02 CAPTURE</span>
          <div className="h-1 bg-[#ADFF00] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[#ADFF00]">03 PHOTO</span>
          <div className="h-1.5 bg-[#ADFF00] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-slate-500">04 3D</span>
          <div className="h-1 bg-[#282d34] rounded-full" />
        </div>
      </div>

      {/* MULTIPLE IMAGE VARIATIONS GRID VIEW */}
      <div className="flex flex-col gap-6 items-center mt-2">
        <div className="w-full text-center">
          <h2 className="text-3xl font-headline tracking-wider text-white uppercase leading-none">YOUR PHOTO GALLERY</h2>
          <p className="text-slate-500 text-xs mt-2.5 font-body">
            Choose your favorite look to view as a 3D volumetric splat.
          </p>
        </div>
 
        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          {images.map((img, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <button
                key={idx}
                onClick={() => setSelectedIdx(idx)}
                className={`relative aspect-[3/4] rounded-[24px] overflow-hidden border bg-[#121417] transition-all duration-300 ${
                  isSelected
                    ? "scale-[1.02] shadow-2xl"
                    : "opacity-75 hover:opacity-100 hover:scale-[1.01]"
                }`}
                style={
                  isSelected
                    ? {
                        border: `2px solid ${primaryColor}`,
                        boxShadow: `0 0 20px ${primaryColor}25`,
                      }
                    : { borderColor: "#282d34" }
                }
              >
                {/* HUD CORNER BRACKETS (Small version inside grid option) */}
                <div className="absolute inset-2 border border-white/5 pointer-events-none z-10 rounded-xl">
                  <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#ADFF00]" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#ADFF00]" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#ADFF00]" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#ADFF00]" />
                </div>

                <img
                  src={img}
                  alt={`Variation ${idx + 1}`}
                  className="w-full h-full object-cover object-top"
                />
                
                {/* Image selection badge */}
                <div className={`absolute bottom-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center border transition-all text-[10px] font-label font-bold ${
                  isSelected
                    ? "bg-[#ADFF00] text-[#121417] border-[#ADFF00] shadow-md"
                    : "bg-[#121417]/80 text-slate-300 border-[#282d34] shadow-sm"
                }`}>
                  {idx + 1}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Image Action Pane */}
        <div className="w-full max-w-md flex flex-col gap-5 bg-[#1b1e22]/95 border border-[#282d34] rounded-[32px] p-5 backdrop-blur-xl shadow-xl animate-fade-in-up">
          <h3 className="text-slate-400 font-label font-bold text-[10px] tracking-wider uppercase border-b border-[#282d34] pb-2">
            SELECTED LOOK DETAILS
          </h3>
   
          {selectedIdx !== null && images[selectedIdx] ? (
            <div className="flex flex-col gap-4">
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-[#282d34] cursor-zoom-in group"
                   onMouseMove={handleMouseMove}
                   onMouseLeave={handleMouseLeave}
                   onTouchStart={handleTouchMove}
                   onTouchMove={handleTouchMove}
                   onTouchEnd={handleTouchEnd}>
                
                {/* Zoom hint overlay indicator, disappears on hover */}
                <div className="absolute top-3 right-3 bg-[#121417]/80 border border-[#282d34] p-2 rounded-xl text-slate-400 group-hover:opacity-0 transition-opacity z-20 pointer-events-none shadow-sm">
                  <ZoomIn className="w-4 h-4 text-[#ADFF00]" />
                </div>

                {/* HUD CORNER BRACKETS */}
                <div className="absolute inset-3 border border-white/5 pointer-events-none z-10 rounded-xl">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#ADFF00]" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#ADFF00]" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#ADFF00]" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#ADFF00]" />
                </div>
   
                <img
                  src={images[selectedIdx]}
                  alt="Selected preview"
                  className="w-full h-full object-cover transition-transform"
                  style={{
                    ...zoomStyle,
                    objectPosition: "top",
                    transition: zoomStyle.transform === "scale(1)"
                      ? "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
                      : "transform 0.08s ease-out"
                  }}
                />
              </div>
   
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleView3D}
                  className="w-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-xs font-black cursor-pointer"
                >
                  <Box className="w-4 h-4" />
                  VIEW IN 3D STUDIO
                </button>
   
                <button
                  onClick={downloadSelected}
                  className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  DOWNLOAD PHOTO
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center py-12 text-xs font-body">
              No look selected. Click on a gallery option.
            </div>
          )}
   
          <div className="border-t border-[#282d34] pt-3">
            <button
              onClick={onRestart}
              className="w-full text-slate-500 hover:text-[#FF007A] font-label font-bold py-1 text-[10px] tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              START OVER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
