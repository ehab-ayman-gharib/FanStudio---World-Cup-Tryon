"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Loader2, ArrowLeft, Download, Smartphone, RotateCcw, Eye, Box, AlertTriangle, Film } from "lucide-react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { API_BASE_URL } from "../config";
//ss
function SparkSceneRenderer() {
  const { gl, scene } = useThree();
  const sparkRenderer = useMemo(() => {
    console.log("🎨 [SparkJS] Creating SparkRenderer instance");
    const renderer = new SparkRenderer({ renderer: gl, sortRadial: true });
    renderer.frustumCulled = false; // Disable culling so it always renders
    return renderer;
  }, [gl]);

  useEffect(() => {
    console.log("🔒 [SparkJS] Environment check:", {
      crossOriginIsolated: window.crossOriginIsolated,
      hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined"
    });

    console.log("➕ [SparkJS] Adding SparkRenderer to scene");
    scene.add(sparkRenderer);
    return () => {
      console.log("➖ [SparkJS] Removing SparkRenderer from scene");
      scene.remove(sparkRenderer);
      if (sparkRenderer && typeof (sparkRenderer as any).dispose === "function") {
        (sparkRenderer as any).dispose();
      }
    };
  }, [sparkRenderer, scene]);

  useFrame((state) => {
    if (sparkRenderer) {
      sparkRenderer.update({ scene: state.scene, camera: state.camera })
        .catch((err) => {
          console.error("❌ [SparkJS] Renderer update failed:", err);
        });
    }
  });

  return null;
}

function SparkSplat({
  url,
  position = [0, -0.3, 0],
  scale = 3.0,
  onProgress,
  onLoad
}: {
  url: string;
  position?: [number, number, number];
  scale?: number;
  onProgress?: (event: ProgressEvent) => void;
  onLoad?: () => void;
}) {
  const onProgressRef = useRef(onProgress);
  const onLoadRef = useRef(onLoad);
  
  useEffect(() => {
    onProgressRef.current = onProgress;
    onLoadRef.current = onLoad;
  }, [onProgress, onLoad]);

  const splatMesh = useMemo(() => {
    console.log("🎨 [SparkJS] Creating SplatMesh instance:", url);
    const mesh = new SplatMesh({ 
      url,
      onProgress: (e) => {
        if (onProgressRef.current) onProgressRef.current(e);
      },
      onLoad: () => {
        if (onLoadRef.current) onLoadRef.current();
      }
    });
    mesh.frustumCulled = false;
    return mesh;
  }, [url]);

  useEffect(() => {
    return () => {
      console.log("🧹 [SparkJS] Disposing SplatMesh");
      splatMesh.dispose();
    };
  }, [splatMesh]);

  return (
    <group position={position} rotation={[Math.PI, 0, 0]}>
      <group scale={scale}>
        {/* Translate the raw avatar position [0, -0.5, 1.35] to center the chest/body at the local origin [0, 0, 0] */}
        <primitive object={splatMesh} position={[0, 0.02, -1.35]} />
      </group>
    </group>
  );
}

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
function TiltingGroup({
  children,
  gyroOffset,
  autoOrbit,
  setAutoOrbit,
  lastInteractionTime,
  targetX,
  targetY,
  targetZ,
  controlsRef
}: {
  children: React.ReactNode;
  gyroOffset: { x: number; y: number };
  autoOrbit: boolean;
  setAutoOrbit: (val: boolean) => void;
  lastInteractionTime: React.MutableRefObject<number>;
  targetX: number;
  targetY: number;
  targetZ: number;
  controlsRef: React.MutableRefObject<any>;
}) {
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(() => {
    if (groupRef.current) {
      let targetRotY = gyroOffset.x * 0.4;
      let targetRotX = gyroOffset.y * 0.4;

      if (autoOrbit) {
        // Add a gentle 2D circular orbit (Lissajous path) for vertical and horizontal depth
        const elapsed = performance.now() / 1000;
        targetRotY += Math.sin(elapsed * 0.6) * 0.10;
        targetRotX += Math.cos(elapsed * 0.6) * 0.03;
      }

      // Smoothly lerp towards target gyro orientation
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.05);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.05);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

export default function Viewport3D({ selected2DImage, onBack, selectedTeam, onRestart }: Viewport3DProps) {
  const [plyUrl, setPlyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(5);
  const [gyroOffset, setGyroOffset] = useState({ x: 0, y: 0 });
  const [gyroPermission, setGyroPermission] = useState<"granted" | "denied" | "default">("default");
  const [show2D, setShow2D] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [targetX, setTargetX] = useState(0);
  const [targetY, setTargetY] = useState(0);
  const [targetZ, setTargetZ] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const lastInteractionTime = useRef(Date.now());
  const hasTriggered = useRef(false);

  // Reset auto-orbit on model load
  useEffect(() => {
    setAutoOrbit(true);
    setTargetX(0);
    setTargetY(0);
    setTargetZ(0);
    lastInteractionTime.current = Date.now();
  }, [plyUrl]);

  // Re-enable auto-orbit after 8 seconds of inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      if (!autoOrbit && Date.now() - lastInteractionTime.current > 8000) {
        setAutoOrbit(true);
        setTargetX(0);
        setTargetY(0);
        setTargetZ(0);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [autoOrbit]);

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
    setAutoOrbit(true);
    setTargetX(0);
    setTargetY(0);
    setTargetZ(0);
    lastInteractionTime.current = Date.now();

    if (controlsRef.current) {
      const MathUtils = THREE.MathUtils;
      const controls = controlsRef.current;
      const camera = controls.object;

      // Reset camera position to [0, 0.75, 4.0]
      camera.position.set(0, 2.0, 3.0);

      // Reset target to [0, 0, 0]
      controls.target.set(0, 0, 0);

      controls.update();
    }
  };

  const downloadModel = () => {
    if (!plyUrl) return;
    const isSpz = plyUrl.endsWith('.spz');
    const ext = isSpz ? 'spz' : 'ply';
    
    const link = document.createElement("a");
    link.href = plyUrl;
    link.download = `fanstudio_spatial_avatar.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRecordVideo = async () => {
    if (!controlsRef.current || recording) return;

    try {
      setRecording(true);
      setRecordCountdown(5);

      // 1. Reset camera view to ensure standard starting frame
      handleResetView();

      // 2. Wait 500ms for camera to settle and autoOrbit to engage
      await new Promise((resolve) => setTimeout(resolve, 500));

      const canvas = document.querySelector(".spark-canvas") as HTMLCanvasElement || 
                     document.querySelector("canvas") as HTMLCanvasElement;

      if (!canvas) {
        throw new Error("WebGL Canvas element not found.");
      }

      // 3. Capture 30 FPS stream from canvas
      const stream = canvas.captureStream(30);

      // 4. Check browser MIME support
      let mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm;codecs=vp8";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/mp4";
      }

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for high quality video output
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fanstudio_avatar_orbit.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setRecording(false);
      };

      // 5. Start recording
      recorder.start();

      // 6. Countdown loop
      let secondsLeft = 5;
      const interval = setInterval(() => {
        secondsLeft -= 1;
        setRecordCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(interval);
          recorder.stop();
        }
      }, 1000);

    } catch (err: any) {
      console.error("Failed to record video:", err);
      alert(`Could not record video: ${err.message || err}`);
      setRecording(false);
    }
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
              <>
                {!modelLoaded && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#121417]/80 backdrop-blur-md animate-fade-in">
                    <div className="w-12 h-12 rounded-full border-4 border-[#282d34] border-t-[#00F0FF] animate-spin mb-5 shadow-[0_0_15px_rgba(0,240,255,0.4)]" />
                    <h4 className="text-white font-headline tracking-widest text-sm uppercase">
                      DOWNLOADING MODEL
                    </h4>
                    {downloadProgress !== null && (
                      <p className="text-[#ADFF00] font-label text-[10px] mt-2 tracking-wider">
                        {downloadProgress}% COMPLETE
                      </p>
                    )}
                  </div>
                )}
                <Canvas
                  camera={{ position: [0, 2.0, 3.0], fov: 45 }}
                  gl={{ preserveDrawingBuffer: true, antialias: true }}
                  dpr={2}
                  className="w-full h-full bg-[#121417]"
                >
                <ambientLight intensity={1.5} />
                <directionalLight position={[5, 5, 5]} intensity={1.5} />

                <SparkSceneRenderer />

                <TiltingGroup
                  gyroOffset={gyroOffset}
                  autoOrbit={autoOrbit}
                  setAutoOrbit={setAutoOrbit}
                  lastInteractionTime={lastInteractionTime}
                  targetX={targetX}
                  targetY={targetY}
                  targetZ={targetZ}
                  controlsRef={controlsRef}
                >
                  <SparkSplat 
                    key={plyUrl} 
                    url={plyUrl} 
                    scale={2.4} 
                    position={[0, -0.3, 0]} 
                    onProgress={(e) => {
                      if (e.lengthComputable && e.total > 0) {
                        setDownloadProgress(Math.round((e.loaded / e.total) * 100));
                      }
                    }}
                    onLoad={() => setModelLoaded(true)}
                  />

                  {/* Invisible touch-to-focus collider mesh */}
                  <mesh
                    position={[0, 0, 0]}
                    onClick={(e) => {
                      e.stopPropagation();

                      // Clamp click coordinates relative to centered model
                      const clickX = Math.max(-1.0, Math.min(1.0, e.point.x));
                      const clickY = Math.max(-1.0, Math.min(1.0, e.point.y));
                      const clickZ = Math.max(-1.0, Math.min(1.0, e.point.z));

                      setTargetX(clickX);
                      setTargetY(clickY);
                      setTargetZ(clickZ);

                      setAutoOrbit(false);
                      lastInteractionTime.current = Date.now();
                    }}
                  >
                    <boxGeometry args={[2.0, 2.0, 2.0]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                </TiltingGroup>

                <OrbitControls
                  ref={controlsRef}
                  enableDamping
                  dampingFactor={0.05}
                  enablePan={false}
                  minDistance={2.0}
                  maxDistance={6.0}
                  minAzimuthAngle={-0.35}
                  maxAzimuthAngle={0.35}
                  minPolarAngle={1.2}
                  maxPolarAngle={1.6}
                  target={[0, 0, 0]}
                  onStart={() => {
                    setAutoOrbit(false);
                    lastInteractionTime.current = Date.now();
                  }}
                  onChange={() => {
                    lastInteractionTime.current = Date.now();
                  }}
                  makeDefault
                />
              </Canvas>
              </>
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

            {/* Download Video Button */}
            {!show2D && (
              <button
                onClick={handleRecordVideo}
                disabled={recording}
                className="w-full bg-[#FF007A] hover:bg-[#FF007A]/90 disabled:bg-[#FF007A]/50 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#FF007A]/15 transition-all text-xs font-black cursor-pointer"
              >
                <Film className="w-4.5 h-4.5 text-white" />
                {recording ? `RECORDING (${recordCountdown}s)` : "DOWNLOAD VIDEO"}
              </button>
            )}

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
                onClick={downloadModel}
                className="w-full bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-400" />
                EXPORT 3D MODEL
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
