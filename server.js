import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { RoomManager } from "./src/server/roomManager.js";
import { UserStore } from "./src/server/userStore.js";
import { SNAKE_COLOR_OPTIONS } from "./src/shared/config.js";
import { sanitizeName } from "./src/shared/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager(io);
const legacyUserFilePath = path.join(__dirname, "data", "users.json");
const legacyUserStore = fs.existsSync(legacyUserFilePath)
  ? new UserStore({
      filePath: legacyUserFilePath,
      snakeColors: SNAKE_COLOR_OPTIONS
    })
  : null;

function normalizePlayerProfile(profile = {}, socketId = "") {
  const fallbackColor = SNAKE_COLOR_OPTIONS[0];
  const rawColor = String(profile.snakeColor || "");
  const rawUserId = String(profile.userId || "").trim();

  return {
    userId: rawUserId || `device-${socketId || Date.now()}`,
    displayName: sanitizeName(profile.displayName, "Arena Snake"),
    snakeColor: SNAKE_COLOR_OPTIONS.includes(rawColor) ? rawColor : fallbackColor
  };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
}));
app.use("/shared", express.static(path.join(__dirname, "src/shared"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
}));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/bagh-chal", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "bagh-chal.html"));
});

app.get("/portal", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/snake", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "snake.html"));
});

app.post("/api/legacy-auth/login", (req, res) => {
  try {
    if (!legacyUserStore) {
      throw new Error("No legacy server profiles are available for import.");
    }

    const user = legacyUserStore.authenticate(req.body ?? {});
    res.json({ user });
  } catch (error) {
    res.status(404).json({ message: error.message || "Legacy profile not found." });
  }
});

app.get(/^\/(?!api\/|socket\.io\/|shared\/|health$).*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  socket.on("createRoom", ({ playerProfile, roomOptions } = {}) => {
    try {
      const room = roomManager.createRoom(socket, normalizePlayerProfile(playerProfile, socket.id), roomOptions);
      socket.emit("roomCreated", { roomCode: room.code, respawnMode: room.respawnMode });
    } catch (error) {
      socket.emit("roomError", { message: error.message || "Unable to create room." });
    }
  });

  socket.on("joinRoom", ({ code, playerProfile } = {}) => {
    try {
      const room = roomManager.joinRoom(socket, code, normalizePlayerProfile(playerProfile, socket.id));
      socket.emit("roomJoined", { roomCode: room.code, respawnMode: room.respawnMode });
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

  socket.on("requestRespawn", () => {
    roomManager.requestRespawn(socket.id);
  });

  socket.on("disconnect", () => {
    roomManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`Snake Lodu Arcade live on http://localhost:${PORT}`);
});
