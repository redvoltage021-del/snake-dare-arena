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
import { createBaghChalClient } from "./baghChalNetwork.js";

const elements = {
  modeSelect: document.getElementById("modeSelect"),
  difficultyField: document.getElementById("difficultyField"),
  difficultySelect: document.getElementById("difficultySelect"),
  sideField: document.getElementById("sideField"),
  sideFieldLabel: document.getElementById("sideFieldLabel"),
  humanSideSelect: document.getElementById("humanSideSelect"),
  onlineFields: document.getElementById("onlineFields"),
  onlinePlayerName: document.getElementById("onlinePlayerName"),
  onlineRoomCode: document.getElementById("onlineRoomCode"),
  createOnlineBtn: document.getElementById("createOnlineBtn"),
  joinOnlineBtn: document.getElementById("joinOnlineBtn"),
  leaveOnlineBtn: document.getElementById("leaveOnlineBtn"),
  onlineRoomBadge: document.getElementById("onlineRoomBadge"),
  onlineStatusLine: document.getElementById("onlineStatusLine"),
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
  toastStack: document.getElementById("toastStack"),
  winnerBanner: document.getElementById("winnerBanner"),
  winnerTitle: document.getElementById("winnerTitle"),
  winnerText: document.getElementById("winnerText"),
  board: document.getElementById("baghChalBoard"),
  boardLines: document.getElementById("boardLines"),
  boardPoints: document.getElementById("boardPoints"),
  moveLayer: document.getElementById("moveLayer"),
  pieceLayer: document.getElementById("pieceLayer")
};

const modeNotes = {
  local: "Local mode keeps both sides on this board. Switch to AI when you want solo practice.",
  ai: "AI mode lets you take goats or tigers. Hard uses a deeper minimax search, so it plays more patiently.",
  online: "Online mode creates a shared live board. One player takes goats, the other takes tigers, and both use the same team code."
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

function formatSide(side) {
  return side === "goat" ? "Goats" : "Tigers";
}

function normalizePlayerName(value) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 18);
  return clean || "Black Phoenix";
}

class FolkMusicController {
  constructor(button) {
    this.button = button;
    this.context = null;
    this.intervalId = null;
    this.enabled = false;
    this.phraseIndex = 0;
    this.phrases = [
      [293.66, 349.23, 392, 440, 392, 349.23],
      [293.66, 392, 440, 523.25, 440, 392],
      [261.63, 293.66, 349.23, 392, 349.23, 293.66]
    ];
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
    this.intervalId = window.setInterval(() => this.schedulePhrase(), 3400);
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
    const phrase = this.phrases[this.phraseIndex % this.phrases.length];

    this.playDrone(146.83, start, 3.15, 0.012);
    this.playDrone(220, start, 3.15, 0.007);
    this.playBell(293.66, start + 0.16, 0.1, 0.008);

    phrase.forEach((note, index) => {
      const phraseStart = start + index * 0.44;
      const duration = index === phrase.length - 1 ? 0.6 : 0.34;
      this.playFlute(note, phraseStart, duration, 0.024);

      if (index % 2 === 0) {
        this.playPluck(Math.max(110, note / 2), phraseStart, 0.14, 0.012);
      }
    });

    this.playPluck(196, start + 2.72, 0.18, 0.014);
    this.phraseIndex = (this.phraseIndex + 1) % this.phrases.length;
  }

  playDrone(frequency, time, duration, gainAmount) {
    const base = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gainNode = this.context.createGain();

    base.type = "triangle";
    overtone.type = "sine";
    base.frequency.setValueAtTime(frequency, time);
    overtone.frequency.setValueAtTime(frequency * 2, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, time);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.exponentialRampToValueAtTime(gainAmount, time + 0.12);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    base.connect(filter);
    overtone.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    base.start(time);
    overtone.start(time);
    base.stop(time + duration + 0.08);
    overtone.stop(time + duration + 0.08);
  }

  playFlute(frequency, time, duration, gainAmount) {
    const lead = this.context.createOscillator();
    const air = this.context.createOscillator();
    const vibrato = this.context.createOscillator();
    const vibratoGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const gainNode = this.context.createGain();

    lead.type = "triangle";
    air.type = "sine";
    vibrato.type = "sine";
    lead.frequency.setValueAtTime(frequency, time);
    air.frequency.setValueAtTime(frequency * 1.01, time);
    vibrato.frequency.setValueAtTime(5.4, time);
    vibratoGain.gain.setValueAtTime(6, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.setValueAtTime(1.6, time);

    vibrato.connect(vibratoGain);
    vibratoGain.connect(lead.detune);
    vibratoGain.connect(air.detune);

    gainNode.gain.setValueAtTime(0.0001, time);
    gainNode.gain.linearRampToValueAtTime(gainAmount, time + 0.08);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainAmount * 0.52), time + duration * 0.55);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    lead.connect(filter);
    air.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    lead.start(time);
    air.start(time);
    vibrato.start(time);
    lead.stop(time + duration + 0.08);
    air.stop(time + duration + 0.08);
    vibrato.stop(time + duration + 0.08);
  }

  playPluck(frequency, time, duration, gainAmount) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gainNode = this.context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(780, time);
    filter.Q.setValueAtTime(1.2, time);

    gainNode.gain.setValueAtTime(gainAmount, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
  }

  playBell(frequency, time, duration, gainAmount) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gainNode = this.context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * 2, time);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1600, time);

    gainNode.gain.setValueAtTime(gainAmount, time);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.context.destination);

    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
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
    this.pieceFeedback = new Map();
    this.toasts = [];
    this.toastId = 0;
    this.lastWinnerAnnounced = null;
    this.lastAiTurnToastKey = "";
    this.music = new FolkMusicController(elements.musicToggleBtn);
    this.aiWorker = this.createAiWorker();
    this.lastFrameTime = performance.now();
    this.online = {
      client: null,
      roomCode: "",
      roomState: null,
      localSide: null,
      ignoreDisconnect: false
    };

    if (elements.onlinePlayerName && !elements.onlinePlayerName.value) {
      elements.onlinePlayerName.value = "Black Phoenix";
    }

    this.renderStaticBoard();
    this.bindEvents();
    this.applyModeState();
    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  bindEvents() {
    elements.modeSelect.addEventListener("change", () => {
      const previousMode = this.mode;
      this.mode = elements.modeSelect.value;
      this.applyModeState({ previousMode });
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
    elements.createOnlineBtn?.addEventListener("click", () => this.createOnlineRoom());
    elements.joinOnlineBtn?.addEventListener("click", () => this.joinOnlineRoom());
    elements.leaveOnlineBtn?.addEventListener("click", () => this.leaveOnlineRoom("You left the online match."));
    elements.onlineRoomCode?.addEventListener("input", () => {
      elements.onlineRoomCode.value = elements.onlineRoomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    elements.onlineRoomCode?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.joinOnlineRoom();
      }
    });
    elements.board.addEventListener("click", (event) => this.handleBoardSurfaceClick(event));
    window.addEventListener("beforeunload", () => {
      this.aiWorker?.terminate();
      this.online.client?.disconnect();
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

  getPlayerName() {
    return normalizePlayerName(elements.onlinePlayerName?.value);
  }

  buildOnlineProfile() {
    return {
      displayName: this.getPlayerName()
    };
  }

  async ensureOnlineClient() {
    if (this.online.client) {
      return this.online.client;
    }

    const client = await createBaghChalClient();
    this.bindOnlineClient(client);
    this.online.client = client;
    return client;
  }

  bindOnlineClient(client) {
    client.on("baghChal:roomCreated", ({ roomCode, assignedSide }) => {
      this.mode = "online";
      elements.modeSelect.value = "online";
      this.online.roomCode = roomCode;
      this.online.localSide = assignedSide;
      this.applyModeState({ preserveOnlineRoom: true });
      this.pushToast({
        title: "Team Code Ready",
        message: `Room ${roomCode} is live. Share it and wait for the second player.`,
        tone: "success",
        duration: 2800
      });
    });

    client.on("baghChal:roomJoined", ({ roomCode, assignedSide }) => {
      this.mode = "online";
      elements.modeSelect.value = "online";
      this.online.roomCode = roomCode;
      this.online.localSide = assignedSide;
      this.applyModeState({ preserveOnlineRoom: true });
      this.pushToast({
        title: "Joined Match",
        message: `You joined room ${roomCode} as ${formatSide(assignedSide)}.`,
        tone: "success",
        duration: 2600
      });
    });

    client.on("baghChal:state", (payload) => {
      const previousMoveCount = this.state.moveCount;
      this.state = this.cloneStateForAi(payload.gameState);
      this.selectedPieceId = null;
      this.online.roomState = payload;
      this.online.roomCode = payload.roomCode;
      this.online.localSide = payload.localSide;
      elements.onlineRoomBadge.textContent = payload.roomCode;
      elements.onlineRoomCode.value = payload.roomCode;
      elements.leaveOnlineBtn.hidden = !payload.roomCode;
      elements.onlineStatusLine.textContent = payload.roomNotice;

      if (this.state.moveCount !== previousMoveCount && this.state.recentMove?.type === "capture") {
        this.spawnCaptureEffect(this.state.recentMove.over);
      }

      this.render();
      this.announceWinnerIfNeeded();
    });

    client.on("baghChal:roomLeft", () => {
      this.closeOnlineSession("Create a new code or join another live board.");
      this.render();
    });

    client.on("baghChal:error", ({ message }) => {
      const text = message || "Online move failed.";
      this.pushToast({
        title: "Online Match",
        message: text,
        tone: "warning",
        duration: 2600
      });
      elements.onlineStatusLine.textContent = text;
    });

    client.on("disconnect", () => {
      if (this.online.ignoreDisconnect) {
        this.online.ignoreDisconnect = false;
        return;
      }

      if (this.mode !== "online") {
        return;
      }

      this.pushToast({
        title: "Connection Lost",
        message: "The live board disconnected. Rejoin the room when the backend wakes up again.",
        tone: "warning",
        duration: 2600
      });
      elements.onlineStatusLine.textContent = "Connection lost. Rejoin the team code to continue.";
    });
  }

  closeOnlineSession(message) {
    if (this.online.client) {
      this.online.ignoreDisconnect = true;
      this.online.client.disconnect();
      this.online.client = null;
    }

    this.online.roomCode = "";
    this.online.roomState = null;
    this.online.localSide = null;
    this.state = createInitialState();
    this.selectedPieceId = null;
    this.lastWinnerAnnounced = null;
    elements.onlineRoomBadge.textContent = "Not connected";
    elements.leaveOnlineBtn.hidden = true;
    elements.onlineStatusLine.textContent = message;

  }

  async createOnlineRoom() {
    try {
      const client = await this.ensureOnlineClient();
      const preferredSide = elements.humanSideSelect.value;
      const playerName = this.getPlayerName();
      elements.onlinePlayerName.value = playerName;
      client.createRoom(this.buildOnlineProfile(), {
        preferredSide
      });
      elements.onlineStatusLine.textContent = `Creating team code for ${formatSide(preferredSide)}...`;
    } catch (error) {
      this.pushToast({
        title: "Online Match",
        message: error.message || "The live room service is unavailable right now.",
        tone: "warning",
        duration: 2600
      });
    }
  }

  async joinOnlineRoom() {
    const roomCode = String(elements.onlineRoomCode.value || "").trim().toUpperCase();
    if (!roomCode) {
      this.pushToast({
        title: "Need Team Code",
        message: "Enter a team code before you try to join the live match.",
        tone: "warning",
        duration: 2200
      });
      return;
    }

    try {
      const client = await this.ensureOnlineClient();
      const preferredSide = elements.humanSideSelect.value;
      const playerName = this.getPlayerName();
      elements.onlinePlayerName.value = playerName;
      client.joinRoom(roomCode, this.buildOnlineProfile(), {
        preferredSide
      });
      elements.onlineStatusLine.textContent = `Joining room ${roomCode}...`;
    } catch (error) {
      this.pushToast({
        title: "Online Match",
        message: error.message || "The live room service is unavailable right now.",
        tone: "warning",
        duration: 2600
      });
    }
  }

  leaveOnlineRoom(message = "You left the online match.") {
    if (this.online.client?.roomCode) {
      this.online.client.leaveRoom();
    } else {
      this.closeOnlineSession(message);
      this.render();
    }
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
      this.pushToast({
        title: "AI Error",
        message: "The AI could not finish its turn cleanly. Start a new match or try again.",
        tone: "warning",
        duration: 2600
      });
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

  applyModeState({ previousMode = this.mode, preserveOnlineRoom = false } = {}) {
    const isAiMode = this.mode === "ai";
    const isOnlineMode = this.mode === "online";
    elements.difficultyField.hidden = !isAiMode;
    elements.difficultySelect.disabled = !isAiMode;
    elements.sideField.hidden = this.mode === "local";
    elements.humanSideSelect.disabled = this.mode === "local";
    elements.sideFieldLabel.textContent = isOnlineMode ? "Preferred Side" : "Human Side";
    elements.onlineFields.hidden = !isOnlineMode;
    elements.modeNote.textContent = modeNotes[this.mode];

    if (previousMode === "online" && !isOnlineMode && !preserveOnlineRoom) {
      this.closeOnlineSession("Returned to local board control.");
    }

    this.clearTransientState();

    if (isOnlineMode && !preserveOnlineRoom) {
      this.state = createInitialState();
      this.lastWinnerAnnounced = null;
    }

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
    this.pieceFeedback.clear();
    this.lastAiTurnToastKey = "";
    this.cancelTask("ai-turn");
    this.resetAiWorker();
  }

  resetGame() {
    if (this.mode === "online" && this.online.client?.roomCode) {
      this.online.client.requestReset();
      this.pushToast({
        title: "Reset Requested",
        message: "Starting a fresh live match on the shared board.",
        tone: "info",
        duration: 1800
      });
      return;
    }

    this.state = createInitialState();
    this.effects = [];
    this.toasts = [];
    this.lastWinnerAnnounced = null;
    this.clearTransientState();
    this.render();
    this.scheduleAiTurnIfNeeded();
  }

  pushToast({ title, message, tone = "info", duration = 2400 }) {
    const id = `toast-${this.toastId += 1}`;
    this.toasts = [...this.toasts.slice(-2), { id, title, message, tone }];
    this.renderToasts();

    this.schedule(duration, () => {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
      this.renderToasts();
    }, id);
  }

  renderToasts() {
    elements.toastStack.innerHTML = this.toasts
      .map((toast) => `
        <article class="toast toast--${toast.tone}">
          <strong>${toast.title}</strong>
          <p>${toast.message}</p>
        </article>
      `)
      .join("");
  }

  triggerPieceFeedback(pieceId, kind = "feedback-blocked", duration = 420) {
    this.pieceFeedback.set(pieceId, kind);
    this.render();

    this.schedule(duration, () => {
      this.pieceFeedback.delete(pieceId);
    }, `piece-feedback-${pieceId}`);
  }

  announceWinnerIfNeeded() {
    if (!this.state.winner) {
      this.lastWinnerAnnounced = null;
      return;
    }

    if (this.lastWinnerAnnounced === this.state.winner) {
      return;
    }

    this.lastWinnerAnnounced = this.state.winner;
    this.pushToast({
      title: this.state.winner === "goat" ? "Goats Win" : "Tigers Win",
      message: this.state.winner === "goat"
        ? "Every tiger is trapped. The herd closes the board."
        : "Five goats were captured. The tigers break the defense.",
      tone: "success",
      duration: 3200
    });
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

    if (this.mode === "online") {
      return Boolean(this.online.roomState?.localCanAct);
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

    const aiToastKey = `${this.state.moveCount}-${this.state.turn}-${this.state.phase}-${this.difficulty}`;
    if (this.lastAiTurnToastKey !== aiToastKey) {
      this.lastAiTurnToastKey = aiToastKey;
      this.pushToast({
        title: "AI Turn",
        message: this.state.turn === "goat"
          ? this.state.phase === "placement"
            ? "The AI is placing the next goat."
            : "The AI is tightening the net around the tigers."
          : "The AI is reading the tiger lines for a capture or escape.",
        tone: "info",
        duration: 1800
      });
    }

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
    this.announceWinnerIfNeeded();
    this.scheduleAiTurnIfNeeded();
  }

  submitResolvedAction(action) {
    if (!action) {
      return;
    }

    if (this.mode === "online") {
      this.selectedPieceId = null;
      this.online.client?.submitAction(action);
      this.render();
      return;
    }

    this.commitAction(action);
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
      this.selectedPieceId = pieceId;
      this.triggerPieceFeedback(pieceId);
      this.pushToast({
        title: "Placement Phase",
        message: "Place all 20 goats before moving goats across the board.",
        tone: "warning"
      });
      this.render();
      return;
    }

    const selectingPiece = this.selectedPieceId !== pieceId;
    this.selectedPieceId = selectingPiece ? pieceId : null;

    if (selectingPiece) {
      const moves = getActionsForSelection(this.state, pieceId);
      if (!moves.length) {
        const position = fromIndex(piece.position).label;
        this.triggerPieceFeedback(pieceId);
        this.pushToast({
          title: "No Escape Route",
          message: `${piece.type === "tiger" ? "Tiger" : "Goat"} at ${position} is trapped and has no legal move.`,
          tone: "warning"
        });
      }
    }

    this.render();
  }

  getNearestBoardPoint(event) {
    const rect = elements.board.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const threshold = Math.max(22, rect.width * 0.08);
    let nearestPoint = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    BOARD_LAYOUT.forEach((point) => {
      const pointX = rect.width * (point.x / 100);
      const pointY = rect.height * (point.y / 100);
      const distance = Math.hypot(localX - pointX, localY - pointY);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = point.index;
      }
    });

    return nearestDistance <= threshold ? nearestPoint : null;
  }

  handleBoardSurfaceClick(event) {
    const clickedControl = event.target.closest("[data-point], [data-piece-id]");
    if (clickedControl || !this.canHumanAct()) {
      return;
    }

    const nearestPoint = this.getNearestBoardPoint(event);
    if (nearestPoint === null) {
      return;
    }

    const pieceId = this.state.board[nearestPoint];
    if (pieceId && this.state.pieces[pieceId]?.type === this.state.turn) {
      this.handlePieceClick(pieceId);
      return;
    }

    this.handlePointClick(nearestPoint);
  }

  handlePointClick(position) {
    if (!this.canHumanAct()) {
      return;
    }

    if (this.state.turn === "goat" && this.state.phase === "placement") {
      const placement = getLegalActions(this.state)
        .find((action) => action.type === "place" && action.to === position);

      if (placement) {
        this.submitResolvedAction(placement);
      }
      return;
    }

    if (!this.selectedPieceId) {
      return;
    }

    const action = getActionsForSelection(this.state, this.selectedPieceId)
      .find((candidate) => candidate.to === position);

    if (action) {
      this.submitResolvedAction(action);
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
        const feedbackClass = this.pieceFeedback.get(piece.id);
        if (feedbackClass) {
          node.className += ` ${feedbackClass}`;
        }
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
    const isOnlineMode = this.mode === "online";
    const onlineDescriptor = !this.online.roomCode
      ? "Online match not connected yet"
      : this.online.roomState?.waitingForOpponent
        ? `Team ${this.online.roomCode} - waiting for ${formatSide(this.online.localSide === "goat" ? "tiger" : "goat")}`
        : `Team ${this.online.roomCode} - You play ${formatSide(this.online.localSide)}`;
    const descriptor = this.mode === "ai"
      ? `${this.difficulty[0].toUpperCase()}${this.difficulty.slice(1)} AI - Human plays ${this.humanSide === "goat" ? "Goats" : "Tigers"}`
      : isOnlineMode
        ? onlineDescriptor
        : "Local duel on this device";

    if (elements.onlineRoomBadge) {
      elements.onlineRoomBadge.textContent = this.online.roomCode || "Not connected";
    }

    elements.turnBadge.textContent = this.state.turn === "goat" ? "Goats Turn" : "Tigers Turn";
    elements.turnBadge.className = `turn-badge ${this.state.turn === "goat" ? "goat-turn" : "tiger-turn"}`;
    elements.phaseLabel.textContent = this.state.phase === "placement" ? "Placement Phase" : "Movement Phase";
    elements.aiStatus.textContent = this.aiPending ? `${descriptor} - Thinking...` : descriptor;
    elements.goatsPlacedValue.textContent = `${goatsPlaced} / ${TOTAL_GOATS}`;
    elements.goatsCapturedValue.textContent = `${goatsCaptured} / ${TIGER_WIN_CAPTURES}`;
    elements.goatsReserveValue.textContent = String(goatsReserve);
    elements.trappedValue.textContent = `${trappedTigers} / 4`;

    if (selectedPiece) {
      const position = fromIndex(selectedPiece.position);
      elements.selectionLabel.textContent = selectedMoves.length
        ? `${selectedPiece.type === "tiger" ? "Tiger" : "Goat"} at ${position.label} - ${selectedMoves.length} moves`
        : `${selectedPiece.type === "tiger" ? "Tiger" : "Goat"} at ${position.label} - trapped`;
    } else if (isOnlineMode && this.online.roomState?.waitingForOpponent) {
      elements.selectionLabel.textContent = "Waiting for the second player to join the live board.";
    } else if (this.state.turn === "goat" && this.state.phase === "placement" && this.canHumanAct()) {
      elements.selectionLabel.textContent = "Placement phase - choose any empty point.";
    } else {
      elements.selectionLabel.textContent = "No piece selected.";
    }

    if (this.state.winner === "goat") {
      elements.goalLabel.textContent = "The tigers are caged. The village wins.";
      elements.statusLine.textContent = isOnlineMode
        ? "All four tigers are blocked. Use New Match to restart the shared board."
        : "All four tigers are blocked. Start a new match to play again.";
      elements.winnerBanner.classList.remove("hidden");
      elements.winnerTitle.textContent = "Goats Win";
      elements.winnerText.textContent = "Every tiger is trapped and the board belongs to the herd.";
    } else if (this.state.winner === "tiger") {
      elements.goalLabel.textContent = "The hunt is over. Five goats were captured.";
      elements.statusLine.textContent = isOnlineMode
        ? "Tigers claimed five goats. Use New Match to restart the shared board."
        : "Tigers claimed five goats. Start a new match to challenge them again.";
      elements.winnerBanner.classList.remove("hidden");
      elements.winnerTitle.textContent = "Tigers Win";
      elements.winnerText.textContent = "The tigers have captured enough goats to break the defense.";
    } else {
      elements.winnerBanner.classList.add("hidden");

      if (isOnlineMode && this.online.roomState?.waitingForOpponent) {
        const openSide = this.online.localSide === "goat" ? "Tigers" : "Goats";
        elements.goalLabel.textContent = "Share the team code so the second player can join.";
        elements.statusLine.textContent = `Waiting for the ${openSide} player to join room ${this.online.roomCode}.`;
      } else if (isOnlineMode && !this.canHumanAct()) {
        elements.goalLabel.textContent = this.state.turn === "goat"
          ? "Goats are on move. Read the lines and wait for your turn."
          : "Tigers are on move. Read the board and wait for your turn.";
        elements.statusLine.textContent = this.online.roomState?.roomNotice || `Waiting for ${formatSide(this.state.turn)} to move.`;
      } else if (this.state.turn === "goat") {
        if (this.state.phase === "placement") {
          elements.goalLabel.textContent = "Place goats on strong junctions and choke the tiger lanes.";
          elements.statusLine.textContent = this.aiPending
            ? "The AI is placing a goat."
            : "Tap any glowing point to place a goat on the board.";
        } else {
          elements.goalLabel.textContent = `Seal escape lines. ${4 - trappedTigers} tiger${4 - trappedTigers === 1 ? "" : "s"} still have room.`;
          elements.statusLine.textContent = this.aiPending
            ? "The AI is finding a blocking move."
            : "Tap a goat, then tap a glowing destination to close the net.";
        }
      } else {
        elements.goalLabel.textContent = `Look for exposed goats. Tiger mobility sits at ${tigerMobility}.`;
        elements.statusLine.textContent = this.aiPending
          ? "The AI is reading the board."
          : "Tap a tiger, then tap a glowing destination or capture jump.";
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
    this.renderToasts();
  }

  describeState() {
    return JSON.stringify({
      coordinateSystem: "origin top-left, x increases right, y increases down",
      mode: this.mode,
      difficulty: this.mode === "ai" ? this.difficulty : this.mode,
      turn: this.state.turn,
      phase: this.state.phase,
      goatsPlaced: this.state.goatsPlaced,
      goatsCaptured: this.state.goatsCaptured,
      goatsToPlace: getGoatsRemainingToPlace(this.state),
      trappedTigers: countTrappedTigers(this.state),
      tigerAdvantage: evaluateTigerAdvantage(this.state),
      winner: this.state.winner,
      aiPending: this.aiPending,
      onlineRoomCode: this.online.roomCode,
      onlineLocalSide: this.online.localSide,
      onlineWaitingForOpponent: Boolean(this.online.roomState?.waitingForOpponent),
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
