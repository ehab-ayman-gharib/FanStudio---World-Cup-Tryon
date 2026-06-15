"use client";

import React, { useRef, useState, useEffect } from "react";
import { Camera, Upload, RotateCw, Check, AlertCircle, ArrowLeft, Battery, Smile, RefreshCw } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onBack: () => void;
}

export default function CameraCapture({ onCapture, onBack }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [useWebcam, setUseWebcam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [cameraTrigger, setCameraTrigger] = useState(0);

  // Initialize webcam
  useEffect(() => {
    if (useWebcam) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Camera requires HTTPS. Please upload an image instead.");
        setUseWebcam(false);
        return;
      }
      navigator.mediaDevices
        .getUserMedia({
          video: { width: 640, height: 640, facingMode: facingMode },
          audio: false,
        })
        .then((s) => {
          setError(null);
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          setError("Could not access camera. Please upload an image instead.");
          setUseWebcam(false);
        });
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [useWebcam, facingMode, cameraTrigger]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Match canvas dimensions to webcam stream square
        const size = Math.min(video.videoWidth, video.videoHeight) || 640;
        canvas.width = size;
        canvas.height = size;
        
        // Crop video feed to square center
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        
        // If front camera is mirrored, flip context
        if (facingMode === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        
        // Get base64 string
        const base64 = canvas.toDataURL("image/png");
        setCapturedPreview(base64);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCapturedPreview(reader.result);
          setUseWebcam(false);
          stopCamera();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const handleConfirm = () => {
    if (capturedPreview) {
      onCapture(capturedPreview);
    }
  };

  const handleRetake = () => {
    setCapturedPreview(null);
    setUseWebcam(true);
    setCameraTrigger((prev) => prev + 1);
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-5 animate-fade-in-up pb-24 relative">
      {/* 1. BRAND TOP BAR */}
      <div className="grid grid-cols-3 items-center border-b border-[#282d34]/60 pb-3">
        <div className="flex justify-start">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-[#1b1e22] transition-all cursor-pointer"
            title="Back to team selector"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <span className="font-headline text-2xl sm:text-3xl tracking-widest text-[#ADFF00] font-black uppercase text-center">
          FANSTUDIO
        </span>
        <div className="flex justify-end text-[9px] font-label font-bold text-slate-500 tracking-wider">
          STEP 02/04
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
          <div className="h-1.5 bg-[#ADFF00] rounded-full" />
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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* 3. IMMERSIVE CAMERA VIEWPORT */}
      <div className="relative aspect-[3/4] w-full max-w-md mx-auto rounded-3xl overflow-hidden bg-[#121417] border-2 border-[#282d34] flex flex-col justify-between shadow-2xl">
        
        {/* MAIN FEED VIEWPORT CONTENT */}
        <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
          {capturedPreview ? (
            <img
              src={capturedPreview}
              alt="Selfie Preview"
              className="w-full h-full object-cover"
            />
          ) : useWebcam ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
              />

              {/* High-Tech HUD Face Guide & Brackets Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                {/* Dashed Rounded Guide Box (Stadium/Squircle outline) */}
                <div className="w-[82%] h-[72%] border-2 border-dashed border-[#ADFF00]/65 rounded-[80px] relative flex flex-col items-center justify-center bg-black/10 backdrop-blur-[0.5px]">
                  
                  {/* Corner Brackets aligned exactly with this container */}
                  {/* Top-Left Bracket */}
                  <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-[#ADFF00] rounded-tl-2xl" />
                  {/* Top-Right Bracket */}
                  <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-[#ADFF00] rounded-tr-2xl" />
                  {/* Bottom-Left Bracket */}
                  <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-[#ADFF00] rounded-bl-2xl" />
                  {/* Bottom-Right Bracket */}
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-[#ADFF00] rounded-br-2xl" />

                  {/* Smile alignment custom outline face SVG */}
                  <div className="z-20 text-[#00F0FF] mb-2 flex items-center justify-center">
                    <svg viewBox="0 0 60 60" className="w-16 h-16 stroke-[#00F0FF] fill-none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {/* Head outline */}
                      <circle cx="30" cy="30" r="22" />
                      {/* Hair sweep */}
                      <path d="M12 20 C 20 10, 40 10, 48 20" />
                      <path d="M18 16 C 25 12, 35 12, 42 16" />
                      {/* Eyes */}
                      <circle cx="21" cy="28" r="2.5" fill="#00F0FF" />
                      <circle cx="39" cy="28" r="2.5" fill="#00F0FF" />
                      {/* Smile */}
                      <path d="M22 38 Q 30 46 38 38" />
                    </svg>
                  </div>
                  
                  {/* Static Center Label (Floating text without black background box) */}
                  <span className="text-xs sm:text-sm text-[#00F0FF] font-label font-bold tracking-widest uppercase z-20 text-center leading-none mt-2">
                    CENTER YOUR FACE
                  </span>

                  {/* Glowing Scanning Laser Line */}
                  <div className="absolute left-0 right-0 h-[3px] bg-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.8),_0_0_20px_rgba(0,240,255,0.5)] animate-scan pointer-events-none z-10" />
                </div>
              </div>
            </>
          ) : (
            <div
              onClick={triggerUpload}
              className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-white/5 transition-all p-6 text-center group bg-[#121417] dot-grid"
            >
              <div className="w-16 h-16 rounded-full bg-[#1b1e22] border border-[#282d34] flex items-center justify-center mb-4 text-slate-500 group-hover:text-[#ADFF00] group-hover:border-[#ADFF00]/40 transition-all shadow-lg">
                <Upload className="w-6 h-6" />
              </div>
              <span className="text-white font-headline text-lg sm:text-xl uppercase tracking-wider">
                Upload Custom Photo
              </span>
              <span className="text-slate-500 text-xs mt-2 font-body max-w-xs">
                Tap to select a JPG, PNG, or WEBP selfie from your device library.
              </span>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 rounded-xl font-body max-w-md mx-auto w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. SHUTTER & FALLBACK BUTTONS CONTROL BAR */}
      <div className="w-full max-w-md mx-auto bg-[#1b1e22]/50 border border-[#282d34]/60 rounded-3xl p-5 backdrop-blur-md shadow-lg flex flex-col items-center gap-4">
        
        {capturedPreview ? (
          /* PREVIEW CONFIRMATION ACTION BUTTONS FLOW */
          <div className="flex gap-4 w-full">
            <button
              onClick={handleRetake}
              className="flex-1 bg-[#121417] hover:bg-[#121417]/85 text-white font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-xs font-bold cursor-pointer"
            >
              <RotateCw className="w-4 h-4 text-slate-400" />
              RETAKE
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-[#ADFF00] hover:bg-[#ADFF00]/95 text-[#121417] font-headline tracking-widest uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#ADFF00]/15 transition-all text-xs font-black cursor-pointer"
            >
              <Check className="w-4.5 h-4.5" />
              CONFIRM PHOTO
            </button>
          </div>
        ) : (
          /* ACTIVE CAMERA CONTROL FLOW */
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex items-center justify-between w-full px-6">
              
              {/* Left Side: Upload Button */}
              <button
                onClick={triggerUpload}
                className="w-14 h-14 bg-[#121417]/80 hover:bg-[#1b1e22] border border-[#282d34] rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:border-[#ADFF00]/40 transition-all cursor-pointer shadow-md"
                title="Upload photo from library"
              >
                <Upload className="w-5 h-5" />
              </button>

              {/* Center: Large Shutter Circle Button */}
              {useWebcam ? (
                <div className="w-20 h-20 rounded-full border-4 border-[#ADFF00]/30 p-1 flex items-center justify-center">
                  <button
                    onClick={capturePhoto}
                    className="w-14 h-14 bg-[#ADFF00] hover:bg-[#ADFF00]/95 rounded-full cursor-pointer transition-all active:scale-95 shadow-md flex items-center justify-center text-[#121417]"
                    title="Capture photo"
                  >
                    <Camera className="w-6 h-6" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full border-4 border-[#00F0FF]/30 p-1 flex items-center justify-center">
                  <button
                    onClick={() => setUseWebcam(true)}
                    className="w-14 h-14 bg-[#00F0FF] hover:bg-[#00F0FF]/95 rounded-full cursor-pointer transition-all active:scale-95 shadow-md flex items-center justify-center text-[#121417]"
                    title="Start webcam"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Right Side: Flip / Switch Camera facingMode or toggle */}
              <button
                onClick={useWebcam ? toggleCameraFacing : () => setUseWebcam(true)}
                className="w-14 h-14 bg-[#121417]/80 hover:bg-[#1b1e22] border border-[#282d34] rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:border-[#ADFF00]/40 transition-all cursor-pointer shadow-md"
                title="Switch Camera source"
              >
                <RotateCw className="w-5 h-5" />
              </button>

            </div>

            {/* Tap for Photo Monospace Label */}
            <span className="text-[10px] text-[#ADFF00] font-label font-bold uppercase tracking-widest mt-1">
              {useWebcam ? "Tap for Photo" : "Webcam Off"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
