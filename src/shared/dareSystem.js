import { DARE_COOLDOWN_MS, DIRECTIONS, POWER_UP_TYPES } from "./config.js";
import { describeDirection, formatTimeLeft, pickOne, randomInt } from "./utils.js";

const DARE_TYPES = ["reach_score", "avoid_direction", "survive"];
const REWARD_POWER_UPS = Object.keys(POWER_UP_TYPES);

function createReward(rng = Math.random) {
  return {
    points: randomInt(3, 6, rng),
    powerUp: rng() < 0.65 ? pickOne(REWARD_POWER_UPS, rng) : null
  };
}

function markResolved(dare, status, now, reason = "") {
  dare.status = status;
  dare.resolvedAt = now;
  dare.failureReason = reason;
  return dare;
}

export function createDare({ score = 0, now = Date.now(), rng = Math.random } = {}) {
  const type = pickOne(DARE_TYPES, rng);
  const reward = createReward(rng);
  const scoreTier = Math.max(1, Math.floor(score / 4) + 1);

  if (type === "reach_score") {
    const targetDelta = randomInt(3, 5 + scoreTier, rng);
    const durationMs = randomInt(18000, 30000, rng);

    return {
      id: `${type}-${now}-${randomInt(1000, 9999, rng)}`,
      type,
      createdAt: now,
      startedAt: now,
      deadlineAt: now + durationMs,
      durationMs,
      targetScore: score + targetDelta,
      description: `Hit ${score + targetDelta} points before time expires.`,
      targetText: `${score + targetDelta} points in ${formatTimeLeft(durationMs)}`,
      progressText: `Score ${score}/${score + targetDelta}`,
      reward,
      rewardClaimed: false,
      status: "active",
      failureReason: ""
    };
  }

  if (type === "avoid_direction") {
    const bannedDirection = pickOne(Object.keys(DIRECTIONS), rng);
    const durationMs = randomInt(12000, 20000, rng);

    return {
      id: `${type}-${now}-${randomInt(1000, 9999, rng)}`,
      type,
      createdAt: now,
      startedAt: now,
      deadlineAt: now + durationMs,
      durationMs,
      bannedDirection,
      description: `Do not turn ${describeDirection(bannedDirection)}.`,
      targetText: `Avoid ${describeDirection(bannedDirection)} for ${formatTimeLeft(durationMs)}`,
      progressText: `${formatTimeLeft(durationMs)} left`,
      reward,
      rewardClaimed: false,
      status: "active",
      failureReason: ""
    };
  }

  const durationMs = randomInt(15000, 26000, rng);
  return {
    id: `${type}-${now}-${randomInt(1000, 9999, rng)}`,
    type,
    createdAt: now,
    startedAt: now,
    deadlineAt: now + durationMs,
    durationMs,
    description: "Stay alive and keep your nerve.",
    targetText: `Survive for ${formatTimeLeft(durationMs)}`,
    progressText: `${formatTimeLeft(durationMs)} left`,
    reward,
    rewardClaimed: false,
    status: "active",
    failureReason: ""
  };
}

export function recordDareTurn(dare, directionName, now = Date.now()) {
  if (!dare || dare.status !== "active") {
    return dare;
  }

  if (dare.type === "avoid_direction" && dare.bannedDirection === directionName) {
    markResolved(dare, "failed", now, `Turned ${describeDirection(directionName)}.`);
  }

  return dare;
}

export function updateDare(dare, { score = 0, now = Date.now(), alive = true } = {}) {
  if (!dare || dare.status !== "active") {
    return dare;
  }

  if (!alive) {
    markResolved(dare, "failed", now, "Snake down.");
    return dare;
  }

  if (dare.type === "reach_score") {
    dare.progressText = `Score ${score}/${dare.targetScore}`;
    if (score >= dare.targetScore) {
      markResolved(dare, "completed", now);
    } else if (now >= dare.deadlineAt) {
      markResolved(dare, "failed", now, "Time expired.");
    }
    return dare;
  }

  const remaining = Math.max(0, dare.deadlineAt - now);
  dare.progressText = `${formatTimeLeft(remaining)} left`;

  if (now >= dare.deadlineAt) {
    markResolved(dare, "completed", now);
  }

  return dare;
}

export function claimDareReward(dare) {
  if (!dare || dare.rewardClaimed || dare.status !== "completed") {
    return null;
  }

  dare.rewardClaimed = true;
  return dare.reward;
}

export function getDareHud(dare, now = Date.now()) {
  if (!dare) {
    return {
      description: "Fresh dare loading.",
      target: `Next dare in ${formatTimeLeft(DARE_COOLDOWN_MS)}`,
      progress: "Catch your breath.",
      reward: "",
      status: "cooldown"
    };
  }

  const rewardBits = [`+${dare.reward.points} bonus`];
  if (dare.reward.powerUp) {
    rewardBits.push(POWER_UP_TYPES[dare.reward.powerUp].name);
  }

  const remaining = dare.status === "active" ? Math.max(0, dare.deadlineAt - now) : 0;
  const progress = dare.status === "active" ? dare.progressText : dare.failureReason || dare.progressText;

  return {
    description: dare.description,
    target: dare.status === "active" ? dare.targetText : dare.targetText,
    progress: dare.status === "active" ? `${progress} | ${formatTimeLeft(remaining)}` : progress,
    reward: rewardBits.join(" + "),
    status: dare.status
  };
}
