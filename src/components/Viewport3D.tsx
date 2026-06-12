"use client";

import React, { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Splat } from "@react-three/drei";
import { Loader2, ArrowLeft, Download, Smartphone, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { API_BASE_URL } from "../config";

interface Viewport3DProps {
  selected2DImage: string;
  onBack: () => void;
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

export default function Viewport3D({ selected2DImage, onBack }: Viewport3DProps) {
  const [plyUrl, setPlyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0 });
  const [gyroPermission, setGyroPermission] = useState<"granted" | "denied" | "default">("default");
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

        if (data.plyUrl) {
          const fullUrl = data.plyUrl.startsWith("http") ? data.plyUrl : `${API_BASE_URL}${data.plyUrl}`;
          setPlyUrl(fullUrl);
        } else {
          throw new Error("No 3D data received");
        }
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
      // Normalize values to small radian rotation offsets
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
    // Check if DeviceOrientationEvent.requestPermission is supported (iOS 13+)
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
      // Android / Desktop default
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

  if (loading) {
    return (
      <div className="w-full max-w-md mx-auto bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 min-h-[400px]">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
        <div className="text-center flex flex-col gap-1.5">
          <h3 className="text-white font-bold text-lg tracking-wide uppercase">
            3D Studio
          </h3>
          <p className="text-zinc-400 text-sm animate-pulse">
            Generating 3D volumetric space...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md mx-auto bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <ArrowLeft className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-white font-bold text-lg">SHARP Failure</h3>
          <p className="text-zinc-400 text-xs mt-2 px-4 leading-relaxed">
            {error}
          </p>
        </div>
        <button
          onClick={onBack}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-2xl border border-zinc-700 transition-all text-sm"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[480px] h-[640px] bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl mx-auto">
      {/* 3D R3F Canvas */}
      {plyUrl && (
        <Canvas
          camera={{ position: [0, 2, -1.4], fov: 45 }}
          className="w-full h-full bg-zinc-950"
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
      )}

      {/* Glassmorphic Control Overlay */}
      <div className="absolute top-4 left-4 flex gap-2">
        <button
          onClick={onBack}
          className="bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Gallery
        </button>
        <button
          onClick={handleResetView}
          className="bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs font-semibold"
        >
          <RotateCcw className="w-4 h-4" />
          Reset View
        </button>
      </div>

      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={downloadPly}
          className="bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/10 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs font-semibold"
        >
          <Download className="w-4 h-4" />
          Download 3D (.splat)
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none text-center bg-black/40 backdrop-blur-sm px-4 py-2 rounded-2xl border border-white/5">
        <span className="text-[10px] text-zinc-300 font-bold tracking-widest uppercase">
          Orbit Orbit / Touch Tilt
        </span>
        <span className="text-[9px] text-zinc-500">
          Swipe to rotate. Tilt phone for depth.
        </span>
      </div>

      {/* Gyro onboarding trigger */}
      {gyroPermission === "default" && (
        <button
          onClick={requestGyroAccess}
          className="absolute bottom-16 right-4 pointer-events-auto bg-emerald-500 hover:bg-emerald-600 text-zinc-950 p-2.5 rounded-full shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center"
          title="Enable Gyroscope Parallax"
        >
          <Smartphone className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
