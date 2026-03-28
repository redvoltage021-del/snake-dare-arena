import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { LeaderboardManager } from "./src/server/leaderboardManager.js";
import { RoomManager } from "./src/server/roomManager.js";
import { SessionManager } from "./src/server/sessionManager.js";
import { UserStore } from "./src/server/userStore.js";
import { SNAKE_COLOR_OPTIONS } from "./src/shared/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const dataDir = path.join(__dirname, "data");

fs.mkdirSync(dataDir, { recursive: true });

const userStore = new UserStore({
  filePath: path.join(dataDir, "users.json"),
  snakeColors: SNAKE_COLOR_OPTIONS
});
const sessions = new SessionManager();

const leaderboard = new LeaderboardManager({
  userStore,
  onChange: (_entries, board) => {
    io.emit("leaderboardUpdated", { board, entries: leaderboard.getEntries({ board }) });
  }
});

const roomManager = new RoomManager(io, leaderboard);

function getBearerToken(headerValue) {
  const raw = String(headerValue || "");
  if (!raw.startsWith("Bearer ")) {
    return "";
  }

  return raw.slice(7).trim();
}

function getSessionUserFromToken(token) {
  const session = sessions.get(token);
  if (!session) {
    return null;
  }

  return userStore.getPublicUser(session.userId);
}

function getAuthenticatedUser(req) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    return null;
  }

  return {
    token,
    user: getSessionUserFromToken(token)
  };
}

function requireAuth(req, res, next) {
  const auth = getAuthenticatedUser(req);
  if (!auth?.user) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }

  req.auth = auth;
  next();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/shared", express.static(path.join(__dirname, "src/shared")));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/auth/register", (req, res) => {
  try {
    const user = userStore.createUser(req.body ?? {});
    const token = sessions.create(user.id);
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to create account." });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const user = userStore.authenticate(req.body ?? {});
    const token = sessions.create(user.id);
    res.json({ token, user });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to sign in." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = getBearerToken(req.headers.authorization);
  sessions.destroy(token);
  res.status(204).end();
});

app.get("/api/session", (req, res) => {
  const auth = getAuthenticatedUser(req);
  if (!auth?.user) {
    res.status(401).json({ message: "No active session." });
    return;
  }

  res.json({ user: auth.user });
});

app.patch("/api/profile", requireAuth, (req, res) => {
  try {
    const user = userStore.updateProfile(req.auth.user.id, req.body ?? {});
    io.emit("leaderboardUpdated", { board: "solo", entries: leaderboard.getEntries({ board: "solo" }) });
    io.emit("leaderboardUpdated", { board: "multiplayer", entries: leaderboard.getEntries({ board: "multiplayer" }) });
    res.json({
      user,
      leaderboard: leaderboard.getEntries({ board: "solo" })
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Unable to update profile." });
  }
});

app.get("/api/leaderboard", (req, res) => {
  const board = String(req.query.board || "solo").toLowerCase();
  res.json({ board, entries: leaderboard.getEntries({ board }) });
});

app.post("/api/progress/solo", requireAuth, (req, res) => {
  const entries = leaderboard.record({
    userId: req.auth.user.id,
    score: req.body?.score,
    mode: "Solo"
  });
  const user = userStore.getPublicUser(req.auth.user.id);
  io.emit("leaderboardUpdated", { board: "solo", entries });
  res.status(201).json({ board: "solo", entries, user });
});

app.get(/^\/(?!api\/|shared\/|socket\.io\/|health$).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const session = sessions.get(token);
  socket.data.userId = session?.userId ?? null;
  next();
});

io.on("connection", (socket) => {
  socket.emit("leaderboardUpdated", { board: "solo", entries: leaderboard.getEntries({ board: "solo" }) });

  socket.on("createRoom", () => {
    try {
      const user = userStore.getPublicUser(socket.data.userId);
      if (!user) {
        throw new Error("Sign in before creating a room.");
      }

      const room = roomManager.createRoom(socket, {
        userId: user.id,
        displayName: user.displayName,
        snakeColor: user.snakeColor
      });
      socket.emit("roomCreated", { roomCode: room.code });
    } catch (error) {
      socket.emit("roomError", { message: error.message || "Unable to create room." });
    }
  });

  socket.on("joinRoom", ({ code } = {}) => {
    try {
      const user = userStore.getPublicUser(socket.data.userId);
      if (!user) {
        throw new Error("Sign in before joining a room.");
      }

      const room = roomManager.joinRoom(socket, code, {
        userId: user.id,
        displayName: user.displayName,
        snakeColor: user.snakeColor
      });
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
