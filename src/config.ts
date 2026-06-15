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
  // Default to relative paths (Next.js route handlers) on Vercel/production,
  // which securely proxy the requests to your Modal backend over HTTPS.
  return "";
};
export const API_BASE_URL = getApiBaseUrl();
