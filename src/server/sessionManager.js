import crypto from "crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(userId) {
    const token = crypto.randomBytes(24).toString("hex");
    this.sessions.set(token, {
      userId,
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    return token;
  }

  get(token) {
    if (!token) {
      return null;
    }

    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  destroy(token) {
    if (!token) {
      return;
    }

    this.sessions.delete(token);
  }
}
