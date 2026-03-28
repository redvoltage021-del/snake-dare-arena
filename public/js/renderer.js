import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_SIZE,
  GRID_HEIGHT,
  GRID_WIDTH,
  POWER_UP_TYPES
} from "/shared/config.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((part) => `${part}${part}`).join("")
    : clean;
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function mixColor(baseHex, targetHex, amount) {
  const safeAmount = clamp(amount, 0, 1);
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);

  return `rgb(${Math.round(base.r + (target.r - base.r) * safeAmount)}, ${Math.round(
    base.g + (target.g - base.g) * safeAmount
  )}, ${Math.round(base.b + (target.b - base.b) * safeAmount)})`;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawDiamond(context, centerX, centerY, radius) {
  context.beginPath();
  context.moveTo(centerX, centerY - radius);
  context.lineTo(centerX + radius, centerY);
  context.lineTo(centerX, centerY + radius);
  context.lineTo(centerX - radius, centerY);
  context.closePath();
}

function drawHexagon(context, centerX, centerY, radius) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.closePath();
}

function truncateText(context, text, maxWidth) {
  if (!text) {
    return "";
  }

  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let shortened = text;
  while (shortened.length && context.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

function getRenderedSegments(player) {
  const segments = player.segments ?? [];
  const previousSegments = player.previousSegments ?? segments;
  const progress = clamp(player.moveProgress ?? 1, 0, 1);

  return segments.map((segment, index) => {
    const previous = previousSegments[index] ?? segment;
    return {
      x: lerp(previous.x, segment.x, progress),
      y: lerp(previous.y, segment.y, progress)
    };
  });
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.particles = [];
    this.lastFrameAt = performance.now();
    this.scaleX = 1;
    this.scaleY = 1;
    this.trauma = 0;
    this.flashColor = null;
    this.flashUntil = 0;

    this.resize = this.resize.bind(this);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    }
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  triggerBurst(cell, color, label = "") {
    if (!cell) {
      return;
    }

    const centerX = cell.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = cell.y * CELL_SIZE + CELL_SIZE / 2;

    for (let index = 0; index < 14; index += 1) {
      const angle = (Math.PI * 2 * index) / 14;
      this.particles.push({
        kind: "spark",
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * (56 + index * 3),
        vy: Math.sin(angle) * (56 + index * 3),
        life: 0.56,
        maxLife: 0.56,
        size: 1.8 + (index % 3) * 0.6,
        color
      });
    }

    this.particles.push({
      kind: "ring",
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      life: 0.4,
      maxLife: 0.4,
      radius: 10,
      color
    });

    if (label) {
      this.particles.push({
        kind: "label",
        x: centerX,
        y: centerY - 8,
        vx: 0,
        vy: -26,
        life: 0.9,
        maxLife: 0.9,
        color,
        label
      });
    }
  }

  triggerImpact({ intensity = 0.24, color = "#ffffff", duration = 180 } = {}) {
    this.trauma = Math.max(this.trauma, clamp(intensity, 0, 1));
    this.flashColor = color;
    this.flashUntil = performance.now() + duration;
  }

  draw(snapshot, { now = performance.now(), localPlayerId = null } = {}) {
    const deltaSeconds = Math.min(0.05, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.updateParticles(deltaSeconds);
    this.resize();

    const localPlayer = snapshot?.players?.find((player) => player.id === localPlayerId) ?? null;
    const shake = this.getShakeOffset(now);

    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.setTransform(
      this.scaleX,
      0,
      0,
      this.scaleY,
      shake.x * this.scaleX,
      shake.y * this.scaleY
    );

    this.drawBackdrop(now, snapshot, localPlayer);
    this.drawGrid(now, localPlayer);
    this.drawArenaSweep(now, localPlayer);
    this.drawArenaBorder(now, snapshot, localPlayer);

    if (snapshot?.food) {
      this.drawFood(snapshot.food, now);
    }

    if (snapshot?.powerUp) {
      this.drawPowerUp(snapshot.powerUp, now);
    }

    if (snapshot?.players?.length) {
      snapshot.players.forEach((player) => {
        this.drawSnake(player, now, player.id === localPlayerId);
      });
    } else {
      this.drawIdleMessage();
    }

    if (snapshot?.local?.countdownLabel) {
      this.drawCountdown(snapshot.local, now);
    }

    this.drawParticles();
    this.drawFlash(now);
    this.drawVignette();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    this.scaleX = pixelWidth / CANVAS_WIDTH;
    this.scaleY = pixelHeight / CANVAS_HEIGHT;
  }

  updateParticles(deltaSeconds) {
    this.trauma = Math.max(0, this.trauma - deltaSeconds * 1.75);
    this.particles = this.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * deltaSeconds,
        y: particle.y + particle.vy * deltaSeconds,
        radius: particle.kind === "ring" ? particle.radius + deltaSeconds * 44 : particle.radius,
        life: particle.life - deltaSeconds
      }))
      .filter((particle) => particle.life > 0);
  }

  getShakeOffset(now) {
    if (this.trauma <= 0.001) {
      return { x: 0, y: 0 };
    }

    const strength = this.trauma * this.trauma * 7;
    return {
      x: Math.sin(now / 22) * strength,
      y: Math.cos(now / 18) * strength * 0.72
    };
  }

  drawBackdrop(now, snapshot, localPlayer) {
    const speedGlow = localPlayer?.speeding ? 0.26 : 0.16;
    const countdownGlow = snapshot?.local?.countdownLabel ? 0.18 : 0;
    this.context.fillStyle = "#082026";
    this.context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.context.save();
    this.context.globalAlpha = 0.12 + countdownGlow;
    this.context.fillStyle = "#ff8a2b";
    this.context.beginPath();
    this.context.arc(CANVAS_WIDTH * 0.12, CANVAS_HEIGHT * 0.84, 150, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();

    this.context.save();
    this.context.globalAlpha = speedGlow;
    this.context.fillStyle = "#25e3c7";
    this.context.beginPath();
    this.context.arc(CANVAS_WIDTH * 0.86, CANVAS_HEIGHT * 0.16, 165, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  drawGrid(now, localPlayer) {
    for (let row = 0; row < GRID_HEIGHT; row += 1) {
      for (let column = 0; column < GRID_WIDTH; column += 1) {
        this.context.fillStyle = (row + column) % 2 === 0
          ? "rgba(255, 255, 255, 0.014)"
          : localPlayer?.speeding
            ? "rgba(39, 225, 255, 0.038)"
            : "rgba(39, 225, 255, 0.025)";
        this.context.fillRect(column * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }

    this.context.save();
    this.context.strokeStyle = "rgba(124, 158, 188, 0.1)";
    this.context.lineWidth = 1;

    for (let column = 0; column <= GRID_WIDTH; column += 1) {
      this.context.beginPath();
      this.context.moveTo(column * CELL_SIZE + 0.5, 0);
      this.context.lineTo(column * CELL_SIZE + 0.5, CANVAS_HEIGHT);
      this.context.stroke();
    }

    for (let row = 0; row <= GRID_HEIGHT; row += 1) {
      this.context.beginPath();
      this.context.moveTo(0, row * CELL_SIZE + 0.5);
      this.context.lineTo(CANVAS_WIDTH, row * CELL_SIZE + 0.5);
      this.context.stroke();
    }

    this.context.globalAlpha = 0.18 + Math.sin(now / 750) * 0.03;
    this.context.strokeStyle = localPlayer?.speeding ? "rgba(255, 122, 24, 0.42)" : "rgba(116, 236, 255, 0.36)";
    this.context.strokeRect(1.5, 1.5, CANVAS_WIDTH - 3, CANVAS_HEIGHT - 3);
    this.context.restore();
  }

  drawArenaSweep(now, localPlayer) {
    const sweepY = (now * (localPlayer?.speeding ? 0.14 : 0.08)) % (CANVAS_HEIGHT + 120) - 60;
    this.context.save();
    this.context.globalAlpha = localPlayer?.speeding ? 0.12 : 0.08;
    this.context.fillStyle = localPlayer?.speeding ? "#ff8a2b" : "#25e3c7";
    this.context.fillRect(0, sweepY - 28, CANVAS_WIDTH, 56);
    this.context.restore();
  }

  drawArenaBorder(now, snapshot, localPlayer) {
    const dangerAlpha = snapshot?.local?.alive === false ? 0.34 : 0;
    const shielded = snapshot?.local?.shieldCharges > 0 ? 0.18 : 0;
    const speeded = localPlayer?.speeding ? 0.2 : 0.08;

    this.context.save();
    this.context.lineWidth = 3;
    this.context.strokeStyle = `rgba(255, 255, 255, ${0.03 + Math.sin(now / 540) * 0.015})`;
    this.context.strokeRect(5, 5, CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10);

    if (dangerAlpha > 0 || shielded > 0 || speeded > 0) {
      const tint = dangerAlpha > 0 ? "#ff3d6e" : shielded > 0 ? "#78ff7a" : "#ff7a18";
      this.context.strokeStyle = rgba(tint, Math.max(dangerAlpha, shielded, speeded));
      this.context.lineWidth = 5;
      this.context.strokeRect(7, 7, CANVAS_WIDTH - 14, CANVAS_HEIGHT - 14);
    }
    this.context.restore();
  }

  drawFood(food, now) {
    const centerX = food.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = food.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = 7 + Math.sin(now / 170) * 1.5;

    this.context.save();
    this.context.globalAlpha = 0.34;
    this.context.fillStyle = "#fde047";
    this.context.beginPath();
    this.context.arc(centerX, centerY, pulse + 7, 0, Math.PI * 2);
    this.context.fill();

    this.context.globalAlpha = 0.18;
    this.context.strokeStyle = "#ffe35a";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(centerX, centerY, pulse + 11 + Math.sin(now / 240) * 1.6, 0, Math.PI * 2);
    this.context.stroke();

    this.context.globalAlpha = 1;
    this.context.fillStyle = "#ffeb67";
    drawDiamond(this.context, centerX, centerY, pulse);
    this.context.fill();

    this.context.strokeStyle = "#fff8c4";
    this.context.lineWidth = 1.4;
    this.context.stroke();

    const orbitAngle = now / 240;
    const orbitX = centerX + Math.cos(orbitAngle) * (pulse + 4);
    const orbitY = centerY + Math.sin(orbitAngle) * (pulse + 4);
    this.context.fillStyle = "#fffce2";
    this.context.beginPath();
    this.context.arc(orbitX, orbitY, 2.2, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  drawPowerUp(powerUp, now) {
    const centerX = powerUp.x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = powerUp.y * CELL_SIZE + CELL_SIZE / 2;
    const power = POWER_UP_TYPES[powerUp.type];
    const pulse = 1 + Math.sin(now / 250) * 0.08;
    const spin = now / 650;

    this.context.save();
    this.context.translate(centerX, centerY);
    this.context.scale(pulse, pulse);

    this.context.strokeStyle = rgba(power.color, 0.34);
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(0, 0, 15, 0, Math.PI * 2);
    this.context.stroke();

    this.context.beginPath();
    this.context.arc(0, 0, 21 + Math.sin(now / 220) * 2.2, 0, Math.PI * 2);
    this.context.strokeStyle = rgba(power.color, 0.12);
    this.context.stroke();

    this.context.rotate(spin);
    this.context.fillStyle = rgba(power.color, 0.18);
    drawHexagon(this.context, 0, 0, 14);
    this.context.fill();

    this.context.strokeStyle = power.color;
    this.context.lineWidth = 1.6;
    this.context.stroke();

    this.context.rotate(-spin * 2);
    this.context.fillStyle = power.color;
    drawDiamond(this.context, 0, 0, 9);
    this.context.fill();

    this.context.fillStyle = "#06101a";
    this.context.font = "bold 11px Bahnschrift";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(power.name[0], 0, 1);
    this.context.restore();
  }

  drawSnake(player, now, isLocalPlayer) {
    if (!player.alive || !player.segments?.length) {
      return;
    }

    const renderedSegments = getRenderedSegments(player);
    const glowColor = isLocalPlayer ? "#ffffff" : player.color;
    const head = renderedSegments[0];
    const pulse = 0.9 + Math.sin(now / 220) * 0.08;

    if (isLocalPlayer) {
      this.context.save();
      this.context.strokeStyle = rgba(player.speeding ? "#ff7a18" : "#ffffff", 0.12);
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(
        head.x * CELL_SIZE + CELL_SIZE / 2,
        head.y * CELL_SIZE + CELL_SIZE / 2,
        18 + Math.sin(now / 180) * 1.4,
        0,
        Math.PI * 2
      );
      this.context.stroke();
      this.context.restore();
    }

    renderedSegments
      .slice()
      .reverse()
      .forEach((segment, index) => {
        const fromTail = index / Math.max(1, renderedSegments.length - 1);
        const x = segment.x * CELL_SIZE + 2;
        const y = segment.y * CELL_SIZE + 2;
        const size = CELL_SIZE - 4;
        const outerColor = mixColor(player.color, "#041019", fromTail * 0.36);
        const innerColor = mixColor(player.color, "#ffffff", isLocalPlayer ? 0.22 + fromTail * 0.1 : 0.08);

        this.context.save();
        this.context.shadowBlur = isLocalPlayer ? 15 : 8;
        this.context.shadowColor = rgba(glowColor, isLocalPlayer ? 0.34 : 0.18);
        this.context.fillStyle = outerColor;
        drawRoundedRect(this.context, x, y, size, size, 7);
        this.context.fill();

        this.context.shadowBlur = 0;
        this.context.fillStyle = innerColor;
        drawRoundedRect(this.context, x + 3, y + 3, size - 8, size - 8, 5);
        this.context.globalAlpha = 0.68 * pulse;
        this.context.fill();

        this.context.globalAlpha = 0.18;
        this.context.fillStyle = "#ffffff";
        drawRoundedRect(this.context, x + 3, y + 2, size - 7, 5, 3);
        this.context.fill();
        this.context.restore();
      });

    const headX = head.x * CELL_SIZE + 1;
    const headY = head.y * CELL_SIZE + 1;
    const headSize = CELL_SIZE - 2;

    this.context.save();
    this.context.shadowBlur = isLocalPlayer ? 18 : 11;
    this.context.shadowColor = rgba(glowColor, isLocalPlayer ? 0.48 : 0.26);
    this.context.fillStyle = mixColor(player.color, "#ffffff", isLocalPlayer ? 0.2 : 0.08);
    drawRoundedRect(this.context, headX, headY, headSize, headSize, 8);
    this.context.fill();

    this.context.shadowBlur = 0;
    this.context.fillStyle = "rgba(255, 255, 255, 0.18)";
    drawRoundedRect(this.context, headX + 2, headY + 2, headSize - 4, 5, 3);
    this.context.fill();

    const centerX = headX + headSize / 2;
    const centerY = headY + headSize / 2;
    const eyes = {
      up: [
        { x: centerX - 4.4, y: centerY - 4.6 },
        { x: centerX + 4.4, y: centerY - 4.6 }
      ],
      down: [
        { x: centerX - 4.4, y: centerY + 4.6 },
        { x: centerX + 4.4, y: centerY + 4.6 }
      ],
      left: [
        { x: centerX - 4.6, y: centerY - 4.4 },
        { x: centerX - 4.6, y: centerY + 4.4 }
      ],
      right: [
        { x: centerX + 4.6, y: centerY - 4.4 },
        { x: centerX + 4.6, y: centerY + 4.4 }
      ]
    };

    this.context.fillStyle = "#041019";
    (eyes[player.direction] ?? eyes.right).forEach((eye) => {
      this.context.beginPath();
      this.context.arc(eye.x, eye.y, 2.2, 0, Math.PI * 2);
      this.context.fill();
    });

    this.drawDirectionMarker(centerX, centerY, player.direction, player.color);
    this.context.restore();

    if (player.name) {
      this.context.save();
      this.context.font = "bold 12px Bahnschrift";
      this.context.textAlign = "center";
      this.context.fillStyle = isLocalPlayer ? "#ffffff" : "#d8e5f2";
      this.context.fillText(player.name, headX + headSize / 2, headY - 9);
      this.context.restore();
    }
  }

  drawDirectionMarker(centerX, centerY, direction, color) {
    const marker = {
      up: [
        [centerX, centerY - 8],
        [centerX - 3.6, centerY - 2.8],
        [centerX + 3.6, centerY - 2.8]
      ],
      down: [
        [centerX, centerY + 8],
        [centerX - 3.6, centerY + 2.8],
        [centerX + 3.6, centerY + 2.8]
      ],
      left: [
        [centerX - 8, centerY],
        [centerX - 2.8, centerY - 3.6],
        [centerX - 2.8, centerY + 3.6]
      ],
      right: [
        [centerX + 8, centerY],
        [centerX + 2.8, centerY - 3.6],
        [centerX + 2.8, centerY + 3.6]
      ]
    }[direction] ?? [];

    if (!marker.length) {
      return;
    }

    this.context.save();
    this.context.fillStyle = rgba(color, 0.95);
    this.context.beginPath();
    this.context.moveTo(marker[0][0], marker[0][1]);
    this.context.lineTo(marker[1][0], marker[1][1]);
    this.context.lineTo(marker[2][0], marker[2][1]);
    this.context.closePath();
    this.context.fill();
    this.context.restore();
  }

  drawCountdown(localState, now) {
    const scale = 1 + Math.sin(now / 140) * 0.04;

    this.context.save();
    this.context.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
    this.context.scale(scale, scale);

    this.context.strokeStyle = "rgba(39, 225, 255, 0.2)";
    this.context.lineWidth = 3;
    this.context.beginPath();
    this.context.arc(0, 0, 64, 0, Math.PI * 2);
    this.context.stroke();

    this.context.strokeStyle = "rgba(255, 122, 24, 0.24)";
    this.context.beginPath();
    this.context.arc(0, 0, 80 + Math.sin(now / 110) * 3, 0, Math.PI * 2);
    this.context.stroke();

    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillStyle = "#f7fbff";
    this.context.font = "bold 72px Rockwell";
    this.context.fillText(localState.countdownLabel, 0, -2);

    this.context.fillStyle = "rgba(210, 223, 236, 0.9)";
    this.context.font = "14px Bahnschrift";
    this.context.fillText("Line up your opening route", 0, 42);
    this.context.restore();
  }

  drawIdleMessage() {
    this.context.save();
    this.context.textAlign = "center";
    this.context.fillStyle = "rgba(242, 247, 251, 0.72)";
    this.context.font = "bold 28px Rockwell";
    this.context.fillText("Waiting For The First Move", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 12);
    this.context.font = "14px Bahnschrift";
    this.context.fillStyle = "rgba(145, 166, 186, 0.9)";
    this.context.fillText("Solo for practice. Rooms for chaos.", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 18);
    this.context.restore();
  }

  drawParticles() {
    this.particles.forEach((particle) => {
      const alpha = particle.life / particle.maxLife;
      this.context.save();
      this.context.globalAlpha = alpha;

      if (particle.kind === "label") {
        this.context.fillStyle = particle.color;
        this.context.font = "bold 14px Bahnschrift";
        this.context.textAlign = "center";
        this.context.fillText(particle.label, particle.x, particle.y);
      } else if (particle.kind === "ring") {
        this.context.strokeStyle = particle.color;
        this.context.lineWidth = 2;
        this.context.beginPath();
        this.context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        this.context.stroke();
      } else {
        this.context.fillStyle = particle.color;
        this.context.beginPath();
        this.context.arc(particle.x, particle.y, particle.size ?? 2.2, 0, Math.PI * 2);
        this.context.fill();
      }
      this.context.restore();
    });
  }

  drawFlash(now) {
    if (!this.flashColor || now >= this.flashUntil) {
      return;
    }

    const remaining = (this.flashUntil - now) / 220;
    this.context.save();
    this.context.fillStyle = rgba(this.flashColor, clamp(remaining * 0.12, 0, 0.12));
    this.context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.context.restore();
  }

  drawVignette() {
    this.context.save();
    this.context.fillStyle = "rgba(0, 0, 0, 0.2)";
    this.context.fillRect(0, 0, CANVAS_WIDTH, 16);
    this.context.fillRect(0, CANVAS_HEIGHT - 16, CANVAS_WIDTH, 16);
    this.context.fillRect(0, 0, 16, CANVAS_HEIGHT);
    this.context.fillRect(CANVAS_WIDTH - 16, 0, 16, CANVAS_HEIGHT);
    this.context.restore();
  }
}
