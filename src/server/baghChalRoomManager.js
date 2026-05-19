import { createRoomCode } from "../shared/utils.js";
import { BaghChalRoom } from "./baghChalRoom.js";

export class BaghChalRoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.socketRooms = new Map();
  }

  createRoom(socket, playerProfile, roomOptions = {}) {
    this.detachSocket(socket);

    const code = createRoomCode(new Set(this.rooms.keys()));
    const room = new BaghChalRoom({
      code,
      io: this.io,
      onEmpty: () => {
        this.rooms.delete(code);
      }
    });

    this.rooms.set(code, room);
    socket.join(room.channel);
    try {
      const result = room.addPlayer(socket, playerProfile, roomOptions);
      this.socketRooms.set(socket.id, code);
      return result;
    } catch (error) {
      socket.leave(room.channel);
      this.rooms.delete(code);
      throw error;
    }
  }

  joinRoom(socket, code, playerProfile, roomOptions = {}) {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new Error("Team code not found.");
    }

    this.detachSocket(socket);
    socket.join(room.channel);
    try {
      const result = room.addPlayer(socket, playerProfile, roomOptions);
      this.socketRooms.set(socket.id, roomCode);
      return result;
    } catch (error) {
      socket.leave(room.channel);
      throw error;
    }
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

  submitAction(socketId, action) {
    const roomCode = this.socketRooms.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : null;
    room?.submitAction(socketId, action);
  }

  requestReset(socketId) {
    const roomCode = this.socketRooms.get(socketId);
    const room = roomCode ? this.rooms.get(roomCode) : null;
    room?.requestReset(socketId);
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

    if (currentRoom?.channel) {
      socket.leave(currentRoom.channel);
    }
    this.socketRooms.delete(socket.id);
  }
}
