"use client";

import React, { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Splat } from "@react-three/drei";
import { Loader2, ArrowLeft, Download, Smartphone, RotateCcw, Eye, Box, AlertTriangle } from "lucide-react";
import * as THREE from "three";
import { API_BASE_URL } from "../config";

interface Viewport3DProps {
  selected2DImage: string;
  onBack: () => void;
  selectedTeam?: {
    id: string;
    name: string;
    filename: string;
    theme: {
      colors: string[];
    };
  } | null;
  onRestart?: () => void;
}

// Internal component to handle gyro tilting on frame renders
function TiltingGroup({ children, gyroOffset }: { children: React.ReactNode; gyroOffset: { x: number; y: number } }) {
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(() => {
    if (groupRef.current) {
      // Smoothly lerp towards target gyro orientation
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, gyroOffset.x * 0.4, 0.05);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, gyroOffset.y * 0.4, 0.05);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

export default function Viewport3D({ selected2DImage, onBack, selectedTeam, onRestart }: Viewport3DProps) {
  const [plyUrl, setPlyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0 });
  const [gyroPermission, setGyroPermission] = useState<"granted" | "denied" | "default">("default");
  const [show2D, setShow2D] = useState(false);
  const hasTriggered = useRef(false);

  // Fetch PLY file from API
  useEffect(() => {
    if (hasTriggered.current) return;
    hasTriggered.current = true;

    async function fetchSplat() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE_URL}/api/generate-3d`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image: selected2DImage,
          }),
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({ detail: "Unknown server error" }));
          throw new Error(detail.detail || "SHARP generation failed");
        }

        const data = await res.json();
        const jobId = data.job_id;
        if (!jobId) {
          throw new Error("No job ID returned from server.");
        }

        // Poll for completion
        let completed = false;
        let attempts = 0;
        const maxAttempts = 120; // 4 minutes max (allows for cold starts and 3D reconstruction)
        let resultPlyUrl = "";

        while (!completed && attempts < maxAttempts) {
          // Wait 2 seconds before polling again
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
            resultPlyUrl = statusData.result.plyUrl;
          } else if (statusData.status === "failed") {
            throw new Error(statusData.error || "3D Gaussian generation failed");
          }
        }

        if (!completed || !resultPlyUrl) {
          throw new Error("3D Generation request timed out. Please try again.");
        }

        const fullUrl = resultPlyUrl.startsWith("http") ? resultPlyUrl : `${API_BASE_URL}${resultPlyUrl}`;
        setPlyUrl(fullUrl);
      } catch (err: any) {
        console.error("SHARP Error:", err);
        setError(err.message || "Failed to generate 3D Gaussian Splat model.");
      } finally {
        setLoading(false);
      }
    }

    fetchSplat();
  }, [selected2DImage]);

  // Request gyroscope permissions on iOS / listen to orientation
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta || 0;  // -180 to 180 (front/back tilt)
      const gamma = e.gamma || 0; // -90 to 90 (left/right tilt)

      // Target offsets around center (e.g. phone held up at 60 deg)
      const targetX = (gamma / 45); // Map left/right tilt
      const targetY = ((beta - 60) / 45); // Map front/back tilt (assuming user holds phone at ~60deg)

      setGyroOffset({
        x: Math.max(-0.8, Math.min(0.8, targetX)),
        y: Math.max(-0.8, Math.min(0.8, targetY)),
      });
    };

    window.addEventListener("deviceorientation", handleOrientation);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  const requestGyroAccess = async () => {
    const deviceAuth = (DeviceOrientationEvent as any).requestPermission;
    if (typeof deviceAuth === "function") {
      try {
        const permission = await deviceAuth();
        if (permission === "granted") {
          setGyroPermission("granted");
        } else {
          setGyroPermission("denied");
        }
      } catch (err) {
        console.error("Gyro authorization error:", err);
        setGyroPermission("denied");
      }
    } else {
      setGyroPermission("granted");
    }
  };

  const controlsRef = useRef<any>(null);

  const handleResetView = () => {
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const camera = controls.object;
      
      // Reset camera position to [0, 2, -1.4]
      camera.position.set(0, 2, -1.4);
      
      // Reset target to [0, -1, -2]
      controls.target.set(0, -1, -2);
      
      controls.update();
    }
  };

  const downloadPly = () => {
    if (!plyUrl) return;
    const link = document.createElement("a");
    link.href = plyUrl;
    link.download = "fanstudio_spatial_avatar.splat";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const primaryColor = selectedTeam?.theme.colors[0] || "#00F0FF";
  const teamCode = selectedTeam?.name.substring(0, 3).toUpperCase() || "SQUAD";

  const renderContent = () => {
    if (loading) {
      return (
        <div className="w-full max-w-md mx-auto bg-[#1b1e22]/90 border border-[#282d34] rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 min-h-[460px] animate-fade-in-up">
          <Loader2 className="w-12 h-12 text-[#00F0FF] animate-spin" />
          <div className="text-center flex flex-col gap-1.5">
            <h3 className="text-white font-headline text-2xl tracking-wider uppercase">
              3D STUDIO
            </h3>
            <p className="text-slate-400 text-xs font-body animate-pulse">
              Generating 3D volumetric space...
            </p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="w-full max-w-md mx-auto bg-[#1b1e22]/90 border border-[#282d34] rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center animate-fade-in-up min-h-[460px]">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-white font-headline text-xl uppercase tracking-wider">SHARP FAILURE</h3>
            <p className="text-slate-400 text-xs mt-2 px-4 leading-relaxed font-body">
              {error}
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-wide uppercase py-3.5 rounded-2xl border border-[#282d34] transition-all text-xs cursor-pointer"
          >
            GO BACK
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col md:flex-row gap-8 items-center justify-center animate-fade-in relative mt-2 w-full">
        {/* 3D/2D Viewport Box with dynamic border color */}
        <div className="w-full max-w-sm aspect-[3/4] rounded-[32px] overflow-hidden border-2 shadow-2xl relative bg-[#121417] flex flex-col justify-between animate-fade-in-up"
             style={{ borderColor: primaryColor, boxShadow: `0 0 30px ${primaryColor}20` }}>
          
          {show2D ? (
            <div className="w-full h-full bg-[#121417] flex items-center justify-center p-4">
              <img
                src={selected2DImage}
                alt="2D generated look"
                className="w-full h-full object-cover rounded-2xl animate-fade-in"
              />
            </div>
          ) : (
            plyUrl && (
              <Canvas
                camera={{ position: [0, 2, -1.4], fov: 45 }}
                className="w-full h-full bg-[#121417]"
              >
                <ambientLight intensity={1.5} />
                <directionalLight position={[5, 5, 5]} intensity={1.5} />
                
                <TiltingGroup gyroOffset={gyroOffset}>
                  <Splat src={plyUrl} scale={3} position={[0, -0.3, 0]} />
                </TiltingGroup>

                <OrbitControls
                  ref={controlsRef}
                  enableDamping
                  dampingFactor={0.05}
                  enablePan={false}
                  minDistance={2.0}
                  maxDistance={3.5}
                  minAzimuthAngle={-0.06}
                  maxAzimuthAngle={0.06}
                  minPolarAngle={1.3}
                  maxPolarAngle={1.5}
                  target={[0, -1, -2]}
                  makeDefault
                />
              </Canvas>
            )
          )}

          {/* Corner brackets overlay */}
          <div className="absolute inset-4 border border-white/5 pointer-events-none z-10 rounded-2xl">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#ADFF00]" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#ADFF00]" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#ADFF00]" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#ADFF00]" />
          </div>

          {/* Dynamic SELECTED badge overlay in bottom-right */}
          <div className="absolute bottom-4 right-4 bg-[#121417]/85 border border-[#282d34] px-3 py-1.5 rounded-xl text-[8px] tracking-widest text-[#ADFF00] font-label font-bold uppercase z-10 shadow-lg">
            {teamCode} SELECTED
          </div>

          {/* Swipe indicator overlay in bottom center (only if in 3D mode) */}
          {!show2D && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none text-center bg-[#121417]/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#282d34] shadow-md w-[80%] z-10">
              <span className="text-[9px] text-[#00F0FF] font-label font-bold tracking-wider uppercase">
                SWIPE TO ROTATE / TILT PHONE
              </span>
              <span className="text-[8px] text-slate-500 font-body">
                Enable gyro to experience depth movement.
              </span>
            </div>
          )}

          {/* Gyro onboarding trigger */}
          {!show2D && gyroPermission === "default" && (
            <button
              onClick={requestGyroAccess}
              className="absolute bottom-16 right-4 pointer-events-auto bg-[#ADFF00] hover:brightness-110 text-[#121417] p-3 rounded-full shadow-lg shadow-[#ADFF00]/15 transition-all flex items-center justify-center cursor-pointer z-20"
              title="Enable Gyroscope Parallax"
            >
              <Smartphone className="w-4.5 h-4.5" />
            </button>
          )}
        </div>

        {/* Action Control Panel */}
        <div className="w-full md:w-80 flex flex-col gap-5 bg-[#1b1e22]/90 border border-[#282d34] rounded-[32px] p-6 backdrop-blur-xl shadow-xl animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-headline tracking-wider text-white uppercase leading-none">3D STUDIO</h2>
            <p className="text-slate-500 text-xs mt-2 font-body leading-relaxed">
              Interact with your custom avatar in real-time 3D volumetric space, or switch back to 2D view.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* View 2D/3D Toggle Button */}
            <button
              onClick={() => setShow2D(prev => !prev)}
              className="w-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-xs font-black cursor-pointer animate-fade-in"
            >
              {show2D ? (
                <>
                  <Box className="w-4 h-4" />
                  VIEW IN 3D STUDIO
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  VIEW FLAT 2D
                </>
              )}
            </button>

            {/* Reset Camera Button */}
            {!show2D && (
              <button
                onClick={handleResetView}
                className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-slate-400" />
                RESET CAMERA VIEW
              </button>
            )}

            {/* Export Button */}
            {!show2D ? (
              <button
                onClick={downloadPly}
                className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-400" />
                EXPORT 3D SPLAT
              </button>
            ) : (
              <a
                href={selected2DImage}
                download="fanstudio_avatar_2d.png"
                className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer text-center"
              >
                <Download className="w-4 h-4 text-slate-400" />
                EXPORT 2D IMAGE
              </a>
            )}
          </div>

          <div className="border-t border-[#282d34] pt-3">
            <button
              onClick={onRestart || onBack}
              className="w-full text-slate-500 hover:text-[#FF007A] font-label font-bold py-1 text-[10px] tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              START OVER
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
      {/* 1. BRAND TOP BAR */}
      <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
        <div className="flex justify-start">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
            title="Back to gallery"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
          FANSTUDIO
        </span>
        <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
          STEP 04/04
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
          <div className="h-1 bg-[#ADFF00] rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5 text-center">
          <span className="text-[#ADFF00]">04 3D</span>
          <div className="h-1.5 bg-[#ADFF00] rounded-full" />
        </div>
      </div>

      {/* 3. CORE CONTENT AREA */}
      {renderContent()}
    </div>
  );
}
