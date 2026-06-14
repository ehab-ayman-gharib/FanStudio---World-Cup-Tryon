"use client";

import React, { useState } from "react";
import TeamSelector from "../components/TeamSelector";
import CameraCapture from "../components/CameraCapture";
import LookViewer2D from "../components/LookViewer2D";
import Viewport3D from "../components/Viewport3D";
import { ShieldAlert, Trophy } from "lucide-react";

interface TeamTheme {
  colors: string[];
  group: string;
}

interface Team {
  id: string;
  name: string;
  filename: string;
  theme: TeamTheme;
}

export default function Home() {
  const [step, setStep] = useState<"team" | "camera" | "gallery" | "3d">("team");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selected2DImage, setSelected2DImage] = useState<string | null>(null);

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    setStep("camera");
  };

  const handleCapture = (image: string) => {
    setCapturedImage(image);
    setStep("gallery");
  };

  const handleView3D = (image: string) => {
    setSelected2DImage(image);
    setStep("3d");
  };

  const handleRestart = () => {
    setStep("team");
    setSelectedTeam(null);
    setCapturedImage(null);
    setSelected2DImage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative overflow-hidden font-sans">
      {/* Background abstract gradients & Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:32px_32px] -z-20" />
      
      {/* Vibrant premium background orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[130px] -z-10 animate-pulse-glow pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[130px] -z-10 animate-pulse-glow pointer-events-none" style={{ animationDelay: '-3s' }} />

      {/* Main Header */}
      <header className="border-b border-slate-200/80 bg-slate-50/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer group" onClick={handleRestart}>
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-2 rounded-xl text-white shadow-md shadow-emerald-500/10 group-hover:scale-105 transition-transform">
              <Trophy className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600">
                FanStudio
              </span>
              <span className="text-[9px] text-emerald-600 font-extrabold tracking-widest uppercase">
                World Cup 2026
              </span>
            </div>
          </div>

          {/* Step indicators */}
          <div className="hidden sm:flex items-center gap-5 text-[10px] font-bold tracking-wider uppercase">
            <span className={`transition-colors duration-300 ${step === "team" ? "text-emerald-600 font-extrabold" : "text-slate-400"}`}>1. Team</span>
            <span className="text-slate-300">/</span>
            <span className={`transition-colors duration-300 ${step === "camera" ? "text-emerald-600 font-extrabold" : "text-slate-400"}`}>2. Capture</span>
            <span className="text-slate-300">/</span>
            <span className={`transition-colors duration-300 ${step === "gallery" ? "text-emerald-600 font-extrabold" : "text-slate-400"}`}>3. 2D Photo</span>
            <span className="text-slate-300">/</span>
            <span className={`transition-colors duration-300 ${step === "3d" ? "text-emerald-600 font-extrabold" : "text-slate-400"}`}>4. 3D Studio</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex items-center justify-center">
        {step === "team" && (
          <TeamSelector
            onSelectTeam={handleSelectTeam}
            selectedTeam={selectedTeam}
          />
        )}

        {step === "camera" && (
          <CameraCapture
            onCapture={handleCapture}
            onBack={() => setStep("team")}
          />
        )}

        {step === "gallery" && capturedImage && selectedTeam && (
          <LookViewer2D
            userImage={capturedImage}
            selectedTeam={selectedTeam}
            onView3D={handleView3D}
            onRestart={handleRestart}
          />
        )}

        {step === "3d" && selected2DImage && (
          <Viewport3D
            selected2DImage={selected2DImage}
            onBack={() => setStep("gallery")}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-100/40 backdrop-blur-md py-6 text-center text-[10px] text-slate-400 tracking-wider uppercase font-semibold">
        <p>© 2026 FanStudio • FIFA World Cup 2026 3D Generative Fan Experience</p>
      </footer>
    </div>
  );
}

