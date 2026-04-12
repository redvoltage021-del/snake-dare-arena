import { MAX_LEADERBOARD_ENTRIES, SNAKE_COLOR_OPTIONS } from "/shared/config.js";
import { sanitizeName } from "/shared/utils.js";

const STORAGE_KEY = "snake-dare-arena-device-store";
const STORAGE_VERSION = 1;

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

function createDefaultState() {
  return {
    version: STORAGE_VERSION,
    currentUserId: null,
    users: []
  };
}

function sanitizeUsername(username) {
  return String(username ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18);
}

function sanitizeDisplayLookup(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function normalizeColor(color) {
  return SNAKE_COLOR_OPTIONS.includes(color) ? color : SNAKE_COLOR_OPTIONS[0];
}

function createUserId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `pilot-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function hashPassword(usernameKey, password) {
  const normalizedPassword = String(password ?? "");
  const payload = new TextEncoder().encode(`${usernameKey}:${normalizedPassword}`);

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return Array.from(payload, (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeStats(rawStats = {}) {
  const base = createDefaultStats();

  return {
    ...base,
    totalRuns: Number(rawStats.totalRuns) || 0,
    totalScore: Number(rawStats.totalScore) || 0,
    solo: {
      ...base.solo,
      bestScore: Number(rawStats.solo?.bestScore) || 0,
      lastScore: Number(rawStats.solo?.lastScore) || 0,
      runs: Number(rawStats.solo?.runs) || 0,
      lastPlayedAt: rawStats.solo?.lastPlayedAt ?? null
    },
    multiplayer: {
      ...base.multiplayer,
      bestScore: Number(rawStats.multiplayer?.bestScore) || 0,
      lastScore: Number(rawStats.multiplayer?.lastScore) || 0,
      runs: Number(rawStats.multiplayer?.runs) || 0,
      wins: Number(rawStats.multiplayer?.wins) || 0,
      lastPlayedAt: rawStats.multiplayer?.lastPlayedAt ?? null
    }
  };
}

function normalizeUser(user = {}) {
  const username = sanitizeUsername(user.username || user.usernameKey || "");

  return {
    id: String(user.id || createUserId()),
    username,
    usernameKey: username,
    displayName: sanitizeName(user.displayName || username || "Arena Pilot", "Arena Pilot"),
    snakeColor: normalizeColor(user.snakeColor),
    passwordHash: String(user.passwordHash || ""),
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString(),
    stats: normalizeStats(user.stats)
  };
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return createDefaultState();
  }

  const users = Array.isArray(rawState.users) ? rawState.users.map((user) => normalizeUser(user)) : [];
  const currentUserId = users.some((user) => user.id === rawState.currentUserId) ? rawState.currentUserId : null;

  return {
    version: STORAGE_VERSION,
    currentUserId,
    users
  };
}

function toPublicUser(user) {
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

function toNestedStats(stats = {}) {
  if (stats.solo && stats.multiplayer) {
    return normalizeStats(stats);
  }

  return normalizeStats({
    totalRuns: stats.totalRuns,
    totalScore: stats.totalScore,
    solo: {
      bestScore: stats.soloBest,
      lastScore: stats.soloLastScore,
      runs: stats.soloRuns,
      lastPlayedAt: stats.soloLastPlayedAt ?? null
    },
    multiplayer: {
      bestScore: stats.multiplayerBest,
      lastScore: stats.multiplayerLastScore,
      runs: stats.multiplayerRuns,
      wins: stats.multiplayerWins,
      lastPlayedAt: stats.multiplayerLastPlayedAt ?? null
    }
  });
}

function getBoardKey(board) {
  return String(board || "solo").toLowerCase().startsWith("multi") ? "multiplayer" : "solo";
}

export class DeviceStorage {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  readState() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) {
        return createDefaultState();
      }

      return normalizeState(JSON.parse(raw));
    } catch {
      return createDefaultState();
    }
  }

  writeState(state) {
    try {
      if (!this.storage) {
        throw new Error("Local storage unavailable.");
      }
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    } catch {
      throw new Error("This browser blocked local storage.");
    }
  }

  getSessionUser() {
    const state = this.readState();
    return toPublicUser(state.users.find((user) => user.id === state.currentUserId));
  }

  getSavedProfiles() {
    const state = this.readState();

    return state.users
      .map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        snakeColor: user.snakeColor,
        updatedAt: user.updatedAt,
        soloBest: user.stats.solo.bestScore
      }))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  getLeaderboard({ board = "solo" } = {}) {
    const state = this.readState();
    const key = getBoardKey(board);

    return state.users
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
      .slice(0, MAX_LEADERBOARD_ENTRIES)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }

  async registerUser({ username, password, displayName, snakeColor }) {
    const state = this.readState();
    const usernameKey = sanitizeUsername(username);

    if (usernameKey.length < 3) {
      throw new Error("Username must be at least 3 letters or numbers.");
    }

    if (String(password ?? "").length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }

    if (state.users.some((user) => user.usernameKey === usernameKey)) {
      throw new Error("That username already exists on this device.");
    }

    const now = new Date().toISOString();
    const user = normalizeUser({
      id: createUserId(),
      username: usernameKey,
      usernameKey,
      displayName: displayName || usernameKey,
      snakeColor,
      passwordHash: await hashPassword(usernameKey, password),
      createdAt: now,
      updatedAt: now,
      stats: createDefaultStats()
    });

    state.users.push(user);
    state.currentUserId = user.id;
    this.writeState(state);

    return {
      user: toPublicUser(user),
      entries: this.getLeaderboard({ board: "solo" })
    };
  }

  async loginUser({ username, password }) {
    const state = this.readState();
    const usernameKey = sanitizeUsername(username);
    const displayKey = sanitizeDisplayLookup(username);
    const user = state.users.find((entry) => {
      if (entry.usernameKey === usernameKey) {
        return true;
      }

      return sanitizeDisplayLookup(entry.displayName) === displayKey;
    });

    if (!user) {
      throw new Error("No saved profile with that username exists on this device.");
    }

    const candidateHash = await hashPassword(usernameKey, password);
    if (candidateHash !== user.passwordHash) {
      throw new Error("Incorrect password.");
    }

    state.currentUserId = user.id;
    this.writeState(state);
    return {
      user: toPublicUser(user),
      entries: this.getLeaderboard({ board: "solo" })
    };
  }

  async importLegacyUser({ user, username, password }) {
    const state = this.readState();
    const usernameKey = sanitizeUsername(user?.username || username);

    if (usernameKey.length < 3) {
      throw new Error("Legacy profile username is not valid.");
    }

    const existing = state.users.find((entry) => entry.usernameKey === usernameKey);
    const now = new Date().toISOString();
    const importedUser = normalizeUser({
      id: existing?.id || user?.id || createUserId(),
      username: usernameKey,
      usernameKey,
      displayName: user?.displayName || usernameKey,
      snakeColor: user?.snakeColor,
      passwordHash: await hashPassword(usernameKey, password),
      createdAt: existing?.createdAt || user?.createdAt || now,
      updatedAt: now,
      stats: toNestedStats(user?.stats || existing?.stats || createDefaultStats())
    });

    if (existing) {
      const index = state.users.findIndex((entry) => entry.id === existing.id);
      state.users[index] = importedUser;
    } else {
      state.users.push(importedUser);
    }

    state.currentUserId = importedUser.id;
    this.writeState(state);

    return {
      user: toPublicUser(importedUser),
      entries: this.getLeaderboard({ board: "solo" })
    };
  }

  logout() {
    const state = this.readState();
    state.currentUserId = null;
    this.writeState(state);
  }

  updateProfile(userId, { displayName, snakeColor }) {
    const state = this.readState();
    const user = state.users.find((entry) => entry.id === userId);

    if (!user) {
      throw new Error("Saved profile not found on this device.");
    }

    user.displayName = sanitizeName(displayName || user.displayName, user.displayName);
    user.snakeColor = normalizeColor(snakeColor || user.snakeColor);
    user.updatedAt = new Date().toISOString();
    this.writeState(state);

    return {
      user: toPublicUser(user),
      leaderboard: this.getLeaderboard({ board: "solo" })
    };
  }

  recordGameResult({ userId, board = "solo", score, won = false }) {
    const state = this.readState();
    const user = state.users.find((entry) => entry.id === userId);
    const numericScore = Math.max(0, Math.floor(Number(score) || 0));

    if (!user) {
      throw new Error("Saved profile not found on this device.");
    }

    const now = new Date().toISOString();
    const key = getBoardKey(board);
    const bucket = user.stats[key];

    user.stats.totalRuns += 1;
    user.stats.totalScore += numericScore;
    bucket.runs += 1;
    bucket.lastScore = numericScore;
    bucket.bestScore = Math.max(bucket.bestScore, numericScore);
    bucket.lastPlayedAt = now;
    if (key === "multiplayer" && won) {
      bucket.wins += 1;
    }
    user.updatedAt = now;

    this.writeState(state);

    return {
      user: toPublicUser(user),
      entries: this.getLeaderboard({ board: key })
    };
  }
}
