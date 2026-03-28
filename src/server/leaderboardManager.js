import { MAX_LEADERBOARD_ENTRIES } from "../shared/config.js";

function normalizeBoard(mode) {
  const text = String(mode || "solo").trim().toLowerCase();

  if (text.startsWith("multiplayer")) {
    return "multiplayer";
  }

  return "solo";
}

export class LeaderboardManager {
  constructor({ userStore, limit = MAX_LEADERBOARD_ENTRIES, onChange = null } = {}) {
    this.userStore = userStore;
    this.limit = limit;
    this.onChange = onChange;
  }

  record({ userId, score, mode, won = false }) {
    const board = normalizeBoard(mode);
    if (!userId) {
      return this.getEntries({ board });
    }

    const entries = this.userStore.recordGameResult({
      userId,
      board,
      score,
      won
    });
    this.onChange?.(entries, board);
    return entries;
  }

  getEntries({ board = "solo" } = {}) {
    return this.userStore.getLeaderboard({
      board: normalizeBoard(board),
      limit: this.limit
    });
  }
}
