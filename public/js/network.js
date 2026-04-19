export class MultiplayerClient extends EventTarget {
  constructor() {
    super();
    this.roomCode = null;
    this.socket = window.io({
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

    ["roomCreated", "roomJoined", "roomLeft", "roomState", "roomError"].forEach((eventName) => {
      this.socket.on(eventName, (payload = {}) => {
        if (eventName === "roomCreated" || eventName === "roomJoined") {
          this.roomCode = payload.roomCode;
        }
        if (eventName === "roomLeft") {
          this.roomCode = null;
        }
        this.emitEvent(eventName, payload);
      });
    });
  }

  createRoom(playerProfile, roomOptions = {}) {
    this.socket.emit("createRoom", { playerProfile, roomOptions });
  }

  joinRoom(code, playerProfile) {
    this.socket.emit("joinRoom", { code, playerProfile });
  }

  leaveRoom() {
    this.socket.emit("leaveRoom");
  }

  sendDirection(direction) {
    if (!this.roomCode) {
      return;
    }

    this.socket.emit("direction", { direction });
  }

  requestRespawn() {
    if (!this.roomCode) {
      return;
    }

    this.socket.emit("requestRespawn");
  }
}
