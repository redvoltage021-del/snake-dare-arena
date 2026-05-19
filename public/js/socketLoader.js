import { buildBackendUrl } from "./backendConfig.js";

let socketLoaderPromise = null;

function resolveLoadedIo() {
  if (typeof window.io === "function") {
    return window.io;
  }

  throw new Error("Realtime client did not finish loading.");
}

export function ensureSocketIoLoaded() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Realtime client is only available in the browser."));
  }

  if (typeof window.io === "function") {
    return Promise.resolve(window.io);
  }

  if (socketLoaderPromise) {
    return socketLoaderPromise;
  }

  socketLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-socket-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => {
        try {
          resolve(resolveLoadedIo());
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      existing.addEventListener("error", () => {
        socketLoaderPromise = null;
        reject(new Error("Realtime service script failed to load."));
      }, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = buildBackendUrl("/socket.io/socket.io.js");
    script.async = true;
    script.dataset.socketLoader = "true";
    script.addEventListener("load", () => {
      try {
        resolve(resolveLoadedIo());
      } catch (error) {
        socketLoaderPromise = null;
        reject(error);
      }
    }, { once: true });
    script.addEventListener("error", () => {
      socketLoaderPromise = null;
      reject(new Error("Realtime service script failed to load."));
    }, { once: true });
    document.head.appendChild(script);
  });

  return socketLoaderPromise;
}
