"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronRight, Trophy, ZoomIn } from "lucide-react";
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
      <div className="w-full h-full rounded-lg flex items-center justify-center bg-[#121417] border border-[#282d34] text-slate-500 font-label font-bold text-[10px]">
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
  const imgRef = useRef<HTMLImageElement | null>(null);
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

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      setLoading(false);
    }
  }, [src]);

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
      className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b from-[#121417] to-[#1b1e22] border border-[#282d34] flex items-center justify-center cursor-zoom-in group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {loading && (
        <div className="absolute inset-0 bg-[#121417]/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
          <div className="w-6 h-6 border-2 border-[#282d34] border-t-[#00F0FF] rounded-full animate-spin" />
        </div>
      )}

      {/* Zoom hint overlay indicator, disappears on hover */}
      <div className="absolute top-3 right-3 bg-[#121417]/80 border border-[#282d34] p-2 rounded-xl text-slate-400 group-hover:opacity-0 transition-opacity z-20 pointer-events-none shadow-sm">
        <ZoomIn className="w-4 h-4 text-[#00F0FF]" />
      </div>

      <img
        ref={imgRef}
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

      <div className="absolute bottom-3 right-3 bg-[#121417]/95 backdrop-blur-md px-3 py-1 rounded-full border border-[#282d34] text-[9px] text-[#00F0FF] font-label font-bold uppercase tracking-wider pointer-events-none shadow-sm">
        PREMIUM STUDIO LOOK
      </div>
    </div>
  );
};

export default function TeamSelector({ onSelectTeam, selectedTeam }: TeamSelectorProps) {
  const [teams] = useState<Team[]>(TEAMS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTeam, setActiveTeam] = useState<Team | null>(selectedTeam || null);

  useEffect(() => {
    if (selectedTeam) {
      setActiveTeam(selectedTeam);
    }
  }, [selectedTeam]);

  const filteredTeams = teams.filter((team) =>
    team.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const primaryColor = activeTeam?.theme.colors[0] || "#00F0FF";

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 animate-fade-in-up">
      {/* Header section with description */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-[#282d34] pb-5">
        <div className="flex flex-col gap-1.5 pb-1">
          <span className="text-[11px] sm:text-sm text-[#ADFF00] font-label font-bold tracking-wide uppercase">
            CLAIM YOUR COLORS ● WEAR THE JERSEY ● GENERATE SPATIAL 3D AVATARS
          </span>
          <h2 className="text-4xl sm:text-5xl font-headline tracking-wider text-[#f8fafc] uppercase animate-text-glow leading-none mt-1">
            SELECT YOUR SQUAD
          </h2>
        </div>

        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="SEARCH NATIONAL TEAMS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1b1e22] border border-[#282d34] rounded-xl py-3 pl-4 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-[#00F0FF] transition-all text-xs tracking-wider font-label uppercase shadow-inner"
          />
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
        </div>
      </div>

      {/* Main Grid Layout (Split Left List & Right Preview Pane) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Right Side: Interactive Garment Preview Pane (Only rendered when activeTeam is selected) */}
        {activeTeam && (
          <div className="lg:col-span-5 order-1 lg:order-2 lg:sticky lg:top-24 w-full max-w-md mx-auto lg:max-w-none animate-fade-in-up">
            <div
              className="glass-panel rounded-3xl p-5 flex flex-col gap-5 transition-all duration-300"
              style={{
                boxShadow: `0 20px 40px -15px rgba(18, 20, 23, 0.5), 0 0 30px ${primaryColor}05`,
                borderColor: `${primaryColor}30`
              }}
            >
              {/* Team details header */}
              <div className="flex items-center gap-3.5 pb-4 border-b border-[#282d34]">
                <div className="w-12 h-12 rounded-xl bg-[#121417]/90 border border-[#282d34] p-2 flex items-center justify-center shadow-sm">
                  <LogoImage teamId={activeTeam.id} className="w-9 h-9" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-headline tracking-wide text-[#f8fafc] uppercase leading-none">
                      {activeTeam.name}
                    </h3>
                    <span className="border border-[#282d34] px-2 py-0.5 rounded text-[8px] text-slate-400 font-label tracking-widest uppercase bg-[#121417]/60">
                      {activeTeam.theme.group}
                    </span>
                  </div>

                  {/* Colored dots indicators */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[9px] text-slate-500 font-label font-bold tracking-wider mr-1">KIT COLORS:</span>
                    {activeTeam.theme.colors.map((color, idx) => (
                      <div
                        key={idx}
                        className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-sm"
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
                className="w-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-wide uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-sm cursor-pointer"
              >
                <Trophy className="w-5 h-5" />
                CONFIRM SQUAD
              </button>
            </div>
          </div>
        )}

        {/* Left Side: Scrollable Team Cards (Spans full width if activeTeam is null) */}
        <div className={`${activeTeam ? "lg:col-span-7" : "lg:col-span-12 max-w-5xl mx-auto w-full"} order-2 lg:order-1 flex flex-col gap-4 transition-all duration-300`}>
          <div className={`max-h-[620px] overflow-y-auto pr-2 pb-6 lg:pb-0 ${
            activeTeam 
              ? "flex flex-col gap-3" 
              : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
          }`}>
            {filteredTeams.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-[#1b1e22]/50 rounded-2xl border border-[#282d34]">
                <p className="text-slate-500 text-xs font-body">No squads found matching "{searchQuery}"</p>
              </div>
            ) : (
              filteredTeams.map((team) => {
                const isActive = activeTeam?.id === team.id;
                const isSelected = selectedTeam?.id === team.id;
                const tPrimary = team.theme.colors[0] || "#00F0FF";

                return (
                  <button
                    key={team.id}
                    onClick={() => setActiveTeam(team)}
                    className={`group relative flex items-center justify-between p-4 rounded-xl border transition-all duration-300 text-left cursor-pointer ${
                      isActive
                        ? "bg-[#1b1e22] shadow-lg shadow-[#00F0FF]/5"
                        : "bg-[#1b1e22]/40 border-[#282d34]/60 hover:border-[#282d34] hover:bg-[#1b1e22]/70"
                    }`}
                    style={
                      isActive
                        ? {
                            border: `1.5px solid ${tPrimary}`,
                            boxShadow: `0 8px 25px ${tPrimary}10`,
                          }
                        : {}
                    }
                  >
                    {/* Left part: logo image container */}
                    <div className="flex items-center flex-1">
                      <div className="w-14 h-14 bg-[#121417]/80 border border-[#282d34] rounded-lg flex items-center justify-center p-2.5 relative">
                        <LogoImage teamId={team.id} className="w-10 h-10 relative z-10 transition-transform duration-300 group-hover:scale-110" />
                      </div>
                      
                      {/* Middle part: squad info */}
                      <div className="flex flex-col ml-4">
                        <span className={`font-headline text-2xl tracking-wide uppercase transition-colors leading-none ${
                          isActive ? "text-[#00F0FF]" : "text-white group-hover:text-[#00F0FF]"
                        }`}>
                          {team.name}
                        </span>
                        
                        {/* Colored bars representing kit colors */}
                        <div className="flex items-center gap-1 mt-2">
                          {team.theme.colors.map((color, idx) => (
                            <div
                              key={idx}
                              className="h-1 w-5 rounded-sm border border-black/10"
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right part: Group Badge & Selection Indicator */}
                    <div className="flex flex-col items-end gap-2">
                      <span className="border border-[#282d34] px-2 py-0.5 rounded text-[8px] text-slate-400 font-label tracking-widest uppercase bg-[#121417]/60">
                        {team.theme.group}
                      </span>
                      {isSelected && (
                        <span className="text-[9px] text-[#ADFF00] font-label font-bold uppercase tracking-wider">
                          ● SELECTED
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
