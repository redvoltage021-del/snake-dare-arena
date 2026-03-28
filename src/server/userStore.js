import fs from "fs";
import path from "path";
import crypto from "crypto";
import { MAX_LEADERBOARD_ENTRIES } from "../shared/config.js";
import { sanitizeName } from "../shared/utils.js";

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createDefaultStats() {
  return {
    totalRuns: 0,
    totalScore: 0,
    solo: {
      bestScore: 0,
      lastScore: 0,
      runs: 0,
      lastPlayedAt: null
    },
    multiplayer: {
      bestScore: 0,
      lastScore: 0,
      runs: 0,
      wins: 0,
      lastPlayedAt: null
    }
  };
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, { salt, hash }) {
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function sanitizeUsername(username) {
  return String(username ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18);
}

function normalizeColor(color, allowedColors) {
  return allowedColors.includes(color) ? color : allowedColors[0];
}

export class UserStore {
  constructor({ filePath, snakeColors = [] } = {}) {
    this.filePath = filePath;
    this.snakeColors = snakeColors;
    this.data = readJson(filePath, { users: [] });
    if (!Array.isArray(this.data.users)) {
      this.data = { users: [] };
    }
    this.persist();
  }

  persist() {
    writeJson(this.filePath, this.data);
  }

  getUserById(userId) {
    return this.data.users.find((user) => user.id === userId) ?? null;
  }

  getUserByUsername(username) {
    const key = sanitizeUsername(username);
    return this.data.users.find((user) => user.usernameKey === key) ?? null;
  }

  createUser({ username, password, displayName, snakeColor }) {
    const usernameKey = sanitizeUsername(username);
    if (usernameKey.length < 3) {
      throw new Error("Username must be at least 3 letters or numbers.");
    }

    if (String(password ?? "").length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }

    if (this.getUserByUsername(usernameKey)) {
      throw new Error("That username is already taken.");
    }

    const safeDisplayName = sanitizeName(displayName || usernameKey, usernameKey);
    const now = new Date().toISOString();
    const passwordRecord = createPasswordRecord(password);

    const user = {
      id: crypto.randomUUID(),
      username: usernameKey,
      usernameKey,
      displayName: safeDisplayName,
      snakeColor: normalizeColor(snakeColor, this.snakeColors),
      createdAt: now,
      updatedAt: now,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      stats: createDefaultStats()
    };

    this.data.users.push(user);
    this.persist();
    return this.getPublicUser(user.id);
  }

  authenticate({ username, password }) {
    const user = this.getUserByUsername(username);
    if (!user) {
      throw new Error("Account not found.");
    }

    if (!verifyPassword(password, { salt: user.passwordSalt, hash: user.passwordHash })) {
      throw new Error("Incorrect password.");
    }

    return this.getPublicUser(user.id);
  }

  getPublicUser(userId) {
    const user = this.getUserById(userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      snakeColor: user.snakeColor,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      stats: {
        totalRuns: user.stats.totalRuns,
        totalScore: user.stats.totalScore,
        soloBest: user.stats.solo.bestScore,
        soloRuns: user.stats.solo.runs,
        soloLastScore: user.stats.solo.lastScore,
        multiplayerBest: user.stats.multiplayer.bestScore,
        multiplayerRuns: user.stats.multiplayer.runs,
        multiplayerWins: user.stats.multiplayer.wins,
        multiplayerLastScore: user.stats.multiplayer.lastScore
      }
    };
  }

  updateProfile(userId, { displayName, snakeColor }) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error("Account not found.");
    }

    user.displayName = sanitizeName(displayName || user.displayName, user.displayName);
    user.snakeColor = normalizeColor(snakeColor || user.snakeColor, this.snakeColors);
    user.updatedAt = new Date().toISOString();
    this.persist();
    return this.getPublicUser(user.id);
  }

  recordGameResult({ userId, board, score, won = false }) {
    const user = this.getUserById(userId);
    const safeScore = Number(score);

    if (!user || !Number.isFinite(safeScore) || safeScore < 0) {
      return this.getLeaderboard({ board });
    }

    const now = new Date().toISOString();
    const bucket = board === "multiplayer" ? user.stats.multiplayer : user.stats.solo;

    user.stats.totalRuns += 1;
    user.stats.totalScore += safeScore;
    bucket.runs += 1;
    bucket.lastScore = safeScore;
    bucket.bestScore = Math.max(bucket.bestScore, safeScore);
    bucket.lastPlayedAt = now;
    if (board === "multiplayer" && won) {
      bucket.wins += 1;
    }
    user.updatedAt = now;

    this.persist();
    return this.getLeaderboard({ board });
  }

  getLeaderboard({ board = "solo", limit = MAX_LEADERBOARD_ENTRIES } = {}) {
    const key = board === "multiplayer" ? "multiplayer" : "solo";

    return this.data.users
      .map((user) => ({
        id: user.id,
        name: user.displayName,
        username: user.username,
        snakeColor: user.snakeColor,
        score: user.stats[key].bestScore,
        runs: user.stats[key].runs
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }
}
