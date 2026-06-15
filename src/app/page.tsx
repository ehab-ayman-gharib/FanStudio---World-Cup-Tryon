"use client";

import React, { useState } from "react";
import TeamSelector from "../components/TeamSelector";
import CameraCapture from "../components/CameraCapture";
import LookViewer2D from "../components/LookViewer2D";
import Viewport3D from "../components/Viewport3D";
// No lucide-react imports needed here

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
    <div className="min-h-screen bg-[#121417] text-[#f8fafc] flex flex-col relative overflow-hidden font-sans dot-grid">
      
      {/* Vibrant premium background glow orbs */}
      <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#00F0FF]/5 rounded-full blur-[130px] -z-10 animate-pulse-glow pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-[#ADFF00]/5 rounded-full blur-[130px] -z-10 animate-pulse-glow pointer-events-none" style={{ animationDelay: '-3s' }} />
      <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-[#FF007A]/3 rounded-full blur-[150px] -z-10 pointer-events-none" />

      {/* Main Header */}
      <header className="border-b border-[#282d34] bg-[#121417]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={handleRestart}>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-2xl tracking-wider text-[#00F0FF] italic font-black uppercase">
                FANSTUDIO
              </span>
              <span className="text-[9px] text-[#ADFF00] font-label font-bold tracking-widest uppercase">
                WC26
              </span>
            </div>
          </div>

          {/* Step indicators (JetBrains Mono) */}
          <div className="flex items-center gap-2.5 sm:gap-5 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase">
            <span className={`transition-colors duration-300 ${step === "team" ? "text-[#00F0FF]" : "text-slate-500"}`}>1. Team</span>
            <span className="text-slate-700">/</span>
            <span className={`transition-colors duration-300 ${step === "camera" ? "text-[#00F0FF]" : "text-slate-500"}`}>2. Capture</span>
            <span className="text-slate-700">/</span>
            <span className={`transition-colors duration-300 ${step === "gallery" ? "text-[#00F0FF]" : "text-slate-500"}`}>3. Photo</span>
            <span className="text-slate-700">/</span>
            <span className={`transition-colors duration-300 ${step === "3d" ? "text-[#00F0FF]" : "text-slate-500"}`}>4. 3D</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex items-center justify-center">
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
      <footer className="border-t border-[#282d34] bg-[#121417]/90 py-5 text-center text-[9px] text-slate-500 tracking-wider uppercase font-label font-bold">
        <p>© 2026 FANSTUDIO • FIFA WORLD CUP 2026 GENERATIVE FAN EXPERIENCE</p>
      </footer>
    </div>
  );
}

