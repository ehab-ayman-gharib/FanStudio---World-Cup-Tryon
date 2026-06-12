"use client";

import React, { useRef, useState, useEffect } from "react";
import { Camera, Upload, RotateCw, Check, AlertCircle } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onBack: () => void;
}

export default function CameraCapture({ onCapture, onBack }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [useWebcam, setUseWebcam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

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
          video: { width: 640, height: 640, facingMode: "user" },
          audio: false,
        })
        .then((s) => {
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
  }, [useWebcam]);

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
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        
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
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirm = () => {
    if (capturedPreview) {
      onCapture(capturedPreview);
    }
  };

  const handleRetake = () => {
    setCapturedPreview(null);
    setUseWebcam(true);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">
          Identity Capture
        </h2>
        <p className="text-zinc-400 text-xs mt-1">
          Take a selfie or upload a photo of your face.
        </p>
      </div>

      {/* Camera / Preview Viewport */}
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-center justify-center">
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
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* Selfie Silhouette Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
              <svg
                viewBox="0 0 100 100"
                className="w-4/5 h-4/5 stroke-emerald-500 stroke-1 fill-none"
              >
                {/* Outer guide circle */}
                <circle cx="50" cy="50" r="45" strokeDasharray="3 3" />
                {/* Face head outline */}
                <ellipse cx="50" cy="42" rx="16" ry="22" stroke="white" strokeWidth="1.5" />
                {/* Neck line */}
                <path d="M42 63 C 42 75, 45 75, 45 85" stroke="white" strokeWidth="1.5" />
                <path d="M58 63 C 58 75, 55 75, 55 85" stroke="white" strokeWidth="1.5" />
                {/* Eyes guideline */}
                <line x1="38" y1="42" x2="62" y2="42" stroke="white" strokeWidth="0.5" strokeDasharray="1 1" />
              </svg>
            </div>
            <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 pointer-events-none">
              <span className="text-[10px] text-zinc-300 font-semibold tracking-wide uppercase">
                Align Face in Center
              </span>
            </div>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-zinc-900/30 transition-all p-6 text-center">
            <Upload className="w-10 h-10 text-zinc-500 mb-3 group-hover:text-emerald-500 transition-colors" />
            <span className="text-zinc-300 font-semibold text-sm">Upload custom photo</span>
            <span className="text-zinc-500 text-xs mt-1">PNG, JPG, or WEBP up to 5MB</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2.5">
        {capturedPreview ? (
          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700 transition-all text-sm"
            >
              <RotateCw className="w-4 h-4" />
              Retake
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 font-extrabold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm"
            >
              <Check className="w-4 h-4" />
              Confirm
            </button>
          </div>
        ) : (
          <>
            {useWebcam ? (
              <button
                onClick={capturePhoto}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 font-extrabold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all text-sm"
              >
                <Camera className="w-5 h-5" />
                Capture Photo
              </button>
            ) : (
              <button
                onClick={() => setUseWebcam(true)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 border border-zinc-700 transition-all text-sm"
              >
                <Camera className="w-4 h-4" />
                Use Web Camera
              </button>
            )}

            {useWebcam && (
              <button
                onClick={() => setUseWebcam(false)}
                className="w-full bg-zinc-800/40 hover:bg-zinc-800 text-zinc-300 font-semibold py-2.5 rounded-2xl flex items-center justify-center gap-2 border border-zinc-800/80 transition-all text-xs"
              >
                <Upload className="w-4 h-4" />
                Upload Photo Instead
              </button>
            )}
          </>
        )}

        <button
          onClick={onBack}
          className="w-full text-zinc-500 hover:text-zinc-300 font-medium py-2 text-xs mt-1 transition-colors"
        >
          ← Go Back to Team Selection
        </button>
      </div>
    </div>
  );
}
