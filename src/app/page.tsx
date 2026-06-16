"use client";

import React, { useState, useEffect } from "react";
import TeamSelector from "../components/TeamSelector";
import CameraCapture from "../components/CameraCapture";
import LookViewer2D from "../components/LookViewer2D";
import Viewport3D from "../components/Viewport3D";
import { API_BASE_URL } from "../config";

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

  // Trigger background pre-warming of Modal GPU containers on page mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/pre-warm`)
      .then(res => res.json())
      .then(data => console.log("Modal pre-warm status:", data))
      .catch(err => console.error("Modal pre-warm failed:", err));
  }, []);

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



      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 flex items-start justify-center pt-8 pb-16">
        {step === "team" && (
          <TeamSelector
            onSelectTeam={handleSelectTeam}
            selectedTeam={selectedTeam}
          />
        )}

        {step === "camera" && (
          <CameraCapture
            onCapture={handleCapture}
            onBack={() => {
              setSelectedTeam(null);
              setStep("team");
            }}
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
            selectedTeam={selectedTeam}
            onRestart={handleRestart}
          />
        )}
      </main>


    </div>
  );
}

