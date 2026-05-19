const DEFAULT_REMOTE_BACKEND_ORIGIN = "https://snake-lodu.onrender.com";
const STORAGE_KEY = "black-phoenix.backendOrigin";

function normalizeOrigin(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function resolveBackendOrigin() {
  if (typeof window === "undefined") {
    return DEFAULT_REMOTE_BACKEND_ORIGIN;
  }

  const override = normalizeOrigin(
    window.__BLACK_PHOENIX_BACKEND_ORIGIN__
      || window.localStorage?.getItem(STORAGE_KEY)
      || document.documentElement?.dataset.backendOrigin
  );

  if (override) {
    return override;
  }

  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".onrender.com")) {
    return window.location.origin;
  }

  return DEFAULT_REMOTE_BACKEND_ORIGIN;
}

export function buildBackendUrl(path = "/") {
  return new URL(path, `${resolveBackendOrigin()}/`).toString();
}

export function storeBackendOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized || typeof window === "undefined") {
    return false;
  }

  window.localStorage?.setItem(STORAGE_KEY, normalized);
  return true;
}
