const getApiBaseUrl = () => {
  const envVal = process.env.NEXT_PUBLIC_API_URL;
  if (envVal === "relative") {
    return "";
  }
  if (envVal) {
    return envVal;
  }
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:5000`;
  }
  return "http://localhost:5000";
};
export const API_BASE_URL = getApiBaseUrl();
