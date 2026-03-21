import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { LeaderboardManager } from "./src/server/leaderboardManager.js";
import { RoomManager } from "./src/server/roomManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const leaderboard = new LeaderboardManager({
  onChange: () => {
    io.emit("leaderboardUpdated", { board: "solo", entries: leaderboard.getEntries({ board: "solo" }) });
  }
});

const roomManager = new RoomManager(io, leaderboard);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/shared", express.static(path.join(__dirname, "src/shared")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/leaderboard", (req, res) => {
  const board = String(req.query.board || "solo").toLowerCase();
  res.json({ board, entries: leaderboard.getEntries({ board }) });
});

app.post("/api/leaderboard", (req, res) => {
  const entries = leaderboard.record(req.body ?? {});
  res.status(201).json({ board: "solo", entries });
});

app.get(/^\/(?!api\/|shared\/|socket\.io\/|health$).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("leaderboardUpdated", { board: "solo", entries: leaderboard.getEntries({ board: "solo" }) });

  socket.on("createRoom", ({ name } = {}) => {
    try {
      const room = roomManager.createRoom(socket, name);
      socket.emit("roomCreated", { roomCode: room.code });
    } catch (error) {
      socket.emit("roomError", { message: error.message || "Unable to create room." });
    }
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    try {
      const room = roomManager.joinRoom(socket, code, name);
      socket.emit("roomJoined", { roomCode: room.code });
    } catch (error) {
      socket.emit("roomError", { message: error.message || "Unable to join room." });
    }
  });

  socket.on("leaveRoom", () => {
    roomManager.leaveRoom(socket);
    socket.emit("roomLeft");
  });

  socket.on("direction", ({ direction } = {}) => {
    roomManager.setDirection(socket.id, direction);
  });

  socket.on("disconnect", () => {
    roomManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Snake Dare Arena live on http://localhost:${PORT}`);
});
