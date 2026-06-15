const getApiBaseUrl = () => {
  const envVal = process.env.NEXT_PUBLIC_API_URL;
  if (envVal === "relative") {
    return "";
  }
  if (envVal) {
    return envVal;
  }
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://${hostname}:5000`;
    }
  }
  // Direct Modal URL fallback to prevent Vercel serverless 10s/60s timeout limit
  return "https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run";
};
export const API_BASE_URL = getApiBaseUrl();
