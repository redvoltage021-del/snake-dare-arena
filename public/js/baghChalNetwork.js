import { resolveBackendOrigin } from "./backendConfig.js";
import { ensureSocketIoLoaded } from "./socketLoader.js";

export async function createBaghChalClient() {
  await ensureSocketIoLoaded();
  return new BaghChalOnlineClient({
    backendOrigin: resolveBackendOrigin()
  });
}

export class BaghChalOnlineClient extends EventTarget {
  constructor({ backendOrigin } = {}) {
    super();
    this.roomCode = null;
    this.socket = window.io(backendOrigin, {
      autoConnect: false
    });
    this.bindSocketEvents();
    this.socket.connect();
  }

  on(eventName, handler) {
    const listener = (event) => handler(event.detail);
    this.addEventListener(eventName, listener);
    return () => this.removeEventListener(eventName, listener);
  }

  emitEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  disconnect() {
    this.roomCode = null;
    this.socket.disconnect();
  }

  bindSocketEvents() {
    this.socket.on("connect", () => this.emitEvent("connect"));
    this.socket.on("disconnect", () => this.emitEvent("disconnect"));

    [
      "baghChal:roomCreated",
      "baghChal:roomJoined",
      "baghChal:roomLeft",
      "baghChal:state",
      "baghChal:error"
    ].forEach((eventName) => {
      this.socket.on(eventName, (payload = {}) => {
        if (eventName === "baghChal:roomCreated" || eventName === "baghChal:roomJoined") {
          this.roomCode = payload.roomCode;
        }
        if (eventName === "baghChal:roomLeft") {
          this.roomCode = null;
        }
        this.emitEvent(eventName, payload);
      });
    });
  }

  createRoom(playerProfile, roomOptions = {}) {
    this.socket.emit("baghChal:createRoom", { playerProfile, roomOptions });
  }

  joinRoom(code, playerProfile, roomOptions = {}) {
    this.socket.emit("baghChal:joinRoom", { code, playerProfile, roomOptions });
  }

  leaveRoom() {
    this.socket.emit("baghChal:leaveRoom");
  }

  submitAction(action) {
    if (!this.roomCode) {
      return;
    }

    this.socket.emit("baghChal:action", { action });
  }

  requestReset() {
    if (!this.roomCode) {
      return;
    }

    this.socket.emit("baghChal:requestReset");
  }
}
