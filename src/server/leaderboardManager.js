import { MAX_LEADERBOARD_ENTRIES } from "../shared/config.js";
import { sanitizeName } from "../shared/utils.js";

function normalizeBoard(mode) {
  const text = String(mode || "Solo").trim().toLowerCase();

  if (text.startsWith("multiplayer")) {
    return "multiplayer";
  }

  if (text.startsWith("solo")) {
    return "solo";
  }

  return "general";
}

export class LeaderboardManager {
  constructor({ limit = MAX_LEADERBOARD_ENTRIES, onChange = null } = {}) {
    this.limit = limit;
    this.onChange = onChange;
    this.entries = [];
  }

  record({ name, score, mode }) {
    const safeScore = Number(score);
    if (!Number.isFinite(safeScore) || safeScore <= 0) {
      return this.getEntries();
    }

    const safeName = sanitizeName(name);
    const safeMode = String(mode || "Solo");
    const board = normalizeBoard(safeMode);
    const now = new Date().toISOString();
    const existingEntry = this.entries.find((entry) => entry.board === board && entry.nameKey === safeName.toLowerCase());

    if (existingEntry) {
      existingEntry.runs += 1;
      existingEntry.lastPlayedAt = now;

      if (safeScore > existingEntry.score) {
        existingEntry.score = safeScore;
        existingEntry.mode = safeMode;
        existingEntry.bestAt = now;
      }
    } else {
      this.entries.push({
        name: safeName,
        nameKey: safeName.toLowerCase(),
        score: safeScore,
        mode: safeMode,
        board,
        runs: 1,
        bestAt: now,
        lastPlayedAt: now
      });
    }

    const current = this.getEntries({ board });
    this.onChange?.(current);
    return current;
  }

  getEntries({ board = null } = {}) {
    return this.entries
      .filter((entry) => !board || entry.board === board)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.bestAt.localeCompare(right.bestAt);
      })
      .slice(0, this.limit)
      .map((entry, index) => ({
      ...entry,
      rank: index + 1
      }));
  }
}
