import { KEY_TO_DIRECTION, SNAKE_COLOR_OPTIONS } from "/shared/config.js";
import { formatTimeLeft } from "/shared/utils.js";
import { DeviceStorage } from "./deviceStorage.js";
import { MultiplayerClient } from "./network.js";
import { GameRenderer } from "./renderer.js";
import { SoloGame } from "./soloGame.js";

const elements = {
  appShell: document.querySelector(".app-shell"),
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
  savedProfilesBlock: document.getElementById("savedProfilesBlock"),
  savedProfilesList: document.getElementById("savedProfilesList"),
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
  leaderboardCard: document.querySelector(".leaderboard-card"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayMessage: document.getElementById("overlayMessage"),
  canvas: document.getElementById("gameCanvas"),
  canvasFrame: document.querySelector(".canvas-frame"),
  arenaPanel: document.querySelector(".arena-panel")
};

const renderer = new GameRenderer(elements.canvas);
const deviceStorage = new DeviceStorage();

const authState = {
  user: null,
  mode: "login",
  registerColor: SNAKE_COLOR_OPTIONS[0],
  profileColor: SNAKE_COLOR_OPTIONS[0]
};

let activeMode = "menu";
let soloGame = null;
let multiplayerState = null;
let multiplayerRun = null;
let network = null;
let lastFrameAt = performance.now();
let lastMultiplayerScore = 0;
let suppressNextRoomLeft = false;
let playFocusToken = 0;
let postGameRevealToken = 0;

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

function focusCanvasWithoutScroll() {
  elements.canvas?.focus({ preventScroll: true });
}

function getCenteredScrollTop(element, padding = 18) {
  if (!element) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.height;
  const centeredOffset = Math.max(padding, Math.round((viewportHeight - rect.height) / 2));
  return Math.max(0, Math.round(window.scrollY + rect.top - centeredOffset));
}

function centerArenaView({ smooth = true } = {}) {
  if (!elements.canvasFrame) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: getCenteredScrollTop(elements.canvasFrame),
      behavior: smooth ? "smooth" : "auto"
    });

    window.setTimeout(() => {
      focusCanvasWithoutScroll();
    }, smooth ? 260 : 60);
  });
}

function revealPostGameResults() {
  const token = ++postGameRevealToken;
  const prefersStackedLayout = window.matchMedia("(max-width: 1220px)").matches;
  const target = prefersStackedLayout
    ? (elements.leaderboardCard ?? elements.appShell)
    : (elements.appShell ?? elements.leaderboardCard);

  if (!target) {
    return;
  }

  window.setTimeout(() => {
    if (token !== postGameRevealToken || document.body.dataset.playing === "true") {
      return;
    }

    if (prefersStackedLayout && elements.leaderboardCard) {
      elements.leaderboardCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    } else if (elements.appShell) {
      window.scrollTo({
        top: Math.max(0, Math.round(window.scrollY + elements.appShell.getBoundingClientRect().top)),
        behavior: "smooth"
      });
    }

    window.setTimeout(() => {
      if (elements.leaderboardCard) {
        pulseElement(elements.leaderboardCard);
      }
      elements.refreshLeaderboardBtn?.focus({ preventScroll: true });
    }, 220);
  }, 90);
}

function scheduleArenaCentering() {
  const token = ++playFocusToken;
  postGameRevealToken += 1;

  [
    { delay: 0, smooth: false },
    { delay: 120, smooth: true },
    { delay: 320, smooth: true },
    { delay: 680, smooth: true }
  ].forEach(({ delay, smooth }) => {
    window.setTimeout(() => {
      if (token !== playFocusToken || document.body.dataset.playing !== "true") {
        return;
      }

      centerArenaView({ smooth });
    }, delay);
  });
}

function enterPlayingView() {
  const wasPlaying = document.body.dataset.playing === "true";
  setPlayingState(true);
  if (wasPlaying) {
    return;
  }

  scheduleArenaCentering();
}

function leavePlayingView({ revealLeaderboard = false } = {}) {
  playFocusToken += 1;

  if (document.body.dataset.playing !== "true") {
    if (revealLeaderboard) {
      revealPostGameResults();
    }
    return;
  }

  setPlayingState(false);

  if (revealLeaderboard) {
    revealPostGameResults();
  }
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

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body ?? {})
  });

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

function renderSavedProfiles() {
  const profiles = deviceStorage.getSavedProfiles();
  elements.savedProfilesBlock.hidden = profiles.length === 0;

  if (!profiles.length) {
    elements.savedProfilesList.innerHTML = "";
    return;
  }

  elements.savedProfilesList.innerHTML = profiles
    .map(
      (profile) => `
        <button type="button" class="saved-profile" data-username="${profile.username}">
          <span class="saved-profile-accent">
            <span class="saved-profile-dot" style="--profile-color: ${profile.snakeColor}"></span>
            <span class="saved-profile-copy">
              <strong>${profile.displayName}</strong>
              <span>@${profile.username} · Best ${profile.soloBest}</span>
            </span>
          </span>
          <span class="saved-profile-hint">Use</span>
        </button>
      `
    )
    .join("");

  elements.savedProfilesList.querySelectorAll(".saved-profile").forEach((button) => {
    button.addEventListener("click", () => {
      elements.authUsername.value = button.dataset.username || "";
      authState.mode = "login";
      renderAccountState();
      setStatus(elements.authStatus, "Saved profile loaded. Enter the password to sign in.");
      elements.authPassword.focus();
    });
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
    setStatus(elements.roomStatus, "Sign in on this device to unlock solo and multiplayer.");
  }
}

function renderAccountState() {
  const loggedIn = Boolean(authState.user);

  elements.authPanel.hidden = loggedIn;
  elements.profilePanel.hidden = !loggedIn;
  elements.accountKicker.textContent = loggedIn ? "This Device" : "Pilot Profiles";
  elements.accountTitle.textContent = loggedIn
    ? authState.user.displayName
    : authState.mode === "login"
      ? "Sign In"
      : "Create Profile";

  elements.showLoginBtn.classList.toggle("is-active", authState.mode === "login");
  elements.showRegisterBtn.classList.toggle("is-active", authState.mode === "register");
  elements.registerFields.hidden = authState.mode !== "register";
  elements.loginBtn.hidden = authState.mode !== "login";
  elements.registerBtn.hidden = authState.mode !== "register";
  renderSavedProfiles();

  renderColorPicker(elements.authColorPicker, authState.registerColor, (color) => {
    authState.registerColor = color;
    renderAccountState();
  });

  if (loggedIn) {
    elements.profileDisplayName.textContent = authState.user.displayName;
    elements.profileUsername.textContent = `@${authState.user.username}`;
    elements.profileColorBadge.style.background = authState.profileColor;
    elements.profileDisplayNameInput.value = authState.user.displayName;

    const bindProfileColorPicker = () => {
      renderColorPicker(elements.profileColorPicker, authState.profileColor, (color) => {
        authState.profileColor = color;
        elements.profileColorBadge.style.background = color;
        bindProfileColorPicker();
      });
    };
    bindProfileColorPicker();

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
  const nextTarget = localState?.dare?.target ?? (authState.user
    ? "Choose a mode and launch from this device."
    : "Sign in on this device to start playing.");
  const nextDare = localState?.dare
    ? `${localState.dare.description}${localState.dare.progress ? ` | ${localState.dare.progress}` : ""}`
    : authState.user
      ? "Your current challenge will appear here."
      : "Create or sign into a local profile to save progress.";
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
      "<li><div class=\"leaderboard-meta\"><strong>No saved solo scores yet</strong><span>Finish a solo run on this device to seed the board.</span></div></li>";
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

function fetchLeaderboard() {
  try {
    renderLeaderboard(deviceStorage.getLeaderboard({ board: "solo" }));
  } catch {
    setStatus(elements.roomStatus, "Unable to read the saved device leaderboard.", true);
  }
}

function applyAuthSuccess({ user }, message) {
  authState.user = user;
  authState.profileColor = user.snakeColor;
  resetNetwork();
  renderAccountState();
  setStatus(elements.authStatus, message);
  setStatus(elements.profileStatus, "Profile stored on this device.");
  setStatus(elements.roomStatus, "Choose solo or create a room.");
  updateHud(null, { modeLabel: "Ready", roomCode: "-" });
  fetchLeaderboard();
}

function loadSession() {
  authState.user = deviceStorage.getSessionUser();
  authState.profileColor = authState.user?.snakeColor ?? SNAKE_COLOR_OPTIONS[0];
  renderAccountState();
  updateHud(null, { modeLabel: authState.user ? "Ready" : "Menu", roomCode: "-" });
  if (authState.user) {
    setStatus(elements.roomStatus, "Choose solo or create a room.");
  }
}

async function registerAccount() {
  try {
    const payload = await deviceStorage.registerUser({
      username: elements.authUsername.value,
      password: elements.authPassword.value,
      displayName: elements.registerDisplayName.value || elements.authUsername.value,
      snakeColor: authState.registerColor
    });
    applyAuthSuccess(payload, "Profile created. Progress is now saved on this device.");
    elements.authPassword.value = "";
  } catch (error) {
    setStatus(elements.authStatus, error.message, true);
  }
}

async function loginAccount() {
  try {
    const payload = await deviceStorage.loginUser({
      username: elements.authUsername.value,
      password: elements.authPassword.value
    });
    applyAuthSuccess(payload, "Signed in. Loaded your saved device profile.");
    elements.authPassword.value = "";
  } catch (error) {
    const shouldTryLegacyImport = /account not found|no saved profile/i.test(error.message);

    if (shouldTryLegacyImport) {
      try {
        const legacyPayload = await postJson("/api/legacy-auth/login", {
          username: elements.authUsername.value,
          password: elements.authPassword.value
        });
        const imported = await deviceStorage.importLegacyUser({
          user: legacyPayload.user,
          username: elements.authUsername.value,
          password: elements.authPassword.value
        });
        applyAuthSuccess(imported, "Imported your older profile onto this device and signed you in.");
        elements.authPassword.value = "";
        return;
      } catch (legacyError) {
        if (!/legacy|request failed|not found|available/i.test(legacyError.message)) {
          setStatus(elements.authStatus, legacyError.message, true);
          return;
        }
      }
    }

    setStatus(elements.authStatus, error.message, true);
  }
}

function logoutAccount() {
  deviceStorage.logout();
  authState.user = null;
  authState.profileColor = SNAKE_COLOR_OPTIONS[0];
  resetNetwork();
  returnToMenu("Sign in on this device, choose your snake color, then launch a run.");
  renderAccountState();
  setStatus(elements.authStatus, "Signed out. Saved profiles remain on this device.");
  setStatus(elements.roomStatus, "Sign in on this device to unlock solo and multiplayer.");
  fetchLeaderboard();
}

function saveProfile() {
  if (!authState.user) {
    return;
  }

  try {
    const payload = deviceStorage.updateProfile(authState.user.id, {
      displayName: elements.profileDisplayNameInput.value,
      snakeColor: authState.profileColor
    });
    authState.user = payload.user;
    authState.profileColor = payload.user.snakeColor;
    renderAccountState();
    setStatus(elements.profileStatus, "Profile updated on this device.");
    renderLeaderboard(payload.leaderboard ?? []);
  } catch (error) {
    setStatus(elements.profileStatus, error.message, true);
  }
}

function submitSoloScore(score) {
  if (!authState.user) {
    return;
  }

  try {
    const payload = deviceStorage.recordGameResult({
      userId: authState.user.id,
      board: "solo",
      score
    });
    authState.user = payload.user;
    authState.profileColor = payload.user.snakeColor;
    renderAccountState();
    renderLeaderboard(payload.entries ?? []);
    setStatus(elements.profileStatus, "Solo run saved on this device.");
  } catch (error) {
    setStatus(elements.roomStatus, error.message || "Score could not be saved.", true);
  }
}

function startTrackedMultiplayerRun(roomCode) {
  multiplayerRun = {
    roomCode,
    finalized: false,
    seenState: false,
    lastScore: 0
  };
}

function finalizeTrackedMultiplayerRun({ score, won, message }) {
  if (!authState.user || !multiplayerRun || multiplayerRun.finalized) {
    return;
  }

  multiplayerRun.finalized = true;

  try {
    const payload = deviceStorage.recordGameResult({
      userId: authState.user.id,
      board: "multiplayer",
      score,
      won
    });
    authState.user = payload.user;
    authState.profileColor = payload.user.snakeColor;
    renderAccountState();
    if (message) {
      setStatus(elements.profileStatus, message);
    }
  } catch (error) {
    setStatus(elements.profileStatus, error.message || "Room result could not be saved.", true);
  }
}

function clearTrackedMultiplayerRun() {
  multiplayerRun = null;
}

function attachSoloListeners(game) {
  game.on("burst", ({ cell, color, label }) => {
    renderer.triggerBurst(cell, color, label);
  });

  game.on("impact", ({ intensity, color, duration }) => {
    renderer.triggerImpact({ intensity, color, duration });
  });

  game.on("gameOver", ({ score, reason }) => {
    submitSoloScore(score);
    leavePlayingView({ revealLeaderboard: true });
    setOverlay(true, "Run Over", `${reason} Final score: ${score}.`);
  });
}

function requireAccount(message) {
  if (authState.user) {
    return true;
  }

  setStatus(elements.authStatus, message, true);
  setStatus(elements.roomStatus, "Sign in on this device first to start playing.", true);
  return false;
}

function buildPlayerProfile() {
  if (!authState.user) {
    return null;
  }

  return {
    userId: authState.user.id,
    displayName: authState.user.displayName,
    snakeColor: authState.user.snakeColor
  };
}

function ensureNetwork() {
  if (!requireAccount("Create a profile or sign in on this device first.")) {
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
    network = new MultiplayerClient();
    bindNetworkEvents(network);
    return network;
  } catch {
    setStatus(elements.roomStatus, "Realtime service failed to start.", true);
    return null;
  }
}

function startSoloGame() {
  if (!requireAccount("Sign in on this device to start a solo run.")) {
    return;
  }

  if (network?.roomCode) {
    suppressNextRoomLeft = true;
    network.leaveRoom();
  }

  clearTrackedMultiplayerRun();
  soloGame = new SoloGame({
    playerName: authState.user.displayName,
    snakeColor: authState.user.snakeColor
  });
  attachSoloListeners(soloGame);
  multiplayerState = null;
  setActiveMode("solo");
  enterPlayingView();
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

  client.createRoom(buildPlayerProfile());
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

  client.joinRoom(code, buildPlayerProfile());
  setStatus(elements.roomStatus, `Joining room ${code}...`);
}

function returnToMenu(message) {
  setActiveMode("menu");
  leavePlayingView();
  soloGame = null;
  multiplayerState = null;
  clearTrackedMultiplayerRun();
  elements.restartBtn.hidden = true;
  elements.leaveRoomBtn.hidden = true;
  updateHud(null, { modeLabel: authState.user ? "Ready" : "Menu", roomCode: "-" });
  setOverlay(true, "Snake Dare Arena", message);
}

function bindNetworkEvents(client) {
  client.on("roomCreated", ({ roomCode }) => {
    setActiveMode("multiplayer");
    enterPlayingView();
    elements.restartBtn.hidden = true;
    elements.leaveRoomBtn.hidden = false;
    soloGame = null;
    lastMultiplayerScore = 0;
    elements.roomCodeInput.value = roomCode;
    startTrackedMultiplayerRun(roomCode);
    setStatus(elements.roomStatus, `Room ${roomCode} created. Share the code.`);
    setOverlay(false, "", "");
    triggerArenaZoom();
  });

  client.on("roomJoined", ({ roomCode }) => {
    setActiveMode("multiplayer");
    enterPlayingView();
    elements.restartBtn.hidden = true;
    elements.leaveRoomBtn.hidden = false;
    soloGame = null;
    lastMultiplayerScore = 0;
    elements.roomCodeInput.value = roomCode;
    startTrackedMultiplayerRun(roomCode);
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
    setStatus(elements.roomStatus, authState.user ? "Choose solo or create a room." : "Sign in on this device to unlock solo and multiplayer.");
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
    enterPlayingView();
    updateHud(state.local, { modeLabel: "Room", roomCode: state.roomCode });

    if (multiplayerRun) {
      multiplayerRun.seenState = true;
      multiplayerRun.lastScore = state.local.score;
    }

    const localPlayer = state.players.find((player) => player.id === state.localPlayerId);
    if (state.local.score > lastMultiplayerScore && localPlayer?.segments?.[0]) {
      renderer.triggerBurst(localPlayer.segments[0], localPlayer.color, `+${state.local.score - lastMultiplayerScore}`);
      renderer.triggerImpact({ intensity: 0.14, color: localPlayer.color, duration: 140 });
    }
    lastMultiplayerScore = state.local.score;

    if (!state.local.alive) {
      setOverlay(true, "Eliminated", `${state.local.statusText} Score: ${state.local.score}.`);
      renderer.triggerImpact({ intensity: 0.64, color: "#ff5f76", duration: 320 });
      finalizeTrackedMultiplayerRun({
        score: state.local.score,
        won: false,
        message: "Room result saved on this device."
      });
    } else if (state.winnerId === state.localPlayerId && state.players.length > 1 && state.aliveCount === 1) {
      setOverlay(true, "Arena Won", `You cleared room ${state.roomCode} with ${state.local.score} points.`);
      renderer.triggerImpact({ intensity: 0.38, color: "#94f056", duration: 260 });
      finalizeTrackedMultiplayerRun({
        score: state.local.score,
        won: true,
        message: "Room win saved on this device."
      });
    } else {
      setOverlay(false, "", "");
    }
  });

  client.on("disconnect", () => {
    if (activeMode === "multiplayer") {
      setOverlay(true, "Disconnected", "Connection lost. Reconnect by refreshing the page.");
      setStatus(elements.roomStatus, "Connection lost.", true);
    }
  });
}

function renderCurrentFrame(now, advanceSoloBy = 0) {
  if (activeMode === "solo" && soloGame) {
    if (advanceSoloBy > 0) {
      soloGame.update(advanceSoloBy);
    }

    const snapshot = soloGame.getSnapshot();
    updateHud(snapshot.local, { modeLabel: "Solo", roomCode: "-" });
    if (snapshot.local.alive) {
      setOverlay(false, "", "");
    }
    renderer.draw(snapshot, { now, localPlayerId: "solo" });
    return snapshot;
  }

  if (activeMode === "multiplayer" && multiplayerState) {
    renderer.draw(multiplayerState, { now, localPlayerId: multiplayerState.localPlayerId });
    return multiplayerState;
  }

  renderer.draw(null, { now });
  return null;
}

function describeCurrentState() {
  const payload = {
    coordinateSystem: "origin top-left, x increases right, y increases down",
    mode: activeMode,
    overlayVisible: !elements.overlay.classList.contains("hidden"),
    overlayTitle: elements.overlayTitle.textContent,
    overlayMessage: elements.overlayMessage.textContent,
    hud: {
      mode: elements.modeValue.textContent,
      score: Number(elements.scoreValue.textContent || 0),
      roomCode: elements.roomCodeValue.textContent,
      target: elements.targetValue.textContent,
      dare: elements.dareValue.textContent
    }
  };

  if (activeMode === "solo" && soloGame) {
    const snapshot = soloGame.getSnapshot();
    payload.localPlayer = snapshot.players[0];
    payload.food = snapshot.food;
    payload.powerUp = snapshot.powerUp;
    payload.local = snapshot.local;
  } else if (activeMode === "multiplayer" && multiplayerState) {
    payload.food = multiplayerState.food;
    payload.powerUp = multiplayerState.powerUp;
    payload.local = multiplayerState.local;
    payload.players = multiplayerState.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      score: player.score,
      head: player.segments[0] ?? null,
      length: player.segments.length,
      color: player.color
    }));
  }

  return JSON.stringify(payload);
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
    const canControlSolo = activeMode === "solo" && Boolean(soloGame?.alive);
    const canControlRoom = activeMode === "multiplayer" && Boolean(multiplayerState?.local?.alive);

    if (!canControlSolo && !canControlRoom) {
      return;
    }

    event.preventDefault();
    if (canControlSolo) {
      soloGame.queueDirection(direction);
    } else if (canControlRoom) {
      network?.sendDirection(direction);
    }
    return;
  }

  if (event.key === " " && activeMode === "solo" && soloGame && !soloGame.alive) {
    event.preventDefault();
    startSoloGame();
  }
});

window.render_game_to_text = describeCurrentState;
window.advanceTime = (milliseconds = 16) => {
  const step = Math.max(0, Number(milliseconds) || 0);
  lastFrameAt += step;
  renderCurrentFrame(performance.now(), step);
};

function frame(now) {
  const delta = now - lastFrameAt;
  lastFrameAt = now;
  renderCurrentFrame(now, delta);
  window.requestAnimationFrame(frame);
}

setActiveMode("menu");
setPlayingState(false);
renderAccountState();
renderLeaderboard([]);
updateHud(null, { modeLabel: "Menu", roomCode: "-" });
setOverlay(true, "Snake Dare Arena", "Sign in on this device, choose your snake color, then launch a run.");
loadSession();
fetchLeaderboard();
window.requestAnimationFrame(frame);
