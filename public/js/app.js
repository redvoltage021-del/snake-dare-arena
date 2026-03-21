import { KEY_TO_DIRECTION } from "/shared/config.js";
import { formatTimeLeft } from "/shared/utils.js";
import { MultiplayerClient } from "./network.js";
import { GameRenderer } from "./renderer.js";
import { SoloGame } from "./soloGame.js";

const elements = {
  playerName: document.getElementById("playerName"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  soloBtn: document.getElementById("soloBtn"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  refreshLeaderboardBtn: document.getElementById("refreshLeaderboardBtn"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  restartBtn: document.getElementById("restartBtn"),
  roomStatus: document.getElementById("roomStatus"),
  modeValue: document.getElementById("modeValue"),
  scoreValue: document.getElementById("scoreValue"),
  targetValue: document.getElementById("targetValue"),
  dareValue: document.getElementById("dareValue"),
  roomCodeValue: document.getElementById("roomCodeValue"),
  effectsList: document.getElementById("effectsList"),
  statusFeed: document.getElementById("statusFeed"),
  leaderboardList: document.getElementById("leaderboardList"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayMessage: document.getElementById("overlayMessage"),
  canvas: document.getElementById("gameCanvas"),
  canvasFrame: document.querySelector(".canvas-frame")
};

const renderer = new GameRenderer(elements.canvas);
const network = new MultiplayerClient();

let activeMode = "menu";
let soloGame = null;
let multiplayerState = null;
let lastFrameAt = performance.now();
let lastMultiplayerScore = 0;
let suppressNextRoomLeft = false;

function setActiveMode(mode) {
  activeMode = mode;
  document.body.dataset.mode = mode;
}

function setPlayingState(isPlaying) {
  document.body.dataset.playing = isPlaying ? "true" : "false";
}

function pulseElement(element) {
  element.classList.remove("is-pulsing");
  void element.offsetWidth;
  element.classList.add("is-pulsing");
}

function triggerArenaZoom() {
  if (!elements.canvasFrame) {
    return;
  }

  elements.canvasFrame.classList.remove("is-zooming");
  void elements.canvasFrame.offsetWidth;
  elements.canvasFrame.classList.add("is-zooming");

  window.setTimeout(() => {
    elements.canvasFrame.classList.remove("is-zooming");
  }, 420);
}

function randomNickname() {
  const adjectives = ["Swift", "Neon", "Quiet", "Bold", "Turbo", "Pixel"];
  const animals = ["Adder", "Cobra", "Viper", "Python", "Mamba", "Boa"];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${
    animals[Math.floor(Math.random() * animals.length)]
  }`;
}

function getPlayerName() {
  const saved = elements.playerName.value.trim();
  if (saved) {
    return saved;
  }

  const generated = randomNickname();
  elements.playerName.value = generated;
  localStorage.setItem("snake-dare-arena-name", generated);
  return generated;
}

function persistName() {
  const value = elements.playerName.value.trim();
  if (value) {
    localStorage.setItem("snake-dare-arena-name", value);
  }
}

function setOverlay(visible, title, message) {
  document.body.dataset.overlay = visible ? "visible" : "hidden";
  elements.overlay.classList.toggle("hidden", !visible);
  elements.overlayTitle.textContent = title;
  elements.overlayMessage.textContent = message;
}

function setRoomStatus(message, isError = false) {
  elements.roomStatus.textContent = message;
  elements.roomStatus.classList.toggle("error", isError);
}

function renderEffects(effects = []) {
  if (!effects.length) {
    elements.effectsList.innerHTML = '<span class="empty-pill">No power-ups active</span>';
    return;
  }

  elements.effectsList.innerHTML = effects
    .map((effect) => {
      const suffix = effect.timeLeft ? ` ${formatTimeLeft(effect.timeLeft)}` : "";
      return `<span class="pill pill--${effect.id}">${effect.label}${suffix}</span>`;
    })
    .join("");
}

function renderFeed(feed = []) {
  if (!feed.length) {
    elements.statusFeed.innerHTML = "<p>Use WASD or arrow keys to move.</p>";
    return;
  }

  elements.statusFeed.innerHTML = feed
    .map(
      (message, index) => `
        <p class="feed-item">
          <span class="feed-index">${String(index + 1).padStart(2, "0")}</span>
          <span>${message}</span>
        </p>
      `
    )
    .join("");
}

function updateHud(localState, { modeLabel, roomCode }) {
  const nextScore = String(localState?.score ?? 0);
  const nextTarget = localState?.dare?.target ?? "Warm up your reflexes.";
  const nextDare = localState?.dare
    ? `${localState.dare.description} ${localState.dare.progress ? `| ${localState.dare.progress}` : ""}`
    : "Pick a mode to get your first challenge.";
  const nextRoom = roomCode || "-";

  if (elements.modeValue.textContent !== modeLabel) {
    pulseElement(elements.modeValue);
  }
  if (elements.scoreValue.textContent !== nextScore) {
    pulseElement(elements.scoreValue);
  }
  if (elements.roomCodeValue.textContent !== nextRoom) {
    pulseElement(elements.roomCodeValue);
  }

  elements.modeValue.textContent = modeLabel;
  elements.scoreValue.textContent = nextScore;
  elements.targetValue.textContent = nextTarget;
  elements.dareValue.textContent = nextDare;
  elements.roomCodeValue.textContent = nextRoom;
  renderEffects(localState?.activeEffects ?? []);
  renderFeed(localState?.notifications ?? []);
}

function renderLeaderboard(entries = []) {
  if (!entries.length) {
    elements.leaderboardList.innerHTML =
      "<li><div class=\"leaderboard-meta\"><strong>No solo scores yet</strong><span>Finish a solo run to seed the board.</span></div></li>";
    return;
  }

  elements.leaderboardList.innerHTML = entries
    .map(
      (entry, index) => `
        <li class="${index === 0 ? "top-entry" : ""}">
          <span class="leaderboard-rank">${entry.rank}</span>
          <div class="leaderboard-meta">
            <strong>${entry.name}</strong>
            <span>Best solo • ${entry.runs} ${entry.runs === 1 ? "run" : "runs"}</span>
          </div>
          <strong>${entry.score}</strong>
        </li>
      `
    )
    .join("");
}

async function fetchLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard?board=solo");
    const payload = await response.json();
    renderLeaderboard(payload.entries ?? []);
  } catch (error) {
    setRoomStatus("Unable to refresh leaderboard right now.", true);
  }
}

async function submitSoloScore(score) {
  if (!score) {
    return;
  }

  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: getPlayerName(),
        score,
        mode: "Solo"
      })
    });
  } catch (error) {
    setRoomStatus("Score could not be saved.", true);
  }
}

function attachSoloListeners(game) {
  game.on("burst", ({ cell, color, label }) => {
    renderer.triggerBurst(cell, color, label);
  });

  game.on("gameOver", async ({ score, reason }) => {
    setOverlay(true, "Game Over", `${reason} Final score: ${score}.`);
    await submitSoloScore(score);
    await fetchLeaderboard();
  });
}

function startSoloGame() {
  if (network.roomCode) {
    suppressNextRoomLeft = true;
    network.leaveRoom();
  }

  persistName();
  soloGame = new SoloGame({ playerName: getPlayerName() });
  attachSoloListeners(soloGame);
  multiplayerState = null;
  setActiveMode("solo");
  setPlayingState(true);
  lastMultiplayerScore = 0;
  elements.restartBtn.hidden = false;
  elements.leaveRoomBtn.hidden = true;
  setRoomStatus("Solo run loaded. Chase food, dares, and power-ups.");
  setOverlay(false, "", "");
  triggerArenaZoom();
}

function startCreateRoom() {
  persistName();
  network.createRoom(getPlayerName());
  setRoomStatus("Creating room...");
}

function startJoinRoom() {
  const code = elements.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    setRoomStatus("Enter a room code first.", true);
    return;
  }

  persistName();
  network.joinRoom(code, getPlayerName());
  setRoomStatus(`Joining room ${code}...`);
}

function returnToMenu(message) {
  setActiveMode("menu");
  setPlayingState(false);
  soloGame = null;
  multiplayerState = null;
  elements.restartBtn.hidden = true;
  elements.leaveRoomBtn.hidden = true;
  updateHud(null, { modeLabel: "Menu", roomCode: "-" });
  setOverlay(true, "Snake Dare Arena", message);
}

elements.playerName.value = localStorage.getItem("snake-dare-arena-name") || randomNickname();
elements.soloBtn.addEventListener("click", startSoloGame);
elements.restartBtn.addEventListener("click", startSoloGame);
elements.createRoomBtn.addEventListener("click", startCreateRoom);
elements.joinRoomBtn.addEventListener("click", startJoinRoom);
elements.refreshLeaderboardBtn.addEventListener("click", fetchLeaderboard);
elements.leaveRoomBtn.addEventListener("click", () => {
  suppressNextRoomLeft = false;
  network.leaveRoom();
});
elements.playerName.addEventListener("change", persistName);
elements.roomCodeInput.addEventListener("input", () => {
  elements.roomCodeInput.value = elements.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
elements.roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    startJoinRoom();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  const direction = KEY_TO_DIRECTION[event.key];
  if (direction) {
    event.preventDefault();
    if (activeMode === "solo" && soloGame) {
      soloGame.queueDirection(direction);
    } else if (activeMode === "multiplayer" && multiplayerState?.local?.alive) {
      network.sendDirection(direction);
    }
    return;
  }

  if (event.key === " " && activeMode === "solo" && soloGame && !soloGame.alive) {
    event.preventDefault();
    startSoloGame();
  }
});

network.on("roomCreated", ({ roomCode }) => {
  setActiveMode("multiplayer");
  setPlayingState(true);
  elements.restartBtn.hidden = true;
  elements.leaveRoomBtn.hidden = false;
  soloGame = null;
  lastMultiplayerScore = 0;
  elements.roomCodeInput.value = roomCode;
  setRoomStatus(`Room ${roomCode} created. Share the code and start moving.`);
  setOverlay(false, "", "");
  triggerArenaZoom();
});

network.on("roomJoined", ({ roomCode }) => {
  setActiveMode("multiplayer");
  setPlayingState(true);
  elements.restartBtn.hidden = true;
  elements.leaveRoomBtn.hidden = false;
  soloGame = null;
  lastMultiplayerScore = 0;
  elements.roomCodeInput.value = roomCode;
  setRoomStatus(`Joined room ${roomCode}. Watch for other snakes.`);
  setOverlay(false, "", "");
  triggerArenaZoom();
});

network.on("roomLeft", () => {
  if (suppressNextRoomLeft) {
    suppressNextRoomLeft = false;
    return;
  }

  returnToMenu("Room left. Start solo or join a fresh arena.");
  setRoomStatus("Start solo or create a room to challenge other snakes.");
});

network.on("roomError", ({ message }) => {
  setRoomStatus(message || "Room action failed.", true);
});

network.on("roomState", (state) => {
  if (suppressNextRoomLeft) {
    return;
  }

  multiplayerState = state;
  setActiveMode("multiplayer");
  setPlayingState(true);
  updateHud(state.local, { modeLabel: "Multiplayer", roomCode: state.roomCode });

  const localPlayer = state.players.find((player) => player.id === state.localPlayerId);
  if (state.local.score > lastMultiplayerScore && localPlayer?.segments?.[0]) {
    renderer.triggerBurst(localPlayer.segments[0], localPlayer.color, `+${state.local.score - lastMultiplayerScore}`);
  }
  lastMultiplayerScore = state.local.score;

  if (!state.local.alive) {
    setOverlay(true, "Eliminated", `${state.local.statusText} Score: ${state.local.score}.`);
  } else if (state.winnerId === state.localPlayerId && state.players.length > 1 && state.aliveCount === 1) {
    setOverlay(true, "Arena Won", `You survived room ${state.roomCode} with ${state.local.score} points.`);
  } else {
    setOverlay(false, "", "");
  }
});

network.on("leaderboardUpdated", ({ board, entries }) => {
  if (board && board !== "solo") {
    return;
  }

  renderLeaderboard(entries);
});

network.on("disconnect", () => {
  if (activeMode === "multiplayer") {
    setOverlay(true, "Disconnected", "Server connection dropped. Refresh to reconnect.");
    setRoomStatus("Connection lost.", true);
  }
});

function frame(now) {
  const delta = now - lastFrameAt;
  lastFrameAt = now;

  if (activeMode === "solo" && soloGame) {
    soloGame.update(delta);
    const snapshot = soloGame.getSnapshot();
    updateHud(snapshot.local, { modeLabel: "Solo", roomCode: "-" });
    if (snapshot.local.alive) {
      setOverlay(false, "", "");
    }
    renderer.draw(snapshot, { now, localPlayerId: "solo" });
  } else if (activeMode === "multiplayer" && multiplayerState) {
    renderer.draw(multiplayerState, { now, localPlayerId: multiplayerState.localPlayerId });
  } else {
    renderer.draw(null, { now });
  }

  window.requestAnimationFrame(frame);
}

setActiveMode("menu");
setPlayingState(false);
renderLeaderboard([]);
updateHud(null, { modeLabel: "Menu", roomCode: "-" });
setOverlay(true, "Snake Dare Arena", "Classic snake with dares, power-ups, and room warfare.");
fetchLeaderboard();
window.requestAnimationFrame(frame);
