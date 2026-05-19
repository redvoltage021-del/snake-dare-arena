import {
  applyAction,
  cloneState,
  createInitialState,
  getLegalActions
} from "../../public/js/baghChalEngine.js";
import { sanitizeName } from "../shared/utils.js";

const SIDES = ["goat", "tiger"];

function sideLabel(side) {
  return side === "goat" ? "Goats" : "Tigers";
}

function winnerText(winner) {
  return winner === "goat"
    ? "Goats win by trapping every tiger."
    : "Tigers win after capturing five goats.";
}

function actionsMatch(left, right = {}) {
  return left.type === right.type
    && left.pieceId === right.pieceId
    && left.from === right.from
    && left.to === right.to
    && (left.over ?? null) === (right.over ?? null);
}

export class BaghChalRoom {
  constructor({ code, io, onEmpty }) {
    this.code = code;
    this.channel = `baghchal:${code}`;
    this.io = io;
    this.onEmpty = onEmpty;
    this.players = {
      goat: null,
      tiger: null
    };
    this.socketSides = new Map();
    this.state = createInitialState();
    this.roomNotice = "Share the team code with a second player.";
  }

  addPlayer(socket, playerProfile = {}, roomOptions = {}) {
    const side = this.pickSide(roomOptions.preferredSide);
    if (!side) {
      throw new Error("That team code already has two players.");
    }

    const player = {
      id: socket.id,
      side,
      name: sanitizeName(playerProfile.displayName, side === "goat" ? "Goat Player" : "Tiger Player")
    };

    this.players[side] = player;
    this.socketSides.set(socket.id, side);

    if (this.hasBothPlayers()) {
      this.resetMatch(`${this.players.goat.name} controls goats. ${this.players.tiger.name} controls tigers.`);
    } else {
      this.roomNotice = `${player.name} claimed ${sideLabel(side)}. Waiting for ${sideLabel(this.getOpenSide())}.`;
    }

    this.broadcastState();
    return {
      roomCode: this.code,
      assignedSide: side
    };
  }

  removePlayer(socketId) {
    const side = this.socketSides.get(socketId);
    if (!side) {
      return;
    }

    const player = this.players[side];
    this.socketSides.delete(socketId);
    this.players[side] = null;

    if (this.isEmpty()) {
      this.onEmpty?.();
      return;
    }

    this.state = createInitialState();
    this.roomNotice = `${player?.name ?? sideLabel(side)} left. Match reset. Waiting for ${sideLabel(this.getOpenSide())}.`;
    this.broadcastState();
  }

  isEmpty() {
    return !this.players.goat && !this.players.tiger;
  }

  hasBothPlayers() {
    return Boolean(this.players.goat && this.players.tiger);
  }

  getOpenSide() {
    return SIDES.find((side) => !this.players[side]) ?? null;
  }

  pickSide(preferredSide) {
    const preferred = SIDES.includes(preferredSide) ? preferredSide : "goat";
    if (!this.players[preferred]) {
      return preferred;
    }

    return this.getOpenSide();
  }

  emitError(socketId, message) {
    this.io.to(socketId).emit("baghChal:error", { message });
  }

  resetMatch(notice = "New online match started.") {
    this.state = createInitialState();
    this.roomNotice = notice;
  }

  requestReset(socketId) {
    if (!this.socketSides.has(socketId)) {
      return;
    }

    if (!this.hasBothPlayers()) {
      this.emitError(socketId, "A second player needs to join before you can restart the match.");
      return;
    }

    this.resetMatch(`${this.players.goat.name} controls goats. ${this.players.tiger.name} controls tigers.`);
    this.broadcastState();
  }

  submitAction(socketId, action) {
    const side = this.socketSides.get(socketId);
    if (!side) {
      return;
    }

    if (!this.hasBothPlayers()) {
      this.emitError(socketId, "Wait for the second player before making a move.");
      return;
    }

    if (this.state.winner) {
      this.emitError(socketId, "That match is over. Start a new one to continue.");
      return;
    }

    if (side !== this.state.turn) {
      this.emitError(socketId, `It is ${sideLabel(this.state.turn)} turn right now.`);
      return;
    }

    const legalAction = getLegalActions(this.state, side).find((candidate) => actionsMatch(candidate, action));
    if (!legalAction) {
      this.emitError(socketId, "That move is no longer valid on the live board.");
      return;
    }

    this.state = applyAction(this.state, legalAction);
    this.roomNotice = this.state.winner
      ? winnerText(this.state.winner)
      : `${sideLabel(this.state.turn)} to move.`;
    this.broadcastState();
  }

  buildPublicState(socketId) {
    const localSide = this.socketSides.get(socketId) ?? null;
    const waitingForOpponent = !this.hasBothPlayers();
    const localCanAct = Boolean(
      localSide
      && !waitingForOpponent
      && !this.state.winner
      && this.state.turn === localSide
    );

    return {
      roomCode: this.code,
      roomNotice: this.roomNotice,
      waitingForOpponent,
      localSide,
      localCanAct,
      gameState: cloneState(this.state),
      players: {
        goat: this.players.goat ? { ...this.players.goat } : null,
        tiger: this.players.tiger ? { ...this.players.tiger } : null
      }
    };
  }

  broadcastState() {
    this.socketSides.forEach((_side, socketId) => {
      this.io.to(socketId).emit("baghChal:state", this.buildPublicState(socketId));
    });
  }
}
