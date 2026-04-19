import {
  applyAction,
  countTigerCapturesAvailable,
  countTrappedTigers,
  evaluateTigerAdvantage,
  getLegalActions
} from "./baghChalEngine.js";

function pickRandom(array) {
  if (!array.length) {
    return null;
  }

  return array[Math.floor(Math.random() * array.length)];
}

function scoreActionForRole(state, action, role) {
  const next = applyAction(state, action);
  const tigerScore = evaluateTigerAdvantage(next);
  let roleScore = role === "tiger" ? tigerScore : -tigerScore;

  if (action.type === "capture") {
    roleScore += role === "tiger" ? 80 : -12;
  }

  if (role === "goat") {
    roleScore += countTrappedTigers(next) * 42;
    roleScore -= countTigerCapturesAvailable(next) * 18;
  } else {
    roleScore += countTigerCapturesAvailable(next) * 12;
  }

  return roleScore;
}

function getOrderedCandidates(state, role, actions) {
  return actions
    .map((action) => ({
      action,
      score: scoreActionForRole(state, action, role)
    }))
    .sort((left, right) => right.score - left.score);
}

export function getEasyAiMove(state) {
  return pickRandom(getLegalActions(state));
}

export function getMediumAiMove(state) {
  const actions = getLegalActions(state);
  if (!actions.length) {
    return null;
  }

  const role = state.turn;

  if (role === "tiger") {
    const captures = actions.filter((action) => action.type === "capture");
    if (captures.length) {
      return getOrderedCandidates(state, role, captures)[0].action;
    }
  }

  const ordered = getOrderedCandidates(state, role, actions);
  const shortlist = ordered.slice(0, Math.min(3, ordered.length));
  return pickRandom(shortlist).action;
}

function getSearchDepth(state) {
  if (state.phase === "placement") {
    return 3;
  }

  if (state.goatsCaptured >= 3 || countTrappedTigers(state) >= 2) {
    return 5;
  }

  return 4;
}

function getActionLimit(state, depth) {
  if (state.phase === "placement") {
    return depth >= 3 ? 7 : 10;
  }

  return depth >= 4 ? 10 : 14;
}

function minimax(state, depth, alpha, beta) {
  if (depth === 0 || state.winner) {
    return {
      score: evaluateTigerAdvantage(state),
      action: null
    };
  }

  const actions = getLegalActions(state);
  if (!actions.length) {
    return {
      score: evaluateTigerAdvantage(state),
      action: null
    };
  }

  const ordered = getOrderedCandidates(state, state.turn, actions)
    .slice(0, getActionLimit(state, depth));

  if (state.turn === "tiger") {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestAction = ordered[0].action;

    for (const candidate of ordered) {
      const result = minimax(applyAction(state, candidate.action), depth - 1, alpha, beta);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestAction = candidate.action;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) {
        break;
      }
    }

    return { score: bestScore, action: bestAction };
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestAction = ordered[0].action;

  for (const candidate of ordered) {
    const result = minimax(applyAction(state, candidate.action), depth - 1, alpha, beta);
    if (result.score < bestScore) {
      bestScore = result.score;
      bestAction = candidate.action;
    }
    beta = Math.min(beta, bestScore);
    if (beta <= alpha) {
      break;
    }
  }

  return { score: bestScore, action: bestAction };
}

export function getHardAiMove(state) {
  const actions = getLegalActions(state);
  if (!actions.length) {
    return null;
  }

  const depth = getSearchDepth(state);
  const result = minimax(state, depth, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
  return result.action || actions[0];
}

export function getAiMove(state, difficulty = "medium") {
  if (difficulty === "easy") {
    return getEasyAiMove(state);
  }

  if (difficulty === "hard") {
    return getHardAiMove(state);
  }

  return getMediumAiMove(state);
}
