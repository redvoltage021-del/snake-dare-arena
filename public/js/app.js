import { KEY_TO_DIRECTION, SNAKE_COLOR_OPTIONS } from "/shared/config.js";
import { formatTimeLeft } from "/shared/utils.js";
import { MultiplayerClient } from "./network.js";
import { GameRenderer } from "./renderer.js";
import { SoloGame } from "./soloGame.js";

const TOKEN_STORAGE_KEY = "snake-dare-arena-token";

const elements = {
  accountKicker: document.getElementById("accountKicker"),
  accountTitle: document.getElementById("accountTitle"),
  authPanel: document.getElementById("authPanel"),
  profilePanel: document.getElementById("profilePanel"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  registerFields: document.getElementById("registerFields"),
  registerDisplayName: document.getElementById("registerDisplayName"),
  authColorPicker: document.getElementById("authColorPicker"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  authStatus: document.getElementById("authStatus"),
  profileColorBadge: document.getElementById("profileColorBadge"),
  profileDisplayName: document.getElementById("profileDisplayName"),
  profileUsername: document.getElementById("profileUsername"),
  soloBestStat: document.getElementById("soloBestStat"),
  totalRunsStat: document.getElementById("totalRunsStat"),
  totalScoreStat: document.getElementById("totalScoreStat"),
  multiplayerWinsStat: document.getElementById("multiplayerWinsStat"),
  profileDisplayNameInput: document.getElementById("profileDisplayNameInput"),
  profileColorPicker: document.getElementById("profileColorPicker"),
  saveProfileBtn: document.getElementById("saveProfileBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  profileStatus: document.getElementById("profileStatus"),
  playStatusLabel: document.getElementById("playStatusLabel"),
  soloBtn: document.getElementById("soloBtn"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  roomStatus: document.getElementById("roomStatus"),
  refreshLeaderboardBtn: document.getElementById("refreshLeaderboardBtn"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  restartBtn: document.getElementById("restartBtn"),
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

const authState = {
  token: localStorage.getItem(TOKEN_STORAGE_KEY) || "",
  user: null,
  mode: "login",
  registerColor: SNAKE_COLOR_OPTIONS[0],
  profileColor: SNAKE_COLOR_OPTIONS[0]
};

let activeMode = "menu";
let soloGame = null;
let multiplayerState = null;
let network = null;
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

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
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

function setOverlay(visible, title, message) {
  document.body.dataset.overlay = visible ? "visible" : "hidden";
  elements.overlay.classList.toggle("hidden", !visible);
  elements.overlayTitle.textContent = title;
  elements.overlayMessage.textContent = message;
}

function resetNetwork() {
  if (!network) {
    return;
  }

  network.disconnect();
  network = null;
}

async function apiRequest(path, { method = "GET", body = undefined, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth && authState.token) {
    headers.Authorization = `Bearer ${authState.token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function renderColorPicker(container, selectedColor, onSelect) {
  container.innerHTML = SNAKE_COLOR_OPTIONS
    .map(
      (color) => `
        <button
          type="button"
          class="color-chip ${selectedColor === color ? "is-selected" : ""}"
          data-color="${color}"
          style="--chip-color: ${color}"
        ></button>
      `
    )
    .join("");

  container.querySelectorAll(".color-chip").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.color));
  });
}

function syncPlayAvailability() {
  const enabled = Boolean(authState.user);
  elements.soloBtn.disabled = !enabled;
  elements.createRoomBtn.disabled = !enabled;
  elements.joinRoomBtn.disabled = !enabled;
  elements.roomCodeInput.disabled = !enabled;
  elements.playStatusLabel.textContent = enabled ? "Ready" : "Locked";

  if (!enabled && activeMode === "menu") {
    setStatus(elements.roomStatus, "Sign in to unlock solo and multiplayer.");
  }
}

function renderAccountState() {
  const loggedIn = Boolean(authState.user);

  elements.authPanel.hidden = loggedIn;
  elements.profilePanel.hidden = !loggedIn;
  elements.accountKicker.textContent = loggedIn ? "Stored Progress" : "Pilot Account";
  elements.accountTitle.textContent = loggedIn ? authState.user.displayName : authState.mode === "login" ? "Sign In" : "Create Account";

  elements.showLoginBtn.classList.toggle("is-active", authState.mode === "login");
  elements.showRegisterBtn.classList.toggle("is-active", authState.mode === "register");
  elements.registerFields.hidden = authState.mode !== "register";
  elements.loginBtn.hidden = authState.mode !== "login";
  elements.registerBtn.hidden = authState.mode !== "register";

  renderColorPicker(elements.authColorPicker, authState.registerColor, (color) => {
    authState.registerColor = color;
    renderAccountState();
  });

  if (loggedIn) {
    elements.profileDisplayName.textContent = authState.user.displayName;
    elements.profileUsername.textContent = `@${authState.user.username}`;
    elements.profileColorBadge.style.background = authState.user.snakeColor;
    elements.profileDisplayNameInput.value = authState.user.displayName;
    authState.profileColor = authState.user.snakeColor;
    renderColorPicker(elements.profileColorPicker, authState.profileColor, (color) => {
      authState.profileColor = color;
      renderColorPicker(elements.profileColorPicker, authState.profileColor, (nextColor) => {
        authState.profileColor = nextColor;
        renderAccountState();
      });
      elements.profileColorBadge.style.background = color;
    });

    elements.soloBestStat.textContent = String(authState.user.stats.soloBest ?? 0);
    elements.totalRunsStat.textContent = String(authState.user.stats.totalRuns ?? 0);
    elements.totalScoreStat.textContent = String(authState.user.stats.totalScore ?? 0);
    elements.multiplayerWinsStat.textContent = String(authState.user.stats.multiplayerWins ?? 0);
  }

  syncPlayAvailability();
}

function setAuthMode(mode) {
  authState.mode = mode;
  renderAccountState();
}

function renderEffects(effects = []) {
  if (!effects.length) {
    elements.effectsList.innerHTML = '<span class="empty-pill">No live effects</span>';
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
    elements.statusFeed.innerHTML = "<p>Pick a mode to start moving.</p>";
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
  const nextTarget = localState?.dare?.target ?? (authState.user ? "Choose a mode and launch." : "Sign in to start playing.");
  const nextDare = localState?.dare
    ? `${localState.dare.description}${localState.dare.progress ? ` | ${localState.dare.progress}` : ""}`
    : authState.user
      ? "Your current challenge will appear here."
      : "Create an account or sign in to save progress.";
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
      "<li><div class=\"leaderboard-meta\"><strong>No saved solo scores yet</strong><span>Sign in and finish a solo run to seed the board.</span></div></li>";
    return;
  }

  elements.leaderboardList.innerHTML = entries
    .map(
      (entry, index) => `
        <li class="${index === 0 ? "top-entry" : ""}">
          <span class="leaderboard-rank">${entry.rank}</span>
          <span class="leaderboard-color" style="--entry-color: ${entry.snakeColor}"></span>
          <div class="leaderboard-meta">
            <strong>${entry.name}</strong>
            <span>@${entry.username} - ${entry.runs} ${entry.runs === 1 ? "run" : "runs"}</span>
          </div>
          <strong>${entry.score}</strong>
        </li>
      `
    )
    .join("");
}

async function fetchLeaderboard() {
  try {
    const payload = await apiRequest("/api/leaderboard?board=solo", { auth: false });
    renderLeaderboard(payload.entries ?? []);
  } catch {
    setStatus(elements.roomStatus, "Unable to refresh leaderboard right now.", true);
  }
}

function applyAuthSuccess({ token, user }, message) {
  authState.token = token;
  authState.user = user;
  authState.profileColor = user.snakeColor;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  resetNetwork();
  renderAccountState();
  setStatus(elements.authStatus, message);
  setStatus(elements.profileStatus, "Profile synced.");
  setStatus(elements.roomStatus, "Choose solo or create a room.");
  updateHud(null, { modeLabel: "Ready", roomCode: "-" });
}

async function loadSession() {
  if (!authState.token) {
    renderAccountState();
    updateHud(null, { modeLabel: "Menu", roomCode: "-" });
    return;
  }

  try {
    const payload = await apiRequest("/api/session");
    authState.user = payload.user;
    authState.profileColor = payload.user.snakeColor;
    renderAccountState();
    setStatus(elements.roomStatus, "Choose solo or create a room.");
    updateHud(null, { modeLabel: "Ready", roomCode: "-" });
  } catch {
    authState.token = "";
    authState.user = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    renderAccountState();
    updateHud(null, { modeLabel: "Menu", roomCode: "-" });
  }
}

async function registerAccount() {
  try {
    const payload = await apiRequest("/api/auth/register", {
      method: "POST",
      auth: false,
      body: {
        username: elements.authUsername.value,
        password: elements.authPassword.value,
        displayName: elements.registerDisplayName.value || elements.authUsername.value,
        snakeColor: authState.registerColor
      }
    });
    applyAuthSuccess(payload, "Account created. Your progress will now be saved.");
    await fetchLeaderboard();
  } catch (error) {
    setStatus(elements.authStatus, error.message, true);
  }
}

async function loginAccount() {
  try {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      auth: false,
      body: {
        username: elements.authUsername.value,
        password: elements.authPassword.value
      }
    });
    applyAuthSuccess(payload, "Signed in. Welcome back.");
    await fetchLeaderboard();
  } catch (error) {
    setStatus(elements.authStatus, error.message, true);
  }
}

async function logoutAccount() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout transport issues and still clear local state.
  }

  authState.token = "";
  authState.user = null;
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  resetNetwork();
  returnToMenu("Sign in, choose your snake color, then launch a run.");
  renderAccountState();
  setStatus(elements.authStatus, "Signed out.");
  setStatus(elements.roomStatus, "Sign in to unlock solo and multiplayer.");
}

async function saveProfile() {
  if (!authState.user) {
    return;
  }

  try {
    const payload = await apiRequest("/api/profile", {
      method: "PATCH",
      body: {
        displayName: elements.profileDisplayNameInput.value,
        snakeColor: authState.profileColor
      }
    });
    authState.user = payload.user;
    renderAccountState();
    setStatus(elements.profileStatus, "Profile updated.");
    renderLeaderboard(payload.leaderboard ?? []);
  } catch (error) {
    setStatus(elements.profileStatus, error.message, true);
  }
}

async function submitSoloScore(score) {
  if (!authState.user || !score) {
    return;
  }

  try {
    const payload = await apiRequest("/api/progress/solo", {
      method: "POST",
      body: { score }
    });
    authState.user = payload.user;
    renderAccountState();
    renderLeaderboard(payload.entries ?? []);
  } catch (error) {
    setStatus(elements.roomStatus, error.message || "Score could not be saved.", true);
  }
}

function attachSoloListeners(game) {
  game.on("burst", ({ cell, color, label }) => {
    renderer.triggerBurst(cell, color, label);
  });

  game.on("impact", ({ intensity, color, duration }) => {
    renderer.triggerImpact({ intensity, color, duration });
  });

  game.on("gameOver", async ({ score, reason }) => {
    setOverlay(true, "Run Over", `${reason} Final score: ${score}.`);
    await submitSoloScore(score);
  });
}

function requireAccount(message) {
  if (authState.user) {
    return true;
  }

  setStatus(elements.authStatus, message, true);
  setStatus(elements.roomStatus, "Sign in first to start playing.", true);
  return false;
}

function ensureNetwork() {
  if (!requireAccount("Create an account or sign in first.")) {
    return null;
  }

  if (network) {
    return network;
  }

  if (typeof window.io !== "function") {
    setStatus(elements.roomStatus, "Realtime service is unavailable right now.", true);
    return null;
  }

  try {
    network = new MultiplayerClient({
      getToken: () => authState.token
    });
    bindNetworkEvents(network);
    return network;
  } catch {
    setStatus(elements.roomStatus, "Realtime service failed to start.", true);
    return null;
  }
}

function startSoloGame() {
  if (!requireAccount("Sign in to start a solo run.")) {
    return;
  }

  if (network?.roomCode) {
    suppressNextRoomLeft = true;
    network.leaveRoom();
  }

  soloGame = new SoloGame({
    playerName: authState.user.displayName,
    snakeColor: authState.user.snakeColor
  });
  attachSoloListeners(soloGame);
  multiplayerState = null;
  setActiveMode("solo");
  setPlayingState(true);
  lastMultiplayerScore = 0;
  elements.restartBtn.hidden = false;
  elements.leaveRoomBtn.hidden = true;
  setStatus(elements.roomStatus, "Launch sequence armed. Queue your first move.");
  setOverlay(false, "", "");
  triggerArenaZoom();
  renderer.triggerImpact({ intensity: 0.2, color: authState.user.snakeColor, duration: 220 });
}

function startCreateRoom() {
  const client = ensureNetwork();
  if (!client) {
    return;
  }

  client.createRoom();
  setStatus(elements.roomStatus, "Creating room...");
}

function startJoinRoom() {
  const code = elements.roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    setStatus(elements.roomStatus, "Enter a room code first.", true);
    return;
  }

  const client = ensureNetwork();
  if (!client) {
    return;
  }

  client.joinRoom(code);
  setStatus(elements.roomStatus, `Joining room ${code}...`);
}

function returnToMenu(message) {
  setActiveMode("menu");
  setPlayingState(false);
  soloGame = null;
  multiplayerState = null;
  elements.restartBtn.hidden = true;
  elements.leaveRoomBtn.hidden = true;
  updateHud(null, { modeLabel: authState.user ? "Ready" : "Menu", roomCode: "-" });
  setOverlay(true, "Snake Dare Arena", message);
}

function bindNetworkEvents(client) {
  client.on("roomCreated", ({ roomCode }) => {
    setActiveMode("multiplayer");
    setPlayingState(true);
    elements.restartBtn.hidden = true;
    elements.leaveRoomBtn.hidden = false;
    soloGame = null;
    lastMultiplayerScore = 0;
    elements.roomCodeInput.value = roomCode;
    setStatus(elements.roomStatus, `Room ${roomCode} created. Share the code.`);
    setOverlay(false, "", "");
    triggerArenaZoom();
  });

  client.on("roomJoined", ({ roomCode }) => {
    setActiveMode("multiplayer");
    setPlayingState(true);
    elements.restartBtn.hidden = true;
    elements.leaveRoomBtn.hidden = false;
    soloGame = null;
    lastMultiplayerScore = 0;
    elements.roomCodeInput.value = roomCode;
    setStatus(elements.roomStatus, `Joined room ${roomCode}.`);
    setOverlay(false, "", "");
    triggerArenaZoom();
  });

  client.on("roomLeft", () => {
    if (suppressNextRoomLeft) {
      suppressNextRoomLeft = false;
      return;
    }

    returnToMenu(authState.user ? "Choose solo or join another room." : "Sign in to play.");
    setStatus(elements.roomStatus, authState.user ? "Choose solo or create a room." : "Sign in to unlock solo and multiplayer.");
  });

  client.on("roomError", ({ message }) => {
    setStatus(elements.roomStatus, message || "Room action failed.", true);
  });

  client.on("roomState", (state) => {
    if (suppressNextRoomLeft) {
      return;
    }

    multiplayerState = state;
    setActiveMode("multiplayer");
    setPlayingState(true);
    updateHud(state.local, { modeLabel: "Room", roomCode: state.roomCode });

    const localPlayer = state.players.find((player) => player.id === state.localPlayerId);
    if (state.local.score > lastMultiplayerScore && localPlayer?.segments?.[0]) {
      renderer.triggerBurst(localPlayer.segments[0], localPlayer.color, `+${state.local.score - lastMultiplayerScore}`);
      renderer.triggerImpact({ intensity: 0.14, color: localPlayer.color, duration: 140 });
    }
    lastMultiplayerScore = state.local.score;

    if (!state.local.alive) {
      setOverlay(true, "Eliminated", `${state.local.statusText} Score: ${state.local.score}.`);
      renderer.triggerImpact({ intensity: 0.64, color: "#ff5f76", duration: 320 });
    } else if (state.winnerId === state.localPlayerId && state.players.length > 1 && state.aliveCount === 1) {
      setOverlay(true, "Arena Won", `You cleared room ${state.roomCode} with ${state.local.score} points.`);
      renderer.triggerImpact({ intensity: 0.38, color: "#94f056", duration: 260 });
    } else {
      setOverlay(false, "", "");
    }
  });

  client.on("leaderboardUpdated", ({ board, entries }) => {
    if (board === "solo") {
      renderLeaderboard(entries);
    }
  });

  client.on("disconnect", () => {
    if (activeMode === "multiplayer") {
      setOverlay(true, "Disconnected", "Connection lost. Reconnect by refreshing the page.");
      setStatus(elements.roomStatus, "Connection lost.", true);
    }
  });
}

elements.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
elements.showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
elements.loginBtn.addEventListener("click", loginAccount);
elements.registerBtn.addEventListener("click", registerAccount);
elements.logoutBtn.addEventListener("click", logoutAccount);
elements.saveProfileBtn.addEventListener("click", saveProfile);
elements.soloBtn.addEventListener("click", startSoloGame);
elements.restartBtn.addEventListener("click", startSoloGame);
elements.createRoomBtn.addEventListener("click", startCreateRoom);
elements.joinRoomBtn.addEventListener("click", startJoinRoom);
elements.refreshLeaderboardBtn.addEventListener("click", fetchLeaderboard);
elements.leaveRoomBtn.addEventListener("click", () => {
  suppressNextRoomLeft = false;
  network?.leaveRoom();
});

elements.roomCodeInput.addEventListener("input", () => {
  elements.roomCodeInput.value = elements.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

[elements.authUsername, elements.authPassword, elements.registerDisplayName].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (authState.mode === "login") {
      loginAccount();
    } else {
      registerAccount();
    }
  });
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
      network?.sendDirection(direction);
    }
    return;
  }

  if (event.key === " " && activeMode === "solo" && soloGame && !soloGame.alive) {
    event.preventDefault();
    startSoloGame();
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
renderAccountState();
renderLeaderboard([]);
updateHud(null, { modeLabel: "Menu", roomCode: "-" });
setOverlay(true, "Snake Dare Arena", "Sign in, choose your snake color, then launch a run.");
loadSession();
fetchLeaderboard();
window.requestAnimationFrame(frame);
