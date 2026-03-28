export const GRID_WIDTH = 28;
export const GRID_HEIGHT = 28;
export const CELL_SIZE = 22;
export const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
export const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;

export const ROOM_TICK_MS = 80;
export const BASE_MOVE_INTERVAL = 160;
export const SPEED_MOVE_INTERVAL = 95;

export const FOOD_SCORE = 1;
export const POWER_UP_SPAWN_INTERVAL_MS = 9000;
export const POWER_UP_DESPAWN_MS = 12000;
export const SPEED_DURATION_MS = 7000;
export const DOUBLE_SCORE_DURATION_MS = 8000;
export const DARE_COOLDOWN_MS = 2400;
export const MAX_LEADERBOARD_ENTRIES = 10;
export const ROOM_CODE_LENGTH = 5;

export const SNAKE_COLOR_OPTIONS = [
  "#27e1ff",
  "#ff7a18",
  "#78ff7a",
  "#ff3d6e",
  "#9a7bff",
  "#ffe35a",
  "#19e2c0",
  "#ff8f3a"
];

export const PLAYER_COLORS = SNAKE_COLOR_OPTIONS;

export const DIRECTIONS = {
  up: {
    name: "up",
    label: "Up",
    vector: { x: 0, y: -1 },
    opposite: "down"
  },
  down: {
    name: "down",
    label: "Down",
    vector: { x: 0, y: 1 },
    opposite: "up"
  },
  left: {
    name: "left",
    label: "Left",
    vector: { x: -1, y: 0 },
    opposite: "right"
  },
  right: {
    name: "right",
    label: "Right",
    vector: { x: 1, y: 0 },
    opposite: "left"
  }
};

export const KEY_TO_DIRECTION = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  a: "left",
  A: "left",
  s: "down",
  S: "down",
  d: "right",
  D: "right"
};

export const POWER_UP_TYPES = {
  speed: {
    id: "speed",
    name: "Speed Boost",
    color: "#ff7a18",
    durationMs: SPEED_DURATION_MS
  },
  shield: {
    id: "shield",
    name: "Shield",
    color: "#78ff7a",
    durationMs: 0
  },
  double: {
    id: "double",
    name: "Double Score",
    color: "#27e1ff",
    durationMs: DOUBLE_SCORE_DURATION_MS
  }
};
