import {
  BASE_MOVE_INTERVAL,
  DARE_COOLDOWN_MS,
  FOOD_SCORE,
  POWER_UP_DESPAWN_MS,
  POWER_UP_SPAWN_INTERVAL_MS,
  POWER_UP_TYPES,
  SPEED_MOVE_INTERVAL
} from "/shared/config.js";
import { claimDareReward, createDare, getDareHud, recordDareTurn, updateDare } from "/shared/dareSystem.js";
import {
  buildOccupiedSet,
  cellKey,
  coordsEqual,
  createStartingSnake,
  formatTimeLeft,
  getRandomFreeCell,
  isInsideGrid,
  pickOne,
  sanitizeName
} from "/shared/utils.js";

function oppositeDirection(direction) {
  if (direction === "up") {
    return "down";
  }
  if (direction === "down") {
    return "up";
  }
  if (direction === "left") {
    return "right";
  }
  return "left";
}

export class SoloGame extends EventTarget {
  constructor({ playerName = "You", rng = Math.random } = {}) {
    super();
    this.playerName = sanitizeName(playerName, "You");
    this.rng = rng;
    this.reset();
  }

  on(eventName, handler) {
    const listener = (event) => handler(event.detail);
    this.addEventListener(eventName, listener);
    return () => this.removeEventListener(eventName, listener);
  }

  emitEvent(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  reset() {
    const spawn = createStartingSnake(0);
    const now = Date.now();

    this.snake = spawn.segments;
    this.direction = spawn.direction;
    this.nextDirection = spawn.direction;
    this.directionOpposite = oppositeDirection(spawn.direction);
    this.score = 0;
    this.alive = true;
    this.accumulator = 0;
    this.speedUntil = 0;
    this.doubleUntil = 0;
    this.shieldCharges = 0;
    this.notifications = ["New run started."];
    this.gameOverReason = "";
    this.powerUp = null;
    this.food = this.spawnFood();
    this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
    this.dare = createDare({ score: 0, now, rng: this.rng });
    this.nextDareAt = now + POWER_UP_SPAWN_INTERVAL_MS;
  }

  queueDirection(directionName) {
    if (!this.alive) {
      return;
    }

    if (!["up", "down", "left", "right"].includes(directionName)) {
      return;
    }

    if (directionName === this.direction || directionName === this.directionOpposite) {
      return;
    }

    this.nextDirection = directionName;
    recordDareTurn(this.dare, directionName, Date.now());
    this.resolveDare(Date.now());
  }

  update(deltaMs) {
    const now = Date.now();
    const cappedDelta = Math.min(200, deltaMs);

    if (this.powerUp && now >= this.powerUp.expiresAt) {
      this.powerUp = null;
      this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
    }

    if (!this.powerUp && this.alive && now >= this.nextPowerUpAt) {
      this.spawnPowerUp(now);
    }

    if (this.alive) {
      this.accumulator += cappedDelta;
      while (this.accumulator >= this.getMoveInterval(now) && this.alive) {
        this.accumulator -= this.getMoveInterval(now);
        this.step(now);
      }
    }

    this.resolveDare(now);
  }

  step(now) {
    if (this.nextDirection && this.nextDirection !== this.directionOpposite) {
      this.direction = this.nextDirection;
    }
    this.directionOpposite = oppositeDirection(this.direction);

    const vector = this.direction === "up"
      ? { x: 0, y: -1 }
      : this.direction === "down"
        ? { x: 0, y: 1 }
        : this.direction === "left"
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };

    const nextHead = {
      x: this.snake[0].x + vector.x,
      y: this.snake[0].y + vector.y
    };

    const eatsFood = coordsEqual(nextHead, this.food);
    const ownBody = eatsFood ? this.snake : this.snake.slice(0, -1);

    if (!isInsideGrid(nextHead) || ownBody.some((segment) => coordsEqual(segment, nextHead))) {
      if (this.shieldCharges > 0) {
        this.shieldCharges -= 1;
        this.addNotification("Shield absorbed the crash.");
        return;
      }

      this.finish("Collision detected. Run over.");
      return;
    }

    const picksPowerUp = this.powerUp && coordsEqual(nextHead, this.powerUp);
    this.snake.unshift(nextHead);

    if (!eatsFood) {
      this.snake.pop();
    } else {
      const gain = this.getFoodScore(now);
      this.score += gain;
      this.food = this.spawnFood();
      this.addNotification(`Food collected for +${gain}.`);
      this.emitEvent("burst", { cell: nextHead, color: "#fde047" });

      if (!this.powerUp && this.rng() < 0.42) {
        this.spawnPowerUp(now);
      }
    }

    if (picksPowerUp) {
      const type = this.powerUp.type;
      this.activatePowerUp(type, now, false);
      this.emitEvent("burst", {
        cell: nextHead,
        color: POWER_UP_TYPES[type].color,
        label: POWER_UP_TYPES[type].name
      });
      this.powerUp = null;
      this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
    }
  }

  resolveDare(now) {
    if (this.dare) {
      updateDare(this.dare, { now, score: this.score, alive: this.alive });

      if (this.dare.status === "completed") {
        const reward = claimDareReward(this.dare);
        if (reward) {
          this.score += reward.points;
          if (reward.powerUp) {
            this.activatePowerUp(reward.powerUp, now, true);
          }
          this.addNotification(`Dare complete for +${reward.points}.`);
          this.emitEvent("burst", {
            cell: this.snake[0],
            color: reward.powerUp ? POWER_UP_TYPES[reward.powerUp].color : "#c084fc",
            label: `+${reward.points}`
          });
        }
        this.dare = null;
        this.nextDareAt = now + DARE_COOLDOWN_MS;
      } else if (this.dare.status === "failed") {
        this.addNotification(`Dare failed: ${this.dare.failureReason}`);
        this.dare = null;
        this.nextDareAt = now + DARE_COOLDOWN_MS;
      }
    }

    if (!this.dare && this.alive && now >= this.nextDareAt) {
      this.dare = createDare({ score: this.score, now, rng: this.rng });
    }
  }

  activatePowerUp(type, now, fromDare) {
    const prefix = fromDare ? "Dare reward" : "Power-up";

    if (type === "speed") {
      this.speedUntil = Math.max(this.speedUntil, now + POWER_UP_TYPES.speed.durationMs);
      this.addNotification(`${prefix}: speed boost active.`);
      return;
    }

    if (type === "double") {
      this.doubleUntil = Math.max(this.doubleUntil, now + POWER_UP_TYPES.double.durationMs);
      this.addNotification(`${prefix}: double score online.`);
      return;
    }

    this.shieldCharges += 1;
    this.addNotification(`${prefix}: shield ready.`);
  }

  finish(reason) {
    if (!this.alive) {
      return;
    }

    this.alive = false;
    this.gameOverReason = reason;
    updateDare(this.dare, { now: Date.now(), score: this.score, alive: false });
    this.addNotification(reason);
    this.emitEvent("gameOver", { score: this.score, reason });
  }

  addNotification(message) {
    this.notifications.unshift(message);
    this.notifications = this.notifications.slice(0, 4);
  }

  getMoveInterval(now) {
    return this.speedUntil > now ? SPEED_MOVE_INTERVAL : BASE_MOVE_INTERVAL;
  }

  getFoodScore(now) {
    return FOOD_SCORE * (this.doubleUntil > now ? 2 : 1);
  }

  spawnFood() {
    const occupied = buildOccupiedSet([this.snake]);
    if (this.powerUp) {
      occupied.add(cellKey(this.powerUp));
    }
    return getRandomFreeCell({ occupied, padding: 1, rng: this.rng });
  }

  spawnPowerUp(now) {
    const occupied = buildOccupiedSet([this.snake]);
    occupied.add(cellKey(this.food));

    this.powerUp = {
      ...getRandomFreeCell({ occupied, padding: 1, rng: this.rng }),
      type: pickOne(Object.keys(POWER_UP_TYPES), this.rng),
      expiresAt: now + POWER_UP_DESPAWN_MS
    };
    this.nextPowerUpAt = now + POWER_UP_SPAWN_INTERVAL_MS;
  }

  getLocalDare(now) {
    if (this.dare) {
      return getDareHud(this.dare, now);
    }

    return {
      description: "Fresh dare loading.",
      target: `Next dare in ${formatTimeLeft(Math.max(0, this.nextDareAt - now))}`,
      progress: this.alive ? "Stay alive and hold the line." : "Run completed.",
      reward: "",
      status: "cooldown"
    };
  }

  getActiveEffects(now) {
    const effects = [];

    if (this.speedUntil > now) {
      effects.push({
        id: "speed",
        label: "Speed Boost",
        timeLeft: this.speedUntil - now
      });
    }

    if (this.doubleUntil > now) {
      effects.push({
        id: "double",
        label: "Double Score",
        timeLeft: this.doubleUntil - now
      });
    }

    if (this.shieldCharges > 0) {
      effects.push({
        id: "shield",
        label: `Shield x${this.shieldCharges}`,
        timeLeft: 0
      });
    }

    return effects;
  }

  getSnapshot(now = Date.now()) {
    return {
      mode: "solo",
      food: this.food,
      powerUp: this.powerUp,
      localPlayerId: "solo",
      players: [
        {
          id: "solo",
          name: this.playerName,
          color: "#22d3ee",
          direction: this.direction,
          score: this.score,
          alive: this.alive,
          segments: this.snake
        }
      ],
      local: {
        score: this.score,
        alive: this.alive,
        dare: this.getLocalDare(now),
        activeEffects: this.getActiveEffects(now),
        notifications: this.notifications,
        statusText: this.alive ? "Solo run live. Chain food and clear dares." : this.gameOverReason,
        shieldCharges: this.shieldCharges
      }
    };
  }
}
