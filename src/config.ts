const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `http://${hostname}:5000`;
    }
  }
  // Force direct Modal URL in production to prevent Vercel serverless 10s/60s timeout limits
  return "https://ehab-ayman-gh--fanstudio-worldcup-2026-serve.modal.run";
};
export const API_BASE_URL = getApiBaseUrl();
