import {
  BASE_MOVE_INTERVAL,
  DARE_COOLDOWN_MS,
  FOOD_SCORE,
  GRID_HEIGHT,
  GRID_WIDTH,
  PLAYER_COLORS,
  POWER_UP_DESPAWN_MS,
  POWER_UP_SPAWN_INTERVAL_MS,
  POWER_UP_TYPES,
  ROOM_TICK_MS,
  SPEED_MOVE_INTERVAL
} from "../shared/config.js";
import { claimDareReward, createDare, getDareHud, recordDareTurn, updateDare } from "../shared/dareSystem.js";
import {
  buildOccupiedSet,
  cellKey,
  coordsEqual,
  createStartingSnake,
  formatTimeLeft,
  getRandomFreeCell,
  isInsideGrid,
  pickOne,
  randomInt,
  sanitizeName
} from "../shared/utils.js";

function cloneSegments(segments) {
  return segments.map((segment) => ({ ...segment }));
}

export class MultiplayerRoom {
  constructor({ code, io, leaderboardManager, onEmpty }) {
    this.code = code;
    this.io = io;
    this.leaderboardManager = leaderboardManager;
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.food = null;
    this.powerUp = null;
    this.nextPowerUpAt = Date.now() + POWER_UP_SPAWN_INTERVAL_MS;
    this.interval = null;
    this.lastTickAt = Date.now();
  }

  addPlayer(socket, playerProfile) {
    const player = this.createPlayer(socket.id, playerProfile);
    this.players.set(socket.id, player);

    if (!this.food) {
      this.food = this.spawnFood();
    }

    this.ensureLoop();
    this.pushMessage(player, `Entered room ${this.code}.`);
    this.broadcastState();
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) {
      return;
    }

    this.submitScore(player, "Room Exit");
    this.players.delete(socketId);

    if (!this.players.size) {
      this.stop();
      this.onEmpty?.();
      return;
    }

    this.broadcastState();
  }

  isEmpty() {
    return this.players.size === 0;
  }

  setDirection(socketId, directionName) {
    const player = this.players.get(socketId);
    if (!player || !player.alive) {
      return;
    }

    if (!["up", "down", "left", "right"].includes(directionName)) {
      return;
    }

    const current = player.nextDirection ?? player.direction;
    if (directionName === current) {
      return;
    }

    if (directionName === player.directionOpposite) {
      return;
    }

    player.nextDirection = directionName;
    recordDareTurn(player.dare, directionName, Date.now());
    this.resolveDareState(player, Date.now());
  }

  ensureLoop() {
    if (this.interval) {
      return;
    }

    this.lastTickAt = Date.now();
    this.interval = setInterval(() => this.tick(), ROOM_TICK_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  createPlayer(socketId, playerProfile = {}) {
    const spawn = this.findSpawnSnake();
    const now = Date.now();
    return {
      id: socketId,
      userId: playerProfile.userId ?? null,
      name: sanitizeName(playerProfile.displayName, `Snake ${this.players.size + 1}`),
      color: playerProfile.snakeColor || PLAYER_COLORS[this.players.size % PLAYER_COLORS.length],
      segments: spawn.segments,
      previousSegments: cloneSegments(spawn.segments),
      direction: spawn.direction,
      nextDirection: spawn.direction,
      directionOpposite: spawn.direction === "up"
        ? "down"
        : spawn.direction === "down"
          ? "up"
          : spawn.direction === "left"
            ? "right"
            : "left",
      score: 0,
      alive: true,
      accumulator: 0,
      shieldCharges: 0,
      speedUntil: 0,
      doubleUntil: 0,
      dare: createDare({ score: 0, now }),
      nextDareAt: now + POWER_UP_SPAWN_INTERVAL_MS,
      feed: [],
      scoreSubmitted: false
    };
  }

  findSpawnSnake() {
    const occupied = buildOccupiedSet(
      [...this.players.values()].filter((player) => player.alive).map((player) => player.segments)
    );

    for (let index = 0; index < 12; index += 1) {
      const spawn = createStartingSnake(this.players.size + index);
      const blocked = spawn.segments.some((segment) => occupied.has(cellKey(segment)));
      if (!blocked) {
        return spawn;
      }
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = getRandomFreeCell({ occupied, padding: 4 });
      const direction = pickOne(["up", "down", "left", "right"]);
      const vector = direction === "up"
        ? { x: 0, y: -1 }
        : direction === "down"
          ? { x: 0, y: 1 }
          : direction === "left"
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 };
      const segments = Array.from({ length: 3 }, (_, offset) => ({
        x: candidate.x - vector.x * offset,
        y: candidate.y - vector.y * offset
      }));

      const valid = segments.every((segment) => isInsideGrid(segment) && !occupied.has(cellKey(segment)));
      if (valid) {
        return { direction, segments };
      }
    }

    return createStartingSnake(0);
  }

  tick() {
    if (!this.players.size) {
      return;
    }

    const now = Date.now();
    const delta = Math.min(200, Math.max(ROOM_TICK_MS, now - this.lastTickAt));
    this.lastTickAt = now;

    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    let maxSteps = 0;
    const stepCounts = new Map();

    alivePlayers.forEach((player) => {
      player.accumulator += delta;
      const interval = this.getMoveInterval(player, now);
      const steps = Math.floor(player.accumulator / interval);

      if (steps > 0) {
        stepCounts.set(player.id, steps);
        player.accumulator -= steps * interval;
        maxSteps = Math.max(maxSteps, steps);
      }
    });

    for (let phase = 0; phase < maxSteps; phase += 1) {
      const movers = alivePlayers.filter((player) => (stepCounts.get(player.id) ?? 0) > phase && player.alive);
      if (movers.length) {
        this.movePlayers(movers, now);
      }
    }

    this.maybeSpawnPowerUp(now);
    if (!this.food) {
      this.food = this.spawnFood();
    }

    this.players.forEach((player) => this.resolveDareState(player, now));
    const survivors = this.getAlivePlayers();
    if (survivors.length === 1 && this.players.size > 1) {
      this.submitScore(survivors[0], "Multiplayer");
    }
    this.broadcastState(now);
  }

  getMoveInterval(player, now) {
    return player.speedUntil > now ? SPEED_MOVE_INTERVAL : BASE_MOVE_INTERVAL;
  }

  movePlayers(movers, now) {
    const alivePlayers = [...this.players.values()].filter((player) => player.alive);
    const headMap = new Map();
    const plans = movers.map((player) => {
      if (player.nextDirection && player.nextDirection !== player.directionOpposite) {
        player.direction = player.nextDirection;
      }

      player.directionOpposite = player.direction === "up"
        ? "down"
        : player.direction === "down"
          ? "up"
          : player.direction === "left"
            ? "right"
            : "left";

      const vector = player.direction === "up"
        ? { x: 0, y: -1 }
        : player.direction === "down"
          ? { x: 0, y: 1 }
          : player.direction === "left"
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 };
      const nextHead = {
        x: player.segments[0].x + vector.x,
        y: player.segments[0].y + vector.y
      };
      const eatsFood = coordsEqual(nextHead, this.food);
      const picksPowerUp = this.powerUp && coordsEqual(nextHead, this.powerUp);

      const key = cellKey(nextHead);
      if (!headMap.has(key)) {
        headMap.set(key, []);
      }
      headMap.get(key).push(player.id);

      return {
        player,
        nextHead,
        eatsFood,
        picksPowerUp
      };
    });

    const blocked = new Map();

    plans.forEach((plan) => {
      if (!isInsideGrid(plan.nextHead)) {
        blocked.set(plan.player.id, "wall");
        return;
      }

      const ownBody = plan.eatsFood ? plan.player.segments : plan.player.segments.slice(0, -1);
      if (ownBody.some((segment) => coordsEqual(segment, plan.nextHead))) {
        blocked.set(plan.player.id, "self");
        return;
      }

      const hitSnake = alivePlayers.some((otherPlayer) => {
        if (otherPlayer.id === plan.player.id) {
          return false;
        }

        return otherPlayer.segments.some((segment) => coordsEqual(segment, plan.nextHead));
      });

      if (hitSnake) {
        blocked.set(plan.player.id, "snake");
      }
    });

    headMap.forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => blocked.set(id, "head_on"));
      }
    });

    plans.forEach((plan) => {
      const reason = blocked.get(plan.player.id);
      if (!reason) {
        return;
      }

      if (plan.player.shieldCharges > 0) {
        plan.player.shieldCharges -= 1;
        this.pushMessage(plan.player, "Shield burned to block a crash.");
        blocked.set(plan.player.id, "shielded");
      } else {
        this.killPlayer(plan.player, reason);
      }
    });

    let foodConsumed = false;

    plans.forEach((plan) => {
      if (!plan.player.alive || blocked.has(plan.player.id)) {
        return;
      }

      plan.player.previousSegments = cloneSegments(plan.player.segments);
      plan.player.segments.unshift(plan.nextHead);

      if (!plan.eatsFood) {
        plan.player.segments.pop();
      } else {
        const gain = this.getFoodScore(plan.player, now);
        plan.player.score += gain;
        foodConsumed = true;
        this.pushMessage(plan.player, `Food grabbed for +${gain}.`);
      }

      if (plan.picksPowerUp) {
        this.activatePowerUp(plan.player, this.powerUp.type, now, false);
        this.powerUp = null;
        this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
      }
    });

    if (foodConsumed) {
      this.food = this.spawnFood();
    }
  }

  killPlayer(player, reason) {
    player.alive = false;
    player.segments = [];
    this.pushMessage(player, reason === "head_on" ? "Head-on crash." : "Eliminated.");
    this.submitScore(player, "Multiplayer");
  }

  submitScore(player, mode) {
    if (player.scoreSubmitted) {
      return;
    }

    player.scoreSubmitted = true;

    if (player.score < 0 || !this.leaderboardManager?.record || !player.userId) {
      return;
    }

    this.leaderboardManager.record({
      userId: player.userId,
      score: player.score,
      mode: `${mode} ${this.code}`,
      won: mode === "Multiplayer" && this.getAlivePlayers().length <= 1
    });
  }

  getAlivePlayers() {
    return [...this.players.values()].filter((player) => player.alive);
  }

  getFoodScore(player, now) {
    return FOOD_SCORE * (player.doubleUntil > now ? 2 : 1);
  }

  activatePowerUp(player, type, now, fromDare) {
    const prefix = fromDare ? "Dare reward" : "Power-up";

    if (type === "speed") {
      player.speedUntil = Math.max(player.speedUntil, now + POWER_UP_TYPES.speed.durationMs);
      this.pushMessage(player, `${prefix}: speed boost engaged.`);
      return;
    }

    if (type === "double") {
      player.doubleUntil = Math.max(player.doubleUntil, now + POWER_UP_TYPES.double.durationMs);
      this.pushMessage(player, `${prefix}: double score online.`);
      return;
    }

    player.shieldCharges += 1;
    this.pushMessage(player, `${prefix}: shield ready.`);
  }

  maybeSpawnPowerUp(now) {
    if (this.powerUp && now >= this.powerUp.expiresAt) {
      this.powerUp = null;
      this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
    }

    if (this.powerUp || now < this.nextPowerUpAt) {
      return;
    }

    const occupied = this.getOccupiedCells();
    if (this.food) {
      occupied.add(cellKey(this.food));
    }

    this.powerUp = {
      ...getRandomFreeCell({ occupied, padding: 1 }),
      type: pickOne(Object.keys(POWER_UP_TYPES)),
      expiresAt: now + POWER_UP_DESPAWN_MS
    };

    this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS + randomInt(0, 3000);
  }

  spawnFood() {
    const occupied = this.getOccupiedCells();
    if (this.powerUp) {
      occupied.add(cellKey(this.powerUp));
    }
    return getRandomFreeCell({ occupied, padding: 1 });
  }

  getOccupiedCells() {
    return buildOccupiedSet(
      [...this.players.values()].filter((player) => player.alive).map((player) => player.segments)
    );
  }

  pushMessage(player, text) {
    player.feed.unshift(text);
    player.feed = player.feed.slice(0, 4);
  }

  resolveDareState(player, now) {
    if (!player.alive) {
      updateDare(player.dare, { now, score: player.score, alive: false });
    }

    if (player.dare) {
      updateDare(player.dare, { now, score: player.score, alive: player.alive });

      if (player.dare.status === "completed") {
        const reward = claimDareReward(player.dare);
        if (reward) {
          player.score += reward.points;
          if (reward.powerUp) {
            this.activatePowerUp(player, reward.powerUp, now, true);
          }
          this.pushMessage(player, `Dare cleared for +${reward.points}.`);
          player.dare = null;
          player.nextDareAt = now + DARE_COOLDOWN_MS;
        }
      } else if (player.dare.status === "failed") {
        this.pushMessage(player, `Dare failed: ${player.dare.failureReason}`);
        player.dare = null;
        player.nextDareAt = now + DARE_COOLDOWN_MS;
      }
    }

    if (!player.dare && player.alive && now >= player.nextDareAt) {
      player.dare = createDare({ score: player.score, now });
    }
  }

  buildPublicState(player, now) {
    const players = [...this.players.values()].map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      segments: entry.segments,
      previousSegments: entry.previousSegments,
      direction: entry.direction,
      score: entry.score,
      alive: entry.alive,
      moveProgress: entry.alive ? Math.min(1, entry.accumulator / this.getMoveInterval(entry, now)) : 1,
      speeding: entry.speedUntil > now
    }));

    const aliveCount = players.filter((entry) => entry.alive).length;
    const winner = aliveCount === 1 ? players.find((entry) => entry.alive) : null;
    const effects = [];

    if (player.speedUntil > now) {
      effects.push({
        id: "speed",
        label: "Speed Boost",
        timeLeft: Math.max(0, player.speedUntil - now)
      });
    }

    if (player.doubleUntil > now) {
      effects.push({
        id: "double",
        label: "Double Score",
        timeLeft: Math.max(0, player.doubleUntil - now)
      });
    }

    if (player.shieldCharges > 0) {
      effects.push({
        id: "shield",
        label: `Shield x${player.shieldCharges}`,
        timeLeft: 0
      });
    }

    const dare = player.dare
      ? getDareHud(player.dare, now)
      : {
          description: "Fresh dare loading.",
          target: `Next dare in ${formatTimeLeft(Math.max(0, player.nextDareAt - now))}`,
          progress: player.alive ? "Stay sharp and hold position." : "Spectating.",
          reward: "",
          status: "cooldown"
        };

    return {
      mode: "multiplayer",
      roomCode: this.code,
      food: this.food,
      powerUp: this.powerUp,
      players,
      localPlayerId: player.id,
      aliveCount,
      winnerId: winner?.id ?? null,
      local: {
        score: player.score,
        alive: player.alive,
        dare,
        activeEffects: effects,
        notifications: player.feed,
        statusText: !player.alive
          ? "Eliminated. Spectating the arena."
          : aliveCount <= 1 && players.length > 1
            ? "You own the arena."
            : players.length === 1
              ? "Waiting for challengers."
              : `${aliveCount} snakes still moving.`,
        shieldCharges: player.shieldCharges
      }
    };
  }

  broadcastState(now = Date.now()) {
    this.players.forEach((player) => {
      this.io.to(player.id).emit("roomState", this.buildPublicState(player, now));
    });
  }
}
