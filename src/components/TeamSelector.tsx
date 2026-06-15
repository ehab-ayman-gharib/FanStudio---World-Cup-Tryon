"use client";

import React, { useState, useEffect } from "react";
import { Search, ChevronRight, Trophy, Sparkles, Check, Shield, ZoomIn, X } from "lucide-react";
import { TEAMS, Team } from "../constants/teams";

interface TeamSelectorProps {
  onSelectTeam: (team: Team) => void;
  selectedTeam: Team | null;
}

// LogoImage component with dynamic fallback for various image formats
const LogoImage = ({ teamId, className }: { teamId: string; className?: string }) => {
  const [src, setSrc] = useState(`/logos/${teamId}.jpg`);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const capitalized = teamId.charAt(0).toUpperCase() + teamId.slice(1);
  const fallbacks = [
    `/logos/${teamId}.png`,
    `/logos/${capitalized}.jpg`,
    `/logos/${capitalized}.png`,
    `/logos/${teamId}.webp`,
    `/logos/${teamId}.svg`,
    `/logos/${teamId}.jpeg`,
  ];

  useEffect(() => {
    setSrc(`/logos/${teamId}.jpg`);
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
      <div className="w-full h-full rounded-full flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400 font-extrabold text-xs">
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

// GarmentPreview component that loads premium generated mockups from /garments/ with hover zoom-and-pan
const GarmentPreview = ({ filename }: { filename: string }) => {
  const [src, setSrc] = useState(`/garments/${filename}`);
  const [loading, setLoading] = useState(true);
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({
    transformOrigin: "center center",
    transform: "scale(1)",
  });

  useEffect(() => {
    setLoading(true);
    setSrc(`/garments/${filename}`);
    setZoomStyle({
      transformOrigin: "center center",
      transform: "scale(1)",
    });
  }, [filename]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;

    setZoomStyle({
      transformOrigin: `${x}% ${y}%`,
      transform: "scale(1.25)", // 1.25x zoom
    });
  };

  const handleMouseLeave = () => {
    setZoomStyle({
      transformOrigin: "center center",
      transform: "scale(1)",
    });
  };

  return (
    <div
      className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner flex items-center justify-center cursor-zoom-in group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {loading && (
        <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Zoom hint overlay indicator, disappears on hover */}
      <div className="absolute top-3 right-3 bg-white/80 border border-slate-200/80 p-2 rounded-xl text-slate-500 group-hover:opacity-0 transition-opacity z-20 pointer-events-none shadow-sm">
        <ZoomIn className="w-4 h-4" />
      </div>

      <img
        src={src}
        alt={`${filename} garment preview`}
        className="w-full h-full object-cover transition-transform"
        style={{
          ...zoomStyle,
          transition: zoomStyle.transform === "scale(1)"
            ? "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
            : "transform 0.08s ease-out"
        }}
        onLoad={() => setLoading(false)}
      />

      <div className="absolute bottom-3 right-3 bg-white/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-200 text-[10px] text-slate-500 font-bold uppercase tracking-wider pointer-events-none shadow-sm">
        Premium Studio Look
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
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">
            Select Your Team
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Choose your nation to generate a custom 3D garment experience using ComfyUI & Flux.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search team or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/80 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all text-sm backdrop-blur-sm shadow-sm"
          />
        </div>
      </div>

      {/* Main Grid Layout (Split Left List & Right Preview Pane) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Scrollable Team Cards */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="max-h-[620px] overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredTeams.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white/40 rounded-2xl border border-slate-200">
                <p className="text-slate-400 text-sm">No teams found matching "{searchQuery}"</p>
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
                    className={`group relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300 text-center cursor-pointer ${isActive
                        ? "bg-white border-transparent shadow-md"
                        : "bg-white/40 border-slate-200/60 hover:border-slate-300 hover:bg-white/80 hover:shadow-sm"
                      }`}
                    style={
                      isActive
                        ? {
                          backgroundImage: `linear-gradient(135deg, ${tPrimary}15, ${tSecondary}0a)`,
                          border: `1.5px solid ${tPrimary}aa`,
                          boxShadow: `0 8px 20px ${tPrimary}12`,
                        }
                        : {}
                    }
                  >
                    {/* Badge selection overlay */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white p-0.5 rounded-full z-10 shadow-sm">
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
                    <span className="text-slate-800 font-bold text-sm tracking-wide line-clamp-1 group-hover:text-emerald-600 transition-colors">
                      {team.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
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
              boxShadow: `0 20px 40px -15px rgba(15, 23, 42, 0.08), 0 0 40px ${primaryColor}08`,
              borderColor: `${primaryColor}30`
            }}
          >
            {/* Team details header */}
            <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-white/80 border border-slate-200 p-2 flex items-center justify-center shadow-sm">
                <LogoImage teamId={activeTeam.id} className="w-9 h-9" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {activeTeam.name}
                  </h3>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    {activeTeam.theme.group}
                  </span>
                </div>

                {/* Colored dots indicators */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">KIT COLORS:</span>
                  {activeTeam.theme.colors.map((color, idx) => (
                    <div
                      key={idx}
                      className="w-3 h-3 rounded-full border border-black/10 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Garment Preview Display */}
            <div className="flex flex-col gap-4">
              <GarmentPreview
                filename={activeTeam.filename}
              />
            </div>



            {/* Confirm selection button */}
            <button
              onClick={() => onSelectTeam(activeTeam)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm cursor-pointer"
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

