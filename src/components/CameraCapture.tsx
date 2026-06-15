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
    <div className="w-full max-w-md mx-auto bg-[#1b1e22]/90 border border-[#282d34] rounded-3xl p-6 shadow-2xl backdrop-blur-xl flex flex-col gap-6 animate-fade-in-up">
      <div className="text-center">
        <h2 className="text-3xl font-headline tracking-wider text-white uppercase">
          IDENTITY CAPTURE
        </h2>
        <p className="text-slate-500 text-xs mt-1 font-body">
          Take a selfie or upload a photo of your face.
        </p>
      </div>

      {/* Camera / Preview Viewport */}
      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#121417] border border-[#282d34] flex items-center justify-center">
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
            {/* Selfie Silhouette Overlay in Cyan */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
              <svg
                viewBox="0 0 100 100"
                className="w-4/5 h-4/5 stroke-[#00F0FF] stroke-1 fill-none animate-pulse"
              >
                {/* Outer guide circle */}
                <circle cx="50" cy="50" r="45" strokeDasharray="3 3" />
                {/* Face head outline */}
                <ellipse cx="50" cy="42" rx="16" ry="22" stroke="#00F0FF" strokeWidth="1.5" />
                {/* Neck line */}
                <path d="M42 63 C 42 75, 45 75, 45 85" stroke="#00F0FF" strokeWidth="1.5" />
                <path d="M58 63 C 58 75, 55 75, 55 85" stroke="#00F0FF" strokeWidth="1.5" />
                {/* Eyes guideline */}
                <line x1="38" y1="42" x2="62" y2="42" stroke="#00F0FF" strokeWidth="0.5" strokeDasharray="1 1" />
              </svg>
            </div>
            <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-[#121417]/85 backdrop-blur-md px-3.5 py-1 rounded-full border border-[#282d34] pointer-events-none shadow-sm">
              <span className="text-[9px] text-[#00F0FF] font-label font-bold tracking-wider uppercase">
                ALIGN FACE IN CENTER
              </span>
            </div>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-[#1b1e22]/50 transition-all p-6 text-center group">
            <Upload className="w-10 h-10 text-slate-500 mb-3 group-hover:text-[#00F0FF] transition-colors" />
            <span className="text-white font-body font-semibold text-sm">Upload custom photo</span>
            <span className="text-slate-500 text-xs mt-1 font-body">PNG, JPG, or WEBP up to 5MB</span>
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
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3.5 py-2.5 rounded-xl font-body">
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
              className="flex-1 bg-[#121417] hover:bg-[#121417]/80 text-white font-headline tracking-wide uppercase py-3.5 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-sm cursor-pointer"
            >
              <RotateCw className="w-4 h-4" />
              RETAKE
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-wide uppercase py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-sm cursor-pointer"
            >
              <Check className="w-4 h-4" />
              CONFIRM
            </button>
          </div>
        ) : (
          <>
            {useWebcam ? (
              <button
                onClick={capturePhoto}
                className="w-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-[#121417] font-headline tracking-wide uppercase py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#00F0FF]/15 transition-all text-sm cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                CAPTURE PHOTO
              </button>
            ) : (
              <button
                onClick={() => setUseWebcam(true)}
                className="w-full bg-[#1b1e22] hover:bg-[#1b1e22]/80 text-white font-headline tracking-wide uppercase py-3.5 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34] transition-all text-sm cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                USE WEB CAMERA
              </button>
            )}

            {useWebcam && (
              <button
                onClick={() => setUseWebcam(false)}
                className="w-full bg-[#1b1e22]/55 hover:bg-[#1b1e22]/80 text-slate-400 hover:text-white font-label font-bold py-2.5 rounded-2xl flex items-center justify-center gap-2 border border-[#282d34]/60 transition-all text-[10px] uppercase tracking-wider cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                UPLOAD PHOTO INSTEAD
              </button>
            )}
          </>
        )}

        <button
          onClick={onBack}
          className="w-full text-slate-500 hover:text-[#00F0FF] font-label font-bold py-2 text-[10px] tracking-wider uppercase mt-1 transition-colors cursor-pointer"
        >
          ← GO BACK TO TEAM SELECTION
        </button>
      </div>
    </div>
  );
}
