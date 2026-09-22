/**
 * Centralized API & WebSocket Configuration for SAATHI-AI
 * Supports local development and production deployments via NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL.
 */

export const getApiBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/+$/, "");
  }
  
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    // Default local fallback if frontend is running on localhost/127.0.0.1 without env var
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8000`;
    }
    return window.location.origin;
  }
  
  return "http://127.0.0.1:8000";
};

export const getWebSocketUrl = (path: string): string => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const envWs = process.env.NEXT_PUBLIC_WS_URL;

  if (envWs && envWs.trim() !== "") {
    const baseWs = envWs.replace(/\/+$/, "");
    return `${baseWs}${cleanPath}`;
  }

  const baseUrl = getApiBaseUrl();

  if (baseUrl.startsWith("https://")) {
    return `${baseUrl.replace("https://", "wss://")}${cleanPath}`;
  }
  if (baseUrl.startsWith("http://")) {
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    const prefix = isLocal ? "ws://" : "wss://";
    return `${baseUrl.replace(/^https?:\/\//, prefix)}${cleanPath}`;
  }
  
  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}${cleanPath}`;
  }

  return `ws://127.0.0.1:8000${cleanPath}`;
};

