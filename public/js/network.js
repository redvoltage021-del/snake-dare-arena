export class MultiplayerClient extends EventTarget {
  constructor() {
    super();
    this.socket = window.io();
    this.roomCode = null;
    this.bindSocketEvents();
  }

  on(eventName, handler) {
    const listener = (event) => handler(event.detail);
    this.addEventListener(eventName, listener);
    return () => this.removeEventListener(eventName, listener);
  }

  emitEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  bindSocketEvents() {
    this.socket.on("connect", () => this.emitEvent("connect"));
    this.socket.on("disconnect", () => this.emitEvent("disconnect"));

    ["roomCreated", "roomJoined", "roomLeft", "roomState", "roomError", "leaderboardUpdated"].forEach((eventName) => {
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

  createRoom(name) {
    this.socket.emit("createRoom", { name });
  }

  joinRoom(code, name) {
    this.socket.emit("joinRoom", { code, name });
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
}
