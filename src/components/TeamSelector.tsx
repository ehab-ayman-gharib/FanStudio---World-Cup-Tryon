"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Trophy, ZoomIn, ArrowLeft } from "lucide-react";
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
      <div className="w-full h-full rounded-full flex items-center justify-center bg-[#121417] border border-[#282d34] text-slate-500 font-label font-bold text-xs">
        {teamId.substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${teamId} logo`}
      className={`${className} object-cover rounded-full`}
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

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
      const x = ((touch.clientX - left) / width) * 100;
      const y = ((touch.clientY - top) / height) * 100;

      setZoomStyle({
        transformOrigin: `${x}% ${y}%`,
        transform: "scale(1.35)", // Slightly higher zoom on mobile touch
      });
    }
  };

  const handleTouchEnd = () => {
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
      onTouchStart={handleTouchMove}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {loading && (
        <div className="absolute inset-0 bg-[#121417]/80 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none">
          <div className="w-6 h-6 border-2 border-[#282d34] border-t-[#ADFF00] rounded-full animate-spin" />
        </div>
      )}

      {/* Zoom hint overlay indicator, disappears on hover */}
      <div className="absolute top-3 right-3 bg-[#121417]/80 border border-[#282d34] p-2 rounded-xl text-slate-400 group-hover:opacity-0 transition-opacity z-20 pointer-events-none shadow-sm">
        <ZoomIn className="w-4 h-4 text-[#ADFF00]" />
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

      <div className="absolute bottom-3 right-3 bg-[#121417]/95 backdrop-blur-md px-3 py-1 rounded-full border border-[#282d34] text-[9px] text-[#ADFF00] font-label font-bold uppercase tracking-wider pointer-events-none shadow-sm">
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

  // Group teams by group name
  const groups: { [key: string]: Team[] } = {};
  filteredTeams.forEach((team) => {
    const groupName = team.theme.group || "Others";
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(team);
  });

  const sortedGroupNames = Object.keys(groups).sort();
  const primaryColor = activeTeam?.theme.colors[0] || "#ADFF00";

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
      {/* 1. BRAND TOP BAR */}
      <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
        <div className="flex justify-start">
          {activeTeam && (
            <button
              onClick={() => setActiveTeam(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
              title="Back to list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
        </div>
        <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
          FANSTUDIO
        </span>
        <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
          STEP 01/04
        </div>
      </div>

      {/* 2. STEP INDICATORS */}
      <div className="grid grid-cols-4 gap-1 sm:gap-2 text-[8px] sm:text-[10px] font-label font-bold tracking-wider uppercase border-b border-[#282d34]/60 pb-4">
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[#ADFF00]">01 TEAM</span>
          <div className="h-1.5 bg-[#ADFF00] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-slate-500">02 CAPTURE</span>
          <div className="h-1 bg-[#282d34] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-slate-500">03 PHOTO</span>
          <div className="h-1 bg-[#282d34] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-slate-500">04 3D</span>
          <div className="h-1 bg-[#282d34] rounded-full" />
        </div>
      </div>

      {/* 3. TITLE & DESCRIPTION */}
      <div className={`flex flex-col gap-2.5 ${activeTeam ? "hidden lg:flex" : "flex"}`}>
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-headline tracking-wide text-white uppercase leading-none animate-neon-green">
          SELECT YOUR SQUAD
        </h2>
        <p className="text-sm sm:text-base md:text-lg text-slate-300 font-body leading-relaxed max-w-3xl">
          Choose your national team to begin the generative fan experience for FIFA World Cup 2026.
        </p>
      </div>

      {/* 4. SEARCH INPUT */}
      <div className={`relative w-full ${activeTeam ? "hidden lg:block" : "block"}`}>
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
        <input
          type="text"
          placeholder="SEARCH TEAMS..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#1b1e22]/90 border border-[#282d34] rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-[#ADFF00] transition-all text-xs tracking-widest font-label uppercase shadow-inner"
        />
      </div>

      {/* 5. MAIN CONTENT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2">
        {/* Left Side: Scrollable Category Group Grids */}
        <div className={`flex flex-col gap-6 max-h-[560px] overflow-y-auto pr-1 pb-4 transition-all duration-300 scrollbar-thin ${
          activeTeam ? "hidden lg:flex lg:col-span-7" : "flex lg:col-span-12"
        }`}>
          {filteredTeams.length === 0 ? (
            <div className="py-16 text-center bg-[#1b1e22]/30 rounded-2xl border border-[#282d34]">
              <p className="text-slate-500 text-xs font-body">No squads found matching "{searchQuery}"</p>
            </div>
          ) : (
            sortedGroupNames.map((groupName) => (
              <div key={groupName} className="flex flex-col gap-3">
                <h3 className="text-[10px] sm:text-xs font-bold tracking-widest text-[#00F0FF] uppercase border-l-2 border-[#00F0FF] pl-2.5 leading-none">
                  {groupName}
                </h3>
                <div className={`grid gap-3.5 ${activeTeam ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-5"
                  }`}>
                  {groups[groupName].map((team) => {
                    const isActive = activeTeam?.id === team.id;
                    const isSelected = selectedTeam?.id === team.id;
                    const tPrimary = team.theme.colors[0] || "#ADFF00";

                    return (
                      <button
                        key={team.id}
                        onClick={() => setActiveTeam(team)}
                        className={`group relative flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 text-center cursor-pointer ${isActive
                            ? "bg-[#1b1e22]/90 border-[#ADFF00]/80 shadow-md shadow-[#ADFF00]/5"
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
                        {/* Circular flag icon or orb */}
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center relative transition-transform duration-300 group-hover:scale-105 overflow-hidden"
                          style={{
                            boxShadow: isActive ? `0 0 15px ${tPrimary}20` : "none",
                            border: isActive ? `2px solid ${tPrimary}` : "2px solid #282d34"
                          }}
                        >
                          <LogoImage teamId={team.id} className="w-full h-full object-cover" />

                          {/* Inner soft radial gradient representing a glossy orb overlay */}
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 rounded-full pointer-events-none" />
                        </div>

                        {/* Team name centered */}
                        <span className={`font-headline text-base tracking-wider uppercase mt-3.5 text-center leading-tight transition-colors duration-200 ${isActive ? "text-[#ADFF00]" : "text-slate-300 group-hover:text-white"
                          }`}>
                          {team.name}
                        </span>

                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#ADFF00]" title="Currently selected" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )))
          }
        </div>

        {/* Right Side: Interactive Garment Preview Pane (Only rendered on desktop when activeTeam is selected) */}
        {activeTeam && (
          <div className="lg:col-span-5 w-full max-w-md mx-auto lg:max-w-none animate-fade-in-up lg:sticky lg:top-4">
            <div
              className="glass-panel rounded-3xl p-5 flex flex-col gap-4 transition-all duration-300 bg-[#16191c]/80 border border-[#282d34]"
              style={{
                boxShadow: `0 20px 40px -15px rgba(18, 20, 23, 0.5), 0 0 30px ${primaryColor}05`,
                borderColor: `${primaryColor}25`
              }}
            >
              {/* Team details header */}
              <div className="flex items-center gap-3.5 pb-4 border-b border-[#282d34]">
                <div className="w-12 h-12 rounded-full bg-[#121417]/90 border border-[#282d34] p-2 flex items-center justify-center shadow-sm">
                  <LogoImage teamId={activeTeam.id} className="w-9 h-9 object-cover rounded-full" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-2xl font-headline tracking-wide text-[#f8fafc] uppercase leading-none">
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
                <GarmentPreview filename={activeTeam.filename} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. MOCKUP FOOTER SELECTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0c0d0f]/95 backdrop-blur-xl border-t border-[#282d34] px-6 py-4 z-40 shadow-xl flex items-center justify-between">
        <div className="flex flex-col justify-center">
          <span className="text-[9px] sm:text-[10px] text-slate-500 font-label font-bold tracking-widest uppercase">
            SELECTED SQUAD
          </span>
          <span className="text-base sm:text-lg font-headline font-bold text-[#ADFF00] uppercase tracking-wide mt-0.5 leading-none">
            {activeTeam ? activeTeam.name : "NONE"}
          </span>
        </div>

        <button
          onClick={() => activeTeam && onSelectTeam(activeTeam)}
          disabled={!activeTeam}
          className={`px-8 py-3 rounded-xl text-sm font-headline tracking-widest font-black uppercase transition-all duration-300 flex items-center justify-center gap-2 ${activeTeam
              ? "bg-[#ADFF00] text-[#121417] hover:bg-[#ADFF00]/95 cursor-pointer shadow-lg shadow-[#ADFF00]/15"
              : "bg-[#1b1e22] text-slate-600 cursor-not-allowed border border-[#282d34]/60"
            }`}
        >
          <Trophy className="w-4 h-4" />
          CONFIRM SQUAD
        </button>
      </div>
    </div>
  );
}
