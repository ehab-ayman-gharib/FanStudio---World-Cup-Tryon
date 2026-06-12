const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:5000`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
};
export const API_BASE_URL = getApiBaseUrl();
