import { createRoomCode } from "../shared/utils.js";
import { MultiplayerRoom } from "./multiplayerRoom.js";

export class RoomManager {
  constructor(io, leaderboardManager) {
    this.io = io;
    this.leaderboardManager = leaderboardManager;
    this.rooms = new Map();
    this.socketRooms = new Map();
  }

  createRoom(socket, playerProfile, roomOptions = {}) {
    this.detachSocket(socket);

    const code = createRoomCode(new Set(this.rooms.keys()));
    const room = new MultiplayerRoom({
      code,
      roomOptions,
      io: this.io,
      leaderboardManager: this.leaderboardManager,
      onEmpty: () => {
        this.rooms.delete(code);
      }
    });

    this.rooms.set(code, room);
    this.socketRooms.set(socket.id, code);
    socket.join(code);
    room.addPlayer(socket, playerProfile);
    return room;
  }

  joinRoom(socket, code, playerProfile) {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new Error("Room code not found.");
    }

    this.detachSocket(socket);
    this.socketRooms.set(socket.id, roomCode);
    socket.join(roomCode);
    room.addPlayer(socket, playerProfile);
    return room;
  }

  leaveRoom(socket) {
    this.detachSocket(socket);
  }

  handleDisconnect(socketId) {
    const roomCode = this.socketRooms.get(socketId);
    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);
    room?.removePlayer(socketId);
    if (room?.isEmpty()) {
      this.rooms.delete(roomCode);
    }
    this.socketRooms.delete(socketId);
  }

  setDirection(socketId, directionName) {
    const roomCode = this.socketRooms.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : null;
    room?.setDirection(socketId, directionName);
  }

  requestRespawn(socketId) {
    const roomCode = this.socketRooms.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : null;
    room?.requestRespawn(socketId);
  }

  detachSocket(socket) {
    const currentRoomCode = this.socketRooms.get(socket.id);
    if (!currentRoomCode) {
      return;
    }

    const currentRoom = this.rooms.get(currentRoomCode);
    currentRoom?.removePlayer(socket.id);
    if (currentRoom?.isEmpty()) {
      this.rooms.delete(currentRoomCode);
    }

    socket.leave(currentRoomCode);
    this.socketRooms.delete(socket.id);
  }
}
