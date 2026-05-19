import {
  DIRECTIONS,
  GRID_HEIGHT,
  GRID_WIDTH,
  ROOM_CODE_LENGTH
} from "./config.js";

export function randomInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pickOne(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

export function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

export function coordsEqual(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

export function isInsideGrid(cell) {
  return cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT;
}

export function sanitizeName(name, fallback = "Arena Snake") {
  const clean = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);

  return clean || fallback;
}

export function getRandomFreeCell({
  occupied = new Set(),
  width = GRID_WIDTH,
  height = GRID_HEIGHT,
  padding = 0,
  rng = Math.random
} = {}) {
  const choices = [];

  for (let y = padding; y < height - padding; y += 1) {
    for (let x = padding; x < width - padding; x += 1) {
      const candidate = { x, y };
      if (!occupied.has(cellKey(candidate))) {
        choices.push(candidate);
      }
    }
  }

  if (!choices.length) {
    return { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  }

  return pickOne(choices, rng);
}

export function buildOccupiedSet(snakes = []) {
  const occupied = new Set();

  snakes.forEach((segments) => {
    segments.forEach((segment) => occupied.add(cellKey(segment)));
  });

  return occupied;
}

export function createStartingSnake(index = 0) {
  const presets = [
    { head: { x: 6, y: 6 }, direction: "right" },
    { head: { x: GRID_WIDTH - 7, y: GRID_HEIGHT - 7 }, direction: "left" },
    { head: { x: GRID_WIDTH - 7, y: 6 }, direction: "down" },
    { head: { x: 6, y: GRID_HEIGHT - 7 }, direction: "up" }
  ];

  const preset = presets[index % presets.length];
  const vector = DIRECTIONS[preset.direction].vector;
  const segments = Array.from({ length: 3 }, (_, offset) => ({
    x: preset.head.x - vector.x * offset,
    y: preset.head.y - vector.y * offset
  }));

  return {
    direction: preset.direction,
    segments
  };
}

export function createRoomCode(existingCodes = new Set(), rng = Math.random) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 500; attempt += 1) {
    let code = "";
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += alphabet[Math.floor(rng() * alphabet.length)];
    }
    if (!existingCodes.has(code)) {
      return code;
    }
  }

  throw new Error("Unable to generate a free room code.");
}

export function formatTimeLeft(milliseconds) {
  return `${Math.max(0, Math.ceil(milliseconds / 1000))}s`;
}

export function describeDirection(directionName) {
  return DIRECTIONS[directionName]?.label ?? directionName;
}
