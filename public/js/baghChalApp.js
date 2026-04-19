import {
  ADJACENCY,
  EDGE_LIST,
  POINTS,
  TIGER_WIN_CAPTURES,
  TOTAL_GOATS,
  applyAction,
  countTigerMobility,
  countTrappedTigers,
  createInitialState,
  evaluateTigerAdvantage,
  fromIndex,
  getActionsForSelection,
  getGoatsRemainingToPlace,
  getLegalActions,
  getLivePieces
} from "./baghChalEngine.js";
import { getAiMove } from "./baghChalAI.js";

const elements = {
  modeSelect: document.getElementById("modeSelect"),
  difficultySelect: document.getElementById("difficultySelect"),
  humanSideSelect: document.getElementById("humanSideSelect"),
  newGameBtn: document.getElementById("newGameBtn"),
  musicToggleBtn: document.getElementById("musicToggleBtn"),
  modeNote: document.getElementById("modeNote"),
  turnBadge: document.getElementById("turnBadge"),
  phaseLabel: document.getElementById("phaseLabel"),
  aiStatus: document.getElementById("aiStatus"),
  goatsPlacedValue: document.getElementById("goatsPlacedValue"),
  goatsCapturedValue: document.getElementById("goatsCapturedValue"),
  goatsReserveValue: document.getElementById("goatsReserveValue"),
  trappedValue: document.getElementById("trappedValue"),
  goalLabel: document.getElementById("goalLabel"),
  selectionLabel: document.getElementById("selectionLabel"),
  statusLine: document.getElementById("statusLine"),
  moveLog: document.getElementById("moveLog"),
  winnerBanner: document.getElementById("winnerBanner"),
  winnerTitle: document.getElementById("winnerTitle"),
  winnerText: document.getElementById("winnerText"),
  boardLines: document.getElementById("boardLines"),
  boardPoints: document.getElementById("boardPoints"),
  moveLayer: document.getElementById("moveLayer"),
  pieceLayer: document.getElementById("pieceLayer")
};

const modeNotes = {
  local: "Local mode keeps both sides on this board. Switch to AI when you want solo practice.",
  ai: "AI mode lets you take goats or tigers. Hard uses a deeper minimax search, so it plays more patiently."
};

function pointPercent(point) {
  return {
    x: 14 + point.x * 18,
    y: 14 + point.y * 18
  };
}

const BOARD_LAYOUT = POINTS.map((point) => ({
  ...point,
  ...pointPercent(point)
}));

function formatActor(actor) {
  if (actor === "goat") {
    return "Goat";
  }

  if (actor === "tiger") {
    return "Tiger";
  }

  return "System";
}

class FolkMusicController {
  constructor(button) {
    this.button = button;
    this.context = null;
    this.intervalId = null;
    this.enabled = false;
    this.phraseIndex = 0;
    this.melody = [220, 246.94, 293.66, 329.63, 293.66, 246.94];
  }

  async toggle() {
    if (this.enabled) {
      this.stop();
      return;
    }

    await this.start();
  }

  async start() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        this.button.textContent = "Music Unsupported";
        this.button.disabled = true;
        return;
      }

      this.context = new AudioContextClass();
    }

    await this.context.resume();
    this.enabled = true;
    this.button.textContent = "Music On";
    this.button.setAttribute("aria-pressed", "true");
    this.schedulePhrase();
    this.intervalId = window.setInterval(() => this.schedulePhrase(), 2600);
  }

  stop() {
    this.enabled = false;
    this.button.textContent = "Music Off";
    this.button.setAttribute("aria-pressed", "false");
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.context?.suspend();
  }

  schedulePhrase() {
    if (!this.context || !this.enabled) {
      return;
    }

    const start = this.context.currentTime + 0.05;
    this.playTone(110, start, 2.2, 0.018, "sine");
    this.playTone(165, start, 2.2, 0.012, "triangle");

    for (let index = 0; index < 4; index += 1) {
      const note = this.melody[(this.phraseIndex + index) % this.melody.length];
      this.playTone(note, start + index * 0.38, 0.28, 0.02, "triangle");
    }

    this.phraseIndex = (this.phraseIndex + 1) % this.melody.length;
  }

  playTone(frequency, time, duration, gainAmount, type) {
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, time);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.exponentialRampToValueAtTime(gainAmount, time + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
  }
}

class BaghChalApp {
  constructor() {
    this.state = createInitialState();
    this.selectedPieceId = null;
    this.effects = [];
    this.effectId = 0;
    this.mode = elements.modeSelect.value;
    this.difficulty = elements.difficultySelect.value;
    this.humanSide = elements.humanSideSelect.value;
    this.aiPending = false;
    this.aiRequestId = 0;
    this.pendingAiJob = null;
    this.clock = 0;
    this.tasks = [];
    this.frameHandle = null;
    this.pieceNodes = new Map();
    this.effectNodes = new Map();
    this.music = new FolkMusicController(elements.musicToggleBtn);
    this.aiWorker = this.createAiWorker();
    this.lastFrameTime = performance.now();

    this.renderStaticBoard();
    this.bindEvents();
    this.applyModeState();
    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  bindEvents() {
    elements.modeSelect.addEventListener("change", () => {
      this.mode = elements.modeSelect.value;
      this.applyModeState();
    });

    elements.difficultySelect.addEventListener("change", () => {
      this.difficulty = elements.difficultySelect.value;
      this.applyModeState();
    });

    elements.humanSideSelect.addEventListener("change", () => {
      this.humanSide = elements.humanSideSelect.value;
      this.applyModeState();
    });

    elements.newGameBtn.addEventListener("click", () => this.resetGame());
    elements.musicToggleBtn.addEventListener("click", () => this.music.toggle());
    window.addEventListener("beforeunload", () => {
      this.aiWorker?.terminate();
    });
  }

  createAiWorker() {
    if (typeof Worker !== "function") {
      return null;
    }

    try {
      const worker = new Worker("/js/baghChalAIWorker.js?v=20260419a", { type: "module" });
      worker.addEventListener("message", (event) => this.handleAiResult(event.data));
      worker.addEventListener("error", () => {
        if (this.aiWorker !== worker) {
          return;
        }

        worker.terminate();
        this.aiWorker = null;
        if (this.pendingAiJob) {
          const { requestId, stateSnapshot } = this.pendingAiJob;
          window.setTimeout(() => this.runAiFallback(requestId, stateSnapshot), 0);
        }
      });
      return worker;
    } catch {
      return null;
    }
  }

  resetAiWorker() {
    this.aiWorker?.terminate();
    this.aiWorker = this.createAiWorker();
  }

  cloneStateForAi(state) {
    if (typeof structuredClone === "function") {
      return structuredClone(state);
    }

    return JSON.parse(JSON.stringify(state));
  }

  handleAiResult(payload = {}) {
    if (payload.requestId !== this.aiRequestId) {
      return;
    }

    this.aiPending = false;
    this.pendingAiJob = null;

    if (!this.isAiTurn()) {
      this.renderStatus();
      return;
    }

    if (payload.error) {
      this.renderStatus();
      elements.statusLine.textContent = "AI hit a snag. Try the move again or start a new match.";
      return;
    }

    if (payload.action) {
      this.commitAction(payload.action);
      return;
    }

    this.render();
  }

  runAiFallback(requestId, stateSnapshot) {
    if (requestId !== this.aiRequestId || !this.isAiTurn()) {
      return;
    }

    try {
      const action = getAiMove(stateSnapshot, this.difficulty);
      this.handleAiResult({ requestId, action });
    } catch (error) {
      this.handleAiResult({
        requestId,
        error: error.message || "AI move failed."
      });
    }
  }

  renderStaticBoard() {
    elements.boardLines.innerHTML = EDGE_LIST.map(({ from, to }) => {
      const fromPoint = BOARD_LAYOUT[from];
      const toPoint = BOARD_LAYOUT[to];
      return `<line x1="${fromPoint.x}" y1="${fromPoint.y}" x2="${toPoint.x}" y2="${toPoint.y}"></line>`;
    }).join("");

    elements.boardPoints.innerHTML = BOARD_LAYOUT.map((point) => `
      <button
        class="board-point"
        type="button"
        data-point="${point.index}"
        style="left:${point.x}%; top:${point.y}%"
        aria-label="Point ${point.label}"
      ></button>
    `).join("");

    elements.boardPoints.querySelectorAll("[data-point]").forEach((button) => {
      button.addEventListener("click", () => this.handlePointClick(Number(button.dataset.point)));
    });
  }

  applyModeState() {
    const isAiMode = this.mode === "ai";
    elements.difficultySelect.disabled = !isAiMode;
    elements.humanSideSelect.disabled = !isAiMode;
    elements.modeNote.textContent = modeNotes[this.mode];
    this.clearTransientState();

    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  frame(now) {
    this.frameHandle = null;
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.advance(delta);

    if (this.tasks.length) {
      this.ensureFrameLoop();
    }
  }

  advance(milliseconds = 16) {
    this.clock += Math.max(0, milliseconds);
    let tasksRan = false;

    while (this.tasks.length && this.tasks[0].dueAt <= this.clock) {
      const task = this.tasks.shift();
      task.callback();
      tasksRan = true;
    }

    if (tasksRan) {
      this.render();
    }

    if (this.tasks.length) {
      this.ensureFrameLoop();
    }
  }

  schedule(delay, callback, key = null) {
    if (key) {
      this.cancelTask(key);
    }

    this.tasks.push({
      key,
      dueAt: this.clock + delay,
      callback
    });
    this.tasks.sort((left, right) => left.dueAt - right.dueAt);
    this.ensureFrameLoop();
  }

  cancelTask(key) {
    this.tasks = this.tasks.filter((task) => task.key !== key);
  }

  ensureFrameLoop() {
    if (this.frameHandle !== null || !this.tasks.length) {
      return;
    }

    this.lastFrameTime = performance.now();
    this.frameHandle = window.requestAnimationFrame((now) => this.frame(now));
  }

  clearTransientState() {
    this.selectedPieceId = null;
    this.aiPending = false;
    this.aiRequestId += 1;
    this.pendingAiJob = null;
    this.cancelTask("ai-turn");
    this.resetAiWorker();
  }

  resetGame() {
    this.state = createInitialState();
    this.effects = [];
    this.clearTransientState();
    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  isAiTurn() {
    return this.mode === "ai" && !this.state.winner && this.state.turn !== this.humanSide;
  }

  canHumanAct() {
    if (this.state.winner || this.aiPending) {
      return false;
    }

    if (this.mode === "local") {
      return true;
    }

    return this.state.turn === this.humanSide;
  }

  scheduleAiTurnIfNeeded() {
    if (!this.isAiTurn() || this.aiPending) {
      return;
    }

    this.aiPending = true;
    const requestId = ++this.aiRequestId;
    const stateSnapshot = this.cloneStateForAi(this.state);
    this.pendingAiJob = { requestId, stateSnapshot };
    this.renderStatus();

    this.schedule(180, () => {
      if (requestId !== this.aiRequestId || !this.isAiTurn()) {
        this.aiPending = false;
        this.pendingAiJob = null;
        this.renderStatus();
        return;
      }

      if (this.aiWorker) {
        this.aiWorker.postMessage({
          requestId,
          state: stateSnapshot,
          difficulty: this.difficulty
        });
        return;
      }

      window.setTimeout(() => this.runAiFallback(requestId, stateSnapshot), 0);
    }, "ai-turn");
  }

  commitAction(action) {
    this.state = applyAction(this.state, action);
    this.selectedPieceId = null;

    if (action.type === "capture") {
      this.spawnCaptureEffect(action.over);
    }

    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  spawnCaptureEffect(position) {
    const effect = {
      id: `capture-${this.effectId += 1}`,
      position
    };
    this.effects.push(effect);

    this.schedule(460, () => {
      this.effects = this.effects.filter((entry) => entry.id !== effect.id);
    }, effect.id);
  }

  handlePieceClick(pieceId) {
    if (!this.canHumanAct()) {
      return;
    }

    const piece = this.state.pieces[pieceId];
    if (!piece || piece.captured || piece.type !== this.state.turn) {
      return;
    }

    if (piece.type === "goat" && this.state.phase === "placement") {
      return;
    }

    this.selectedPieceId = this.selectedPieceId === pieceId ? null : pieceId;
    this.render();
  }

  handlePointClick(position) {
    if (!this.canHumanAct()) {
      return;
    }

    if (this.state.turn === "goat" && this.state.phase === "placement") {
      const placement = getLegalActions(this.state)
        .find((action) => action.type === "place" && action.to === position);

      if (placement) {
        this.commitAction(placement);
      }
      return;
    }

    if (!this.selectedPieceId) {
      return;
    }

    const action = getActionsForSelection(this.state, this.selectedPieceId)
      .find((candidate) => candidate.to === position);

    if (action) {
      this.commitAction(action);
      return;
    }

    if (!this.state.board[position]) {
      this.selectedPieceId = null;
      this.render();
    }
  }

  getSelectionActions() {
    if (!this.selectedPieceId) {
      return [];
    }

    return getActionsForSelection(this.state, this.selectedPieceId);
  }

  getVisibleActions() {
    if (!this.canHumanAct()) {
      return [];
    }

    if (this.state.turn === "goat" && this.state.phase === "placement") {
      return getLegalActions(this.state).filter((action) => action.type === "place");
    }

    return this.getSelectionActions();
  }

  renderPieces() {
    const livePieces = getLivePieces(this.state);
    const liveIds = new Set(livePieces.map((piece) => piece.id));

    for (const [pieceId, node] of this.pieceNodes.entries()) {
      if (!liveIds.has(pieceId)) {
        node.remove();
        this.pieceNodes.delete(pieceId);
      }
    }

    livePieces
      .slice()
      .sort((left, right) => left.type.localeCompare(right.type))
      .forEach((piece) => {
        const point = BOARD_LAYOUT[piece.position];
        const isSelected = this.selectedPieceId === piece.id;
        const label = `${piece.type === "tiger" ? "Tiger" : "Goat"} at ${point.label}`;
        let node = this.pieceNodes.get(piece.id);

        if (!node) {
          node = document.createElement("button");
          node.type = "button";
          node.dataset.pieceId = piece.id;
          node.addEventListener("click", () => this.handlePieceClick(piece.id));
          this.pieceNodes.set(piece.id, node);
        }

        node.className = `piece ${piece.type}${isSelected ? " selected" : ""}`;
        node.style.left = `${point.x}%`;
        node.style.top = `${point.y}%`;
        node.setAttribute("aria-label", label);
        node.innerHTML = `<span class="piece-icon" aria-hidden="true">${piece.type === "tiger" ? "&#128047;" : "&#128016;"}</span>`;
        elements.pieceLayer.appendChild(node);
      });

    const activeEffectIds = new Set(this.effects.map((effect) => effect.id));
    for (const [effectId, node] of this.effectNodes.entries()) {
      if (!activeEffectIds.has(effectId)) {
        node.remove();
        this.effectNodes.delete(effectId);
      }
    }

    this.effects.forEach((effect) => {
      const point = BOARD_LAYOUT[effect.position];
      let node = this.effectNodes.get(effect.id);

      if (!node) {
        node = document.createElement("span");
        node.className = "capture-flash";
        this.effectNodes.set(effect.id, node);
      }

      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      elements.pieceLayer.appendChild(node);
    });
  }

  renderActions() {
    const actions = this.getVisibleActions();

    elements.moveLayer.innerHTML = actions.map((action) => {
      const point = BOARD_LAYOUT[action.to];
      const classes = ["move-node"];

      if (action.type === "capture") {
        classes.push("capture");
      }

      if (action.type === "place") {
        classes.push("place");
      }

      return `
        <button
          type="button"
          class="${classes.join(" ")}"
          data-point="${action.to}"
          style="left:${point.x}%; top:${point.y}%"
          aria-label="Move to ${point.label}"
        ></button>
      `;
    }).join("");

    elements.moveLayer.querySelectorAll("[data-point]").forEach((button) => {
      button.addEventListener("click", () => this.handlePointClick(Number(button.dataset.point)));
    });
  }

  renderStatus() {
    const goatsPlaced = this.state.goatsPlaced;
    const goatsCaptured = this.state.goatsCaptured;
    const goatsReserve = getGoatsRemainingToPlace(this.state);
    const trappedTigers = countTrappedTigers(this.state);
    const tigerMobility = countTigerMobility(this.state);
    const selectedPiece = this.selectedPieceId ? this.state.pieces[this.selectedPieceId] : null;
    const selectedMoves = selectedPiece ? getActionsForSelection(this.state, selectedPiece.id) : [];
    const aiDescriptor = this.mode === "ai"
      ? `${this.difficulty[0].toUpperCase()}${this.difficulty.slice(1)} AI - Human plays ${this.humanSide === "goat" ? "Goats" : "Tigers"}`
      : "Local duel on this device";

    elements.turnBadge.textContent = this.state.turn === "goat" ? "Goats Turn" : "Tigers Turn";
    elements.turnBadge.className = `turn-badge ${this.state.turn === "goat" ? "goat-turn" : "tiger-turn"}`;
    elements.phaseLabel.textContent = this.state.phase === "placement" ? "Placement Phase" : "Movement Phase";
    elements.aiStatus.textContent = this.aiPending ? `${aiDescriptor} - Thinking...` : aiDescriptor;
    elements.goatsPlacedValue.textContent = `${goatsPlaced} / ${TOTAL_GOATS}`;
    elements.goatsCapturedValue.textContent = `${goatsCaptured} / ${TIGER_WIN_CAPTURES}`;
    elements.goatsReserveValue.textContent = String(goatsReserve);
    elements.trappedValue.textContent = `${trappedTigers} / 4`;

    if (selectedPiece) {
      const position = fromIndex(selectedPiece.position);
      elements.selectionLabel.textContent = `${selectedPiece.type === "tiger" ? "Tiger" : "Goat"} at ${position.label} - ${selectedMoves.length} moves`;
    } else if (this.state.turn === "goat" && this.state.phase === "placement" && this.canHumanAct()) {
      elements.selectionLabel.textContent = "Placement phase - choose any empty point.";
    } else {
      elements.selectionLabel.textContent = "No piece selected.";
    }

    if (this.state.winner === "goat") {
      elements.goalLabel.textContent = "The tigers are caged. The village wins.";
      elements.statusLine.textContent = "All four tigers are blocked. Start a new match to play again.";
      elements.winnerBanner.classList.remove("hidden");
      elements.winnerTitle.textContent = "Goats Win";
      elements.winnerText.textContent = "Every tiger is trapped and the board belongs to the herd.";
    } else if (this.state.winner === "tiger") {
      elements.goalLabel.textContent = "The hunt is over. Five goats were captured.";
      elements.statusLine.textContent = "Tigers claimed five goats. Start a new match to challenge them again.";
      elements.winnerBanner.classList.remove("hidden");
      elements.winnerTitle.textContent = "Tigers Win";
      elements.winnerText.textContent = "The tigers have captured enough goats to break the defense.";
    } else {
      elements.winnerBanner.classList.add("hidden");

      if (this.state.turn === "goat") {
        if (this.state.phase === "placement") {
          elements.goalLabel.textContent = "Place goats on strong junctions and choke the tiger lanes.";
          elements.statusLine.textContent = this.aiPending
            ? "The AI is placing a goat."
            : "Goats place one by one before they can move.";
        } else {
          elements.goalLabel.textContent = `Seal escape lines. ${4 - trappedTigers} tiger${4 - trappedTigers === 1 ? "" : "s"} still have room.`;
          elements.statusLine.textContent = this.aiPending
            ? "The AI is finding a blocking move."
            : "Goats move one step along connected lines to close the net.";
        }
      } else {
        elements.goalLabel.textContent = `Look for exposed goats. Tiger mobility sits at ${tigerMobility}.`;
        elements.statusLine.textContent = this.aiPending
          ? "The AI is reading the board."
          : "Tigers move one step or jump a goat to capture it.";
      }
    }

    elements.moveLog.innerHTML = this.state.log.map((entry) => `
      <li>
        <strong>${formatActor(entry.actor)}</strong>
        <p>${entry.text}</p>
      </li>
    `).join("");
  }

  render() {
    this.renderStatus();
    this.renderActions();
    this.renderPieces();
  }

  describeState() {
    return JSON.stringify({
      coordinateSystem: "origin top-left, x increases right, y increases down",
      mode: this.mode,
      difficulty: this.mode === "ai" ? this.difficulty : "local",
      turn: this.state.turn,
      phase: this.state.phase,
      goatsPlaced: this.state.goatsPlaced,
      goatsCaptured: this.state.goatsCaptured,
      goatsToPlace: getGoatsRemainingToPlace(this.state),
      trappedTigers: countTrappedTigers(this.state),
      tigerAdvantage: evaluateTigerAdvantage(this.state),
      winner: this.state.winner,
      aiPending: this.aiPending,
      selectedPieceId: this.selectedPieceId,
      highlightedMoves: this.getVisibleActions().map((action) => ({
        type: action.type,
        to: fromIndex(action.to).label,
        over: action.over !== undefined ? fromIndex(action.over).label : null
      })),
      pieces: getLivePieces(this.state).map((piece) => ({
        id: piece.id,
        type: piece.type,
        position: fromIndex(piece.position).label,
        neighbors: ADJACENCY[piece.position].map((index) => fromIndex(index).label)
      }))
    });
  }
}

const app = new BaghChalApp();
window.render_game_to_text = () => app.describeState();
window.advanceTime = (milliseconds = 16) => {
  app.advance(milliseconds);
};
