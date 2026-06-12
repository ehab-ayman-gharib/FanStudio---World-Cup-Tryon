"use client";

import React, { useState, useEffect, useRef } from "react";
import { Download, Box, RotateCcw, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "../config";

interface GenerationGridProps {
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

export default function GenerationGrid({
  userImage,
  selectedTeam,
  onView3D,
  onRestart,
}: GenerationGridProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaderMessage, setLoaderMessage] = useState(LOADER_MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
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
      <div className="w-full max-w-md mx-auto bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 min-h-[400px]">
        {/* Glowing loader orb */}
        <div className="relative w-20 h-20">
          <div
            className="absolute inset-0 rounded-full opacity-30 blur-md animate-ping"
            style={{ backgroundColor: primaryColor }}
          />
          <div
            className="w-full h-full rounded-full border-4 border-zinc-800 border-t-emerald-500 animate-spin"
            style={{ borderTopColor: primaryColor }}
          />
        </div>
        
        <div className="text-center flex flex-col gap-1.5">
          <h3 className="text-white font-bold text-lg tracking-wide uppercase">
            Tailoring Outfits
          </h3>
          <p className="text-zinc-400 text-sm italic font-medium">
            "{loaderMessage}"
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-white font-bold text-lg">Inference Error</h3>
          <p className="text-zinc-400 text-xs mt-2 px-4 leading-relaxed">
            {error}
          </p>
        </div>
        <button
          onClick={onRestart}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-2xl border border-zinc-700 transition-all text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="w-full max-w-3xl mx-auto flex flex-col md:flex-row gap-8 items-center justify-center animate-fade-in">
        {/* Single Large Preview */}
        <div className="w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden border-2 shadow-2xl relative"
             style={{ borderColor: primaryColor, boxShadow: `0 0 25px ${primaryColor}15` }}>
          <img
            src={images[0]}
            alt="Generated 2D kit look"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Action Pane */}
        <div className="w-full md:w-80 flex flex-col gap-5 bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-6 backdrop-blur-xl">
          <div>
            <h2 className="text-xl font-black text-white">Your 2D Look</h2>
            <p className="text-zinc-400 text-xs mt-1">
              Successfully generated your {selectedTeam.name} kit avatar!
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleView3D}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm cursor-pointer"
            >
              <Box className="w-4 h-4" />
              View in 3D Studio
            </button>

            <button
              onClick={downloadSelected}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700 transition-all text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download flat 2D
            </button>
          </div>

          <div className="border-t border-zinc-800 pt-3">
            <button
              onClick={onRestart}
              className="w-full text-zinc-500 hover:text-zinc-300 font-medium py-1 text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-8 items-start">
      {/* 2x2 Grid View */}
      <div className="flex-1 w-full flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Your 2D Photo Gallery</h2>
          <p className="text-zinc-400 text-xs mt-1">
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
                className={`relative aspect-[3/4] rounded-2xl overflow-hidden border bg-zinc-950 transition-all duration-300 ${
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
                    : { borderColor: "#27272a" }
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
                    ? "bg-emerald-500 text-zinc-950 border-emerald-500 shadow-md"
                    : "bg-black/60 text-white border-zinc-700"
                }`}>
                  {idx + 1}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Image Action Pane */}
      <div className="w-full md:w-80 flex flex-col gap-5 bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-5 backdrop-blur-xl">
        <h3 className="text-white font-bold text-sm tracking-wide uppercase border-b border-zinc-800 pb-2">
          Selected Look Details
        </h3>

        {selectedIdx !== null && images[selectedIdx] ? (
          <div className="flex flex-col gap-4">
            <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-800">
              <img
                src={images[selectedIdx]}
                alt="Selected preview"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleView3D}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm"
              >
                <Box className="w-4 h-4" />
                View in 3D Studio
              </button>

              <button
                onClick={downloadSelected}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700 transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                Download flat 2D
              </button>
            </div>
          </div>
        ) : (
          <div className="text-zinc-500 text-center py-12 text-xs">
            No look selected. Click on a gallery option.
          </div>
        )}

        <div className="border-t border-zinc-800 pt-3">
          <button
            onClick={onRestart}
            className="w-full text-zinc-500 hover:text-zinc-300 font-medium py-1 text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Start Over
          </button>
        </div>
      </div>
    </div>
  );
}
