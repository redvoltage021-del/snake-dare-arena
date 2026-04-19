export const BOARD_SIZE = 5;
export const TOTAL_POINTS = BOARD_SIZE * BOARD_SIZE;
export const TOTAL_GOATS = 20;
export const TIGER_COUNT = 4;
export const TIGER_WIN_CAPTURES = 5;
export const TIGER_IDS = ["tiger-1", "tiger-2", "tiger-3", "tiger-4"];
export const CORNER_POSITIONS = [0, BOARD_SIZE - 1, TOTAL_POINTS - BOARD_SIZE, TOTAL_POINTS - 1];

const ORTHOGONAL_VECTORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

const DIAGONAL_VECTORS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
];

export const POINTS = Array.from({ length: TOTAL_POINTS }, (_, index) => {
  const x = index % BOARD_SIZE;
  const y = Math.floor(index / BOARD_SIZE);
  return {
    index,
    x,
    y,
    label: String.fromCharCode(65 + x) + String(y + 1)
  };
});

function isInBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function toIndex(x, y) {
  return y * BOARD_SIZE + x;
}

export function fromIndex(index) {
  return POINTS[index];
}

export function hasDiagonalLines(index) {
  const point = fromIndex(index);
  return (point.x + point.y) % 2 === 0;
}

export function areAdjacent(fromIndexValue, toIndexValue) {
  return ADJACENCY[fromIndexValue].includes(toIndexValue);
}

export const ADJACENCY = POINTS.map((point) => {
  const vectors = hasDiagonalLines(point.index)
    ? ORTHOGONAL_VECTORS.concat(DIAGONAL_VECTORS)
    : ORTHOGONAL_VECTORS;

  return vectors
    .map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))
    .filter(({ x, y }) => isInBounds(x, y))
    .map(({ x, y }) => toIndex(x, y));
});

export const EDGE_LIST = ADJACENCY.flatMap((neighbors, from) => neighbors
  .filter((to) => to > from)
  .map((to) => ({ from, to })));

function createPiece(id, type, position) {
  return {
    id,
    type,
    position,
    captured: false
  };
}

export function createInitialState() {
  const board = Array(TOTAL_POINTS).fill(null);
  const pieces = {};

  CORNER_POSITIONS.forEach((position, index) => {
    const id = TIGER_IDS[index];
    pieces[id] = createPiece(id, "tiger", position);
    board[position] = id;
  });

  return {
    board,
    pieces,
    turn: "goat",
    phase: "placement",
    goatsPlaced: 0,
    goatsCaptured: 0,
    winner: null,
    moveCount: 0,
    recentMove: null,
    log: [
      {
        turn: 0,
        actor: "system",
        text: "The tigers wait at the four corners. Goats place first."
      }
    ]
  };
}

export function cloneState(state) {
  return {
    ...state,
    board: state.board.slice(),
    pieces: Object.fromEntries(
      Object.entries(state.pieces).map(([id, piece]) => [id, { ...piece }])
    ),
    recentMove: state.recentMove ? { ...state.recentMove } : null,
    log: state.log.map((entry) => ({ ...entry }))
  };
}

export function getPieceAt(state, position) {
  const pieceId = state.board[position];
  return pieceId ? state.pieces[pieceId] : null;
}

export function getLivePieces(state, type = null) {
  return Object.values(state.pieces)
    .filter((piece) => !piece.captured && piece.position !== null && (!type || piece.type === type));
}

export function getGoatsRemainingToPlace(state) {
  return Math.max(0, TOTAL_GOATS - state.goatsPlaced);
}

export function getPieceMoves(state, pieceId) {
  const piece = state.pieces[pieceId];
  if (!piece || piece.captured || piece.position === null) {
    return [];
  }

  if (piece.type === "goat" && state.phase === "placement") {
    return [];
  }

  const actions = [];
  const from = piece.position;

  for (const to of ADJACENCY[from]) {
    if (!state.board[to]) {
      actions.push({
        type: "move",
        pieceId,
        pieceType: piece.type,
        from,
        to
      });
      continue;
    }

    if (piece.type !== "tiger") {
      continue;
    }

    const midpoint = fromIndex(from);
    const target = fromIndex(to);
    const dx = target.x - midpoint.x;
    const dy = target.y - midpoint.y;
    const landingX = target.x + dx;
    const landingY = target.y + dy;

    if (!isInBounds(landingX, landingY)) {
      continue;
    }

    const landing = toIndex(landingX, landingY);
    const jumpedPiece = getPieceAt(state, to);
    if (!jumpedPiece || jumpedPiece.type !== "goat" || state.board[landing]) {
      continue;
    }

    if (!areAdjacent(to, landing)) {
      continue;
    }

    actions.push({
      type: "capture",
      pieceId,
      pieceType: piece.type,
      from,
      over: to,
      to: landing
    });
  }

  return actions;
}

export function getLegalActions(state, role = state.turn) {
  if (state.winner) {
    return [];
  }

  if (role === "goat") {
    if (state.phase === "placement") {
      return state.board.flatMap((pieceId, position) => (!pieceId
        ? [{
            type: "place",
            pieceId: `goat-${state.goatsPlaced + 1}`,
            pieceType: "goat",
            from: null,
            to: position
          }]
        : []));
    }

    return getLivePieces(state, "goat").flatMap((piece) => getPieceMoves(state, piece.id));
  }

  return getLivePieces(state, "tiger").flatMap((piece) => getPieceMoves(state, piece.id));
}

export function getActionsForSelection(state, pieceId) {
  const piece = state.pieces[pieceId];
  if (!piece || piece.captured || piece.position === null || piece.type !== state.turn) {
    return [];
  }

  if (piece.type === "goat" && state.phase === "placement") {
    return [];
  }

  return getPieceMoves(state, pieceId);
}

function describeAction(state, action) {
  const destination = fromIndex(action.to).label;

  if (action.type === "place") {
    return `Goat placed at ${destination}.`;
  }

  const actor = action.pieceType === "tiger" ? "Tiger" : "Goat";
  const origin = fromIndex(action.from).label;

  if (action.type === "capture") {
    const jumped = fromIndex(action.over).label;
    return `${actor} leapt from ${origin} to ${destination} and captured a goat at ${jumped}.`;
  }

  return `${actor} moved from ${origin} to ${destination}.`;
}

export function countTigerMobility(state) {
  return getLivePieces(state, "tiger")
    .reduce((total, tiger) => total + getPieceMoves(state, tiger.id).length, 0);
}

export function countTrappedTigers(state) {
  return getLivePieces(state, "tiger")
    .filter((tiger) => getPieceMoves(state, tiger.id).length === 0)
    .length;
}

export function countTigerCapturesAvailable(state) {
  return getLivePieces(state, "tiger")
    .flatMap((tiger) => getPieceMoves(state, tiger.id))
    .filter((action) => action.type === "capture")
    .length;
}

export function countVulnerableGoats(state) {
  const threatened = new Set();

  getLivePieces(state, "tiger").forEach((tiger) => {
    getPieceMoves(state, tiger.id)
      .filter((action) => action.type === "capture")
      .forEach((action) => threatened.add(action.over));
  });

  return threatened.size;
}

export function evaluateBoardControl(state) {
  let tigerCentrality = 0;
  let goatCentrality = 0;

  getLivePieces(state).forEach((piece) => {
    const point = fromIndex(piece.position);
    const centerDistance = Math.abs(point.x - 2) + Math.abs(point.y - 2);
    const score = 4 - centerDistance;

    if (piece.type === "tiger") {
      tigerCentrality += score;
    } else {
      goatCentrality += score;
    }
  });

  return tigerCentrality - goatCentrality * 0.35;
}

export function evaluateTigerAdvantage(state) {
  if (state.winner === "tiger") {
    return 100000;
  }

  if (state.winner === "goat") {
    return -100000;
  }

  const trappedTigers = countTrappedTigers(state);
  const tigerMobility = countTigerMobility(state);
  const captureMoves = countTigerCapturesAvailable(state);
  const vulnerableGoats = countVulnerableGoats(state);
  const unplacedGoats = getGoatsRemainingToPlace(state);
  const boardControl = evaluateBoardControl(state);

  return (
    state.goatsCaptured * 185 +
    tigerMobility * 8 +
    captureMoves * 26 +
    vulnerableGoats * 16 +
    boardControl * 4 +
    unplacedGoats * 3 -
    trappedTigers * 130
  );
}

export function applyAction(state, action) {
  const next = cloneState(state);

  if (next.winner) {
    return next;
  }

  if (action.type === "place") {
    if (next.turn !== "goat" || next.phase !== "placement" || next.board[action.to]) {
      throw new Error("Invalid goat placement.");
    }

    const goatId = action.pieceId || `goat-${next.goatsPlaced + 1}`;
    next.pieces[goatId] = createPiece(goatId, "goat", action.to);
    next.board[action.to] = goatId;
    next.goatsPlaced += 1;
    if (next.goatsPlaced >= TOTAL_GOATS) {
      next.phase = "movement";
    }
  } else {
    const piece = next.pieces[action.pieceId];
    if (!piece || piece.captured || piece.position !== action.from) {
      throw new Error("Selected piece is not available.");
    }

    if (next.board[action.to]) {
      throw new Error("Destination is occupied.");
    }

    next.board[action.from] = null;
    next.board[action.to] = piece.id;
    piece.position = action.to;

    if (action.type === "capture") {
      const capturedGoatId = next.board[action.over];
      const capturedGoat = next.pieces[capturedGoatId];
      if (!capturedGoat || capturedGoat.type !== "goat") {
        throw new Error("No goat to capture.");
      }

      next.board[action.over] = null;
      capturedGoat.position = null;
      capturedGoat.captured = true;
      next.goatsCaptured += 1;
    }
  }

  next.moveCount += 1;
  next.recentMove = { ...action };
  next.log = [
    {
      turn: next.moveCount,
      actor: action.pieceType,
      text: describeAction(state, action)
    },
    ...next.log
  ].slice(0, 12);

  if (next.goatsCaptured >= TIGER_WIN_CAPTURES) {
    next.winner = "tiger";
    next.log.unshift({
      turn: next.moveCount,
      actor: "system",
      text: "Five goats have fallen. Tigers win."
    });
    return next;
  }

  const nextTurn = next.turn === "goat" ? "tiger" : "goat";
  next.turn = nextTurn;

  if (countTrappedTigers(next) === TIGER_COUNT) {
    next.winner = "goat";
    next.log.unshift({
      turn: next.moveCount,
      actor: "system",
      text: "Every tiger is trapped. Goats win."
    });
  }

  return next;
}
