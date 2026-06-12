"use client";

import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Trophy, Sparkles, Check, Shield } from "lucide-react";
import { TEAMS, Team } from "../constants/teams";

interface TeamSelectorProps {
  onSelectTeam: (team: Team) => void;
  selectedTeam: Team | null;
}

// LogoImage component with dynamic fallback for various image formats
const LogoImage = ({ teamId, className }: { teamId: string; className?: string }) => {
  const [src, setSrc] = useState(`/logos/${teamId}.png`);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  
  const capitalized = teamId.charAt(0).toUpperCase() + teamId.slice(1);
  const fallbacks = [
    `/logos/${capitalized}.png`,
    `/logos/${capitalized}.svg`,
    `/logos/${capitalized}.webp`,
    `/logos/${capitalized}.jpg`,
    `/logos/${teamId}.svg`,
    `/logos/${teamId}.webp`,
    `/logos/${teamId}.jpg`,
    `/logos/${teamId}.jpeg`,
  ];


  useEffect(() => {
    setSrc(`/logos/${teamId}.png`);
    setFallbackIndex(0);
  }, [teamId]);

  const handleError = () => {
    if (fallbackIndex < fallbacks.length) {
      setSrc(fallbacks[fallbackIndex]);
      setFallbackIndex(prev => prev + 1);
    } else {
      setSrc(""); // Will trigger fallback UI
    }
  };

  if (!src) {
    return (
      <div className="w-full h-full rounded-full flex items-center justify-center bg-zinc-800 border border-zinc-700 text-zinc-400 font-extrabold text-xs">
        {teamId.substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${teamId} logo`}
      className={`${className} object-contain`}
      onError={handleError}
    />
  );
};

// GarmentPreview component that handles custom Flux preview toggle and graceful fallbacks
const GarmentPreview = ({ teamId, filename, showFlux }: { teamId: string; filename: string; showFlux: boolean }) => {
  const [src, setSrc] = useState(showFlux ? `/garments/${teamId}.png` : `/kits/${filename}`);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const fluxFallbacks = [
    `/garments/${teamId}.webp`,
    `/garments/${teamId}.jpg`,
    `/kits/${filename}`,
  ];

  useEffect(() => {
    setLoading(true);
    setSrc(showFlux ? `/garments/${teamId}.png` : `/kits/${filename}`);
    setFallbackIndex(0);
  }, [teamId, filename, showFlux]);

  const handleError = () => {
    if (showFlux && fallbackIndex < fluxFallbacks.length) {
      setSrc(fluxFallbacks[fallbackIndex]);
      setFallbackIndex(prev => prev + 1);
    } else {
      setSrc(`/kits/${filename}`);
    }
  };

  return (
    <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-inner flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={`${teamId} garment preview`}
        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        onLoad={() => setLoading(false)}
        onError={() => {
          handleError();
          setLoading(false);
        }}
      />
      
      <div className="absolute bottom-3 right-3 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-zinc-800 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
        {showFlux ? "Local Flux Render" : "Reference Kit"}
      </div>
    </div>
  );
};

export default function TeamSelector({ onSelectTeam, selectedTeam }: TeamSelectorProps) {
  const [teams] = useState<Team[]>(TEAMS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTeam, setActiveTeam] = useState<Team>(selectedTeam || TEAMS[0]);
  const [showFluxPreview, setShowFluxPreview] = useState(false);

  useEffect(() => {
    if (selectedTeam) {
      setActiveTeam(selectedTeam);
    }
  }, [selectedTeam]);

  const filteredTeams = teams.filter((team) =>
    team.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const primaryColor = activeTeam?.theme.colors[0] || "#10b981";
  const secondaryColor = activeTeam?.theme.colors[1] || "#6366f1";

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 animate-fade-in-up">
      {/* Header section with description */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-zinc-900 pb-5">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white bg-clip-text bg-gradient-to-r from-white via-zinc-100 to-zinc-400">
            Select Your Team
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Choose your nation to generate a custom 3D garment experience using ComfyUI & Flux.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search team or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-full py-2.5 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm"
          />
        </div>
      </div>

      {/* Main Grid Layout (Split Left List & Right Preview Pane) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Scrollable Team Cards */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="max-h-[620px] overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredTeams.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-zinc-900/20 rounded-2xl border border-zinc-900">
                <p className="text-zinc-500 text-sm">No teams found matching "{searchQuery}"</p>
              </div>
            ) : (
              filteredTeams.map((team) => {
                const isActive = activeTeam?.id === team.id;
                const isSelected = selectedTeam?.id === team.id;
                const tPrimary = team.theme.colors[0] || "#27272a";
                const tSecondary = team.theme.colors[1] || "#09090b";

                return (
                  <button
                    key={team.id}
                    onClick={() => setActiveTeam(team)}
                    className={`group relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 text-center cursor-pointer ${
                      isActive
                        ? "bg-zinc-900/80 border-transparent shadow-lg"
                        : "bg-zinc-900/20 border-zinc-900 hover:border-zinc-800 hover:bg-zinc-900/35"
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundImage: `linear-gradient(135deg, ${tPrimary}12, ${tSecondary}08)`,
                            border: `1.5px solid ${tPrimary}80`,
                            boxShadow: `0 8px 20px ${tPrimary}10`,
                          }
                        : {}
                    }
                  >
                    {/* Badge selection overlay */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-zinc-950 p-0.5 rounded-full z-10">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}

                    {/* Logo container */}
                    <div className="w-16 h-16 mb-3 flex items-center justify-center relative">
                      <div
                        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-300 blur-md"
                        style={{ background: tPrimary }}
                      />
                      <LogoImage teamId={team.id} className="w-12 h-12 relative z-10 transition-transform duration-300 group-hover:scale-110" />
                    </div>

                    {/* Team info */}
                    <span className="text-white font-bold text-sm tracking-wide line-clamp-1 group-hover:text-emerald-400 transition-colors">
                      {team.name}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                      {team.theme.group}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Interactive Garment Preview Pane */}
        <div className="lg:col-span-5 sticky top-24">
          <div 
            className="glass-panel rounded-3xl p-6 flex flex-col gap-5 transition-all duration-300"
            style={{ 
              boxShadow: `0 20px 40px -15px rgba(0,0,0,0.7), 0 0 40px ${primaryColor}08`,
              borderColor: `${primaryColor}20` 
            }}
          >
            {/* Team details header */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-zinc-900">
              <div className="w-12 h-12 rounded-xl bg-zinc-950/60 border border-zinc-800 p-2 flex items-center justify-center shadow-inner">
                <LogoImage teamId={activeTeam.id} className="w-9 h-9" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-white tracking-tight">
                    {activeTeam.name}
                  </h3>
                  <span className="bg-zinc-800/80 px-2 py-0.5 rounded text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                    {activeTeam.theme.group}
                  </span>
                </div>
                
                {/* Colored dots indicators */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-zinc-500 font-semibold mr-1">KIT COLORS:</span>
                  {activeTeam.theme.colors.map((color, idx) => (
                    <div 
                      key={idx} 
                      className="w-3 h-3 rounded-full border border-black/40 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Garment Preview Display with Toggle controls */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-zinc-950/60 p-1.5 rounded-xl border border-zinc-900">
                <button
                  onClick={() => setShowFluxPreview(false)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !showFluxPreview 
                      ? "bg-zinc-900 text-white shadow-sm" 
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Official Kit
                </button>
                <button
                  onClick={() => setShowFluxPreview(true)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    showFluxPreview 
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 shadow-md font-extrabold" 
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Flux Custom Preview
                </button>
              </div>

              <GarmentPreview 
                teamId={activeTeam.id} 
                filename={activeTeam.filename} 
                showFlux={showFluxPreview} 
              />
            </div>

            {/* Confirm selection button */}
            <button
              onClick={() => onSelectTeam(activeTeam)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm cursor-pointer"
            >
              <Trophy className="w-4 h-4 stroke-[2.5]" />
              Confirm & Start Generator
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

