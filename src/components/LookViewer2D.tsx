"use client";
 
import React, { useState, useEffect, useRef } from "react";
import { Download, Box, RotateCcw, AlertTriangle, ZoomIn, X } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
 
  // Call generation API on mount
  useEffect(() => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;
 
    async function triggerGeneration() {
      try {
        setLoading(true);
        setError(null);
 
        const response = await fetch(`${API_BASE_URL}/api/generate-2d`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: userImage,
            team: selectedTeam.name,
            num_variations: 1,
          }),
        });
 
        if (!response.ok) {
          const detail = await response.json().catch(() => ({ detail: "Unknown server error" }));
          throw new Error(detail.detail || "Generation failed");
        }
 
        const data = await response.json();
        setImages(data.images || []);
        if (data.images && data.images.length > 0) {
          setSelectedIdx(0);
        }
      } catch (err: any) {
        console.error("2D Generation Error:", err);
        setError(err.message || "Failed to connect to backend server. Make sure the local python API is running.");
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
 
  const primaryColor = selectedTeam.theme.colors[0] || "#059669";
 
  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto bg-white/80 border border-slate-200 rounded-3xl p-8 shadow-xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 min-h-[400px]">
        {/* Glowing loader orb */}
        <div className="relative w-20 h-20">
          <div
            className="absolute inset-0 rounded-full opacity-20 blur-md animate-ping"
            style={{ backgroundColor: primaryColor }}
          />
          <div
            className="w-full h-full rounded-full border-4 border-slate-200 border-t-emerald-500 animate-spin"
            style={{ borderTopColor: primaryColor }}
          />
        </div>
        
        <div className="text-center flex flex-col gap-1.5">
          <h3 className="text-slate-900 font-bold text-lg tracking-wide uppercase">
            Tailoring Outfits
          </h3>
          <p className="text-slate-500 text-sm italic font-medium">
            "{loaderMessage}"
          </p>
        </div>
      </div>
    );
  }
 
  if (error) {
    return (
      <div className="w-full max-w-md mx-auto bg-white/80 border border-slate-200 rounded-3xl p-6 shadow-xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-slate-900 font-bold text-lg">Inference Error</h3>
          <p className="text-slate-500 text-xs mt-2 px-4 leading-relaxed">
            {error}
          </p>
        </div>
        <button
          onClick={onRestart}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-3 rounded-2xl border border-slate-200 transition-all text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }
 
  if (images.length === 1) {
    return (
      <div className="w-full max-w-3xl mx-auto flex flex-col md:flex-row gap-8 items-center justify-center animate-fade-in relative">
        {/* Single Large Preview */}
        <div className="w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden border-2 shadow-xl relative"
             style={{ borderColor: primaryColor, boxShadow: `0 0 25px ${primaryColor}15` }}>
          
          {/* Zoom button overlay */}
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute top-3 right-3 bg-white/80 hover:bg-white border border-slate-200/80 p-2.5 rounded-xl text-slate-700 hover:scale-105 transition-all shadow-md cursor-pointer z-10"
            title="Zoom Fullscreen"
          >
            <ZoomIn className="w-4.5 h-4.5" />
          </button>
 
          <img
            src={images[0]}
            alt="Generated 2D kit look"
            className="w-full h-full object-cover"
          />
        </div>
 
        {/* Action Pane */}
        <div className="w-full md:w-80 flex flex-col gap-5 bg-white/80 border border-slate-200 rounded-3xl p-6 backdrop-blur-xl shadow-md">
          <div>
            <h2 className="text-xl font-black text-slate-900">Your 2D Look</h2>
            <p className="text-slate-500 text-xs mt-1">
              Successfully generated your {selectedTeam.name} kit avatar!
            </p>
          </div>
 
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleView3D}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm cursor-pointer"
            >
              <Box className="w-4 h-4" />
              View in 3D Studio
            </button>
 
            <button
              onClick={downloadSelected}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-slate-200 transition-all text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download flat 2D
            </button>
          </div>
 
          <div className="border-t border-slate-100 pt-3">
            <button
              onClick={onRestart}
              className="w-full text-slate-400 hover:text-slate-600 font-medium py-1 text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Start Over
            </button>
          </div>
        </div>
 
        {/* Fullscreen modal zoom overlay */}
        {isFullscreen && (
          <div
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[9999] animate-fade-in cursor-zoom-out"
            onClick={() => setIsFullscreen(false)}
          >
            <div className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2.5 rounded-full text-white transition-all cursor-pointer">
              <X className="w-6 h-6" />
            </div>
            <div
              className="relative max-w-[90vw] max-h-[90vh] aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={images[0]}
                alt="Fullscreen look"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}
      </div>
    );
  }
 
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-8 items-start relative">
      {/* 2x2 Grid View */}
      <div className="flex-1 w-full flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Your 2D Photo Gallery</h2>
          <p className="text-slate-500 text-xs mt-1">
            Choose your favorite look to view as a 3D volumetric splat.
          </p>
        </div>
 
        <div className="grid grid-cols-2 gap-4">
          {images.map((img, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <button
                key={idx}
                onClick={() => setSelectedIdx(idx)}
                className={`relative aspect-[3/4] rounded-2xl overflow-hidden border bg-slate-100 transition-all duration-300 ${
                  isSelected
                    ? "scale-[1.02] shadow-xl shadow-emerald-500/10"
                    : "opacity-75 hover:opacity-100 hover:scale-[1.01]"
                }`}
                style={
                  isSelected
                    ? {
                        border: `2px solid ${primaryColor}`,
                        boxShadow: `0 0 15px ${primaryColor}20`,
                      }
                    : { borderColor: "#e2e8f0" }
                }
              >
                <img
                  src={img}
                  alt={`Variation ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                
                {/* Image selection badge */}
                <div className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center border transition-all text-xs font-bold ${
                  isSelected
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                    : "bg-white/80 text-slate-700 border-slate-200 shadow-sm"
                }`}>
                  {idx + 1}
                </div>
              </button>
            );
          })}
        </div>
      </div>
 
      {/* Selected Image Action Pane */}
      <div className="w-full md:w-80 flex flex-col gap-5 bg-white/80 border border-slate-200 rounded-3xl p-5 backdrop-blur-xl shadow-md">
        <h3 className="text-slate-900 font-bold text-sm tracking-wide uppercase border-b border-slate-100 pb-2">
          Selected Look Details
        </h3>
 
        {selectedIdx !== null && images[selectedIdx] ? (
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-slate-200">
              {/* Zoom button overlay */}
              <button
                onClick={() => setIsFullscreen(true)}
                className="absolute top-2.5 right-2.5 bg-white/80 hover:bg-white border border-slate-200/80 p-2 rounded-lg text-slate-700 hover:scale-105 transition-all shadow-md cursor-pointer z-10"
                title="Zoom Fullscreen"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
 
              <img
                src={images[selectedIdx]}
                alt="Selected preview"
                className="w-full h-full object-cover"
              />
            </div>
 
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleView3D}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm"
              >
                <Box className="w-4 h-4" />
                View in 3D Studio
              </button>
 
              <button
                onClick={downloadSelected}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-slate-200 transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                Download flat 2D
              </button>
            </div>
          </div>
        ) : (
          <div className="text-slate-400 text-center py-12 text-xs">
            No look selected. Click on a gallery option.
          </div>
        )}
 
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={onRestart}
            className="w-full text-slate-400 hover:text-slate-600 font-medium py-1 text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Start Over
          </button>
        </div>
      </div>
 
      {/* Fullscreen modal zoom overlay */}
      {isFullscreen && selectedIdx !== null && images[selectedIdx] && (
        <div
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[9999] animate-fade-in cursor-zoom-out"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2.5 rounded-full text-white transition-all cursor-pointer">
            <X className="w-6 h-6" />
          </div>
          <div
            className="relative max-w-[90vw] max-h-[90vh] aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[selectedIdx]}
              alt="Fullscreen look"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
