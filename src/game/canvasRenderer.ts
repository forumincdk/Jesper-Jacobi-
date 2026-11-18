import {
  AmpHazard,
  Direction,
  FloatingCallout,
  GridPos,
  Particle,
  PatrolBot,
  RewardItem,
  TileKind,
} from './types';

export interface AmpPhaseState {
  phase: 'idle' | 'windup' | 'active';
  progress: number;
}

export function getAmpPhase(amp: AmpHazard, elapsedTime: number): AmpPhaseState {
  const cycle = amp.cycleSeconds;
  if (cycle <= 0) return { phase: 'idle', progress: 0 };
  const t = ((elapsedTime + amp.phaseOffset) % cycle) / cycle;
  const idleEnd = Math.max(0.05, 1 - amp.windupRatio - amp.activeRatio);
  const windupEnd = 1 - amp.activeRatio;

  if (t < idleEnd) {
    return { phase: 'idle', progress: t / idleEnd };
  }
  if (t < windupEnd) {
    return { phase: 'windup', progress: (t - idleEnd) / amp.windupRatio };
  }
  return { phase: 'active', progress: (t - windupEnd) / amp.activeRatio };
}

export function isAmpDangerTile(
  amps: AmpHazard[],
  gx: number,
  gy: number,
  elapsedTime: number
): boolean {
  for (const amp of amps) {
    const state = getAmpPhase(amp, elapsedTime);
    if (state.phase !== 'active') continue;
    const dist = Math.abs(amp.x - gx) + Math.abs(amp.y - gy);
    if (dist === 1) return true;
  }
  return false;
}

export interface RenderSceneInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  cols: number;
  rows: number;
  tiles: TileKind[][];
  rewards: RewardItem[];
  amps: AmpHazard[];
  patrols: PatrolBot[];
  player: {
    x: number;
    y: number;
    facing: Direction;
    moving: boolean;
    walkCycle: number;
    squashX: number;
    squashY: number;
    invulnTimer: number;
    hitFlash: number;
    emoteTimer: number;
    emoteKind: 'dance' | 'rock' | 'spin' | null;
    speechText: string;
    speechTimer: number;
  };
  queuedPath: GridPos[];
  gateUnlocked: boolean;
  exitUnlocked: boolean;
  elapsedTime: number;
  shakeX: number;
  shakeY: number;
  particles: Particle[];
  callouts: FloatingCallout[];
  cameraPanOnly?: boolean;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function computeBoardMetrics(
  width: number,
  height: number,
  cols: number,
  rows: number
): { tileSize: number; offsetX: number; offsetY: number } {
  const padX = Math.max(24, width * 0.04);
  const padY = Math.max(20, height * 0.04);
  const availW = Math.max(200, width - padX * 2);
  const availH = Math.max(200, height - padY * 2);
  const tileSize = Math.floor(Math.min(availW / cols, availH / rows));
  const boardW = tileSize * cols;
  const boardH = tileSize * rows;
  const offsetX = Math.floor((width - boardW) / 2);
  const offsetY = Math.floor((height - boardH) / 2);
  return { tileSize, offsetX, offsetY };
}

export function renderStudioMazeScene(input: RenderSceneInput): void {
  const {
    ctx,
    width,
    height,
    cols,
    rows,
    tiles,
    rewards,
    amps,
    patrols,
    player,
    queuedPath,
    gateUnlocked,
    exitUnlocked,
    elapsedTime,
    shakeX,
    shakeY,
    particles,
    callouts,
    cameraPanOnly,
  } = input;

  // Deep studio stage backdrop
  ctx.fillStyle = '#0e1015';
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient warm studio light cones
  const bgGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    20,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.68
  );
  bgGlow.addColorStop(0, 'rgba(245, 158, 11, 0.07)');
  bgGlow.addColorStop(0.55, 'rgba(225, 29, 72, 0.03)');
  bgGlow.addColorStop(1, 'rgba(10, 12, 17, 0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, width, height);

  const { tileSize, offsetX, offsetY } = computeBoardMetrics(width, height, cols, rows);

  ctx.save();
  const panX = cameraPanOnly ? Math.sin(elapsedTime * 0.45) * 14 : 0;
  const panY = cameraPanOnly ? Math.cos(elapsedTime * 0.35) * 8 : 0;
  ctx.translate(offsetX + shakeX + panX, offsetY + shakeY + panY);

  // Outer studio room frame shadow
  const boardW = cols * tileSize;
  const boardH = rows * tileSize;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  drawRoundedRect(ctx, -10, -8, boardW + 20, boardH + 22, 16);
  ctx.fill();

  // Pass 1: Floor tiles & interactive floor mechanisms
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = tiles[y][x];
      const px = x * tileSize;
      const py = y * tileSize;

      // Base studio floor
      const checker = (x + y) % 2 === 0;
      ctx.fillStyle = checker ? '#171b24' : '#151821';
      ctx.fillRect(px, py, tileSize, tileSize);

      // Subtle floor plank/tile seam
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);

      if (t === 'pedal') {
        // Footswitch pedal pad
        ctx.fillStyle = gateUnlocked ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)';
        drawRoundedRect(ctx, px + tileSize * 0.12, py + tileSize * 0.12, tileSize * 0.76, tileSize * 0.76, 8);
        ctx.fill();

        ctx.fillStyle = '#272c38';
        drawRoundedRect(ctx, px + tileSize * 0.22, py + tileSize * 0.24, tileSize * 0.56, tileSize * 0.52, 6);
        ctx.fill();
        ctx.strokeStyle = gateUnlocked ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pedal LED
        ctx.fillStyle = gateUnlocked ? '#34d399' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(px + tileSize * 0.5, py + tileSize * 0.38, tileSize * 0.08, 0, Math.PI * 2);
        ctx.fill();

        // Stomp switch button
        ctx.fillStyle = '#d6d3d1';
        ctx.beginPath();
        ctx.arc(px + tileSize * 0.5, py + tileSize * 0.58, tileSize * 0.09, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === 'gate') {
        if (gateUnlocked) {
          // Recessed unlocked track
          ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
          ctx.fillRect(px + 4, py + tileSize * 0.42, tileSize - 8, tileSize * 0.16);
        } else {
          // Locked crimson laser / studio barrier
          ctx.fillStyle = 'rgba(225, 29, 72, 0.14)';
          ctx.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
          const pulse = 0.65 + 0.35 * Math.sin(elapsedTime * 5);
          ctx.strokeStyle = `rgba(244, 63, 94, ${pulse})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + tileSize * 0.35);
          ctx.lineTo(px + tileSize - 4, py + tileSize * 0.35);
          ctx.moveTo(px + 4, py + tileSize * 0.65);
          ctx.lineTo(px + tileSize - 4, py + tileSize * 0.65);
          ctx.stroke();

          // Gate side posts
          ctx.fillStyle = '#3f3f46';
          ctx.fillRect(px + 2, py + tileSize * 0.22, 6, tileSize * 0.56);
          ctx.fillRect(px + tileSize - 8, py + tileSize * 0.22, 6, tileSize * 0.56);
        }
      } else if (t === 'exit') {
        // Stage Door
        const glowColor = exitUnlocked ? 'rgba(16, 185, 129, 0.24)' : 'rgba(113, 113, 122, 0.12)';
        ctx.fillStyle = glowColor;
        drawRoundedRect(ctx, px + 4, py + 4, tileSize - 8, tileSize - 8, 8);
        ctx.fill();

        if (exitUnlocked) {
          const pulse = 0.6 + 0.4 * Math.sin(elapsedTime * 4.5);
          ctx.strokeStyle = `rgba(52, 211, 153, ${pulse})`;
          ctx.lineWidth = 2.5;
          drawRoundedRect(ctx, px + 6, py + 6, tileSize - 12, tileSize - 12, 7);
          ctx.stroke();

          // Stage spotlight chevron
          ctx.fillStyle = '#34d399';
          ctx.font = `700 ${Math.max(9, Math.floor(tileSize * 0.19))}px "Outfit", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('STAGE', px + tileSize * 0.5, py + tileSize * 0.5);
        } else {
          ctx.strokeStyle = '#52525b';
          ctx.lineWidth = 1.5;
          drawRoundedRect(ctx, px + 6, py + 6, tileSize - 12, tileSize - 12, 7);
          ctx.stroke();

          // Padlock icon
          ctx.fillStyle = '#71717a';
          const cx = px + tileSize * 0.5;
          const cy = py + tileSize * 0.52;
          ctx.fillRect(cx - tileSize * 0.13, cy - tileSize * 0.04, tileSize * 0.26, tileSize * 0.2);
          ctx.strokeStyle = '#71717a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy - tileSize * 0.05, tileSize * 0.09, Math.PI, 0);
          ctx.stroke();
        }
      }
    }
  }

  // Pass 2: Amp feedback telegraph / shockwave floor rings (drawn under walls & characters)
  for (const amp of amps) {
    const state = getAmpPhase(amp, elapsedTime);
    if (state.phase === 'idle') continue;
    const adj: GridPos[] = [
      { x: amp.x + 1, y: amp.y },
      { x: amp.x - 1, y: amp.y },
      { x: amp.x, y: amp.y + 1 },
      { x: amp.x, y: amp.y - 1 },
    ];
    for (const pos of adj) {
      if (pos.x < 0 || pos.x >= cols || pos.y < 0 || pos.y >= rows) continue;
      const cell = tiles[pos.y][pos.x];
      if (cell === 'wall' || cell === 'console') continue;
      const fx = pos.x * tileSize;
      const fy = pos.y * tileSize;

      if (state.phase === 'windup') {
        const alpha = 0.15 + state.progress * 0.28;
        ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
        drawRoundedRect(ctx, fx + 4, fy + 4, tileSize - 8, tileSize - 8, 6);
        ctx.fill();

        ctx.strokeStyle = `rgba(251, 191, 36, ${0.45 + state.progress * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          fx + tileSize * 0.5,
          fy + tileSize * 0.5,
          tileSize * (0.18 + state.progress * 0.22),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else {
        const pulse = 1 - state.progress * 0.35;
        ctx.fillStyle = `rgba(225, 29, 72, ${0.38 * pulse})`;
        drawRoundedRect(ctx, fx + 3, fy + 3, tileSize - 6, tileSize - 6, 6);
        ctx.fill();

        ctx.strokeStyle = `rgba(251, 113, 133, ${0.9 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(
          fx + tileSize * 0.5,
          fy + tileSize * 0.5,
          tileSize * (0.28 + state.progress * 0.18),
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    }
  }

  // Pass 3: Patrol Bot tracks
  for (const bot of patrols) {
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.16)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo((bot.from.x + 0.5) * tileSize, (bot.from.y + 0.5) * tileSize);
    ctx.lineTo((bot.to.x + 0.5) * tileSize, (bot.to.y + 0.5) * tileSize);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Pass 4: Queued command path preview (studio cable line)
  if (queuedPath.length > 0) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo((player.x + 0.5) * tileSize, (player.y + 0.5) * tileSize);
    for (const step of queuedPath) {
      ctx.lineTo((step.x + 0.5) * tileSize, (step.y + 0.5) * tileSize);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const last = queuedPath[queuedPath.length - 1];
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      (last.x + 0.5) * tileSize,
      (last.y + 0.5) * tileSize,
      tileSize * (0.22 + 0.04 * Math.sin(elapsedTime * 6)),
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  // Pass 5: Acoustic Walls, Mixing Consoles & Feedback Amp Cabinets
  const ampSet = new Map<string, AmpHazard>();
  for (const amp of amps) {
    ampSet.set(`${amp.x},${amp.y}`, amp);
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = tiles[y][x];
      const px = x * tileSize;
      const py = y * tileSize;
      const amp = ampSet.get(`${x},${y}`);

      if (amp) {
        const state = getAmpPhase(amp, elapsedTime);
        // Guitar Amp Cabinet
        ctx.fillStyle = '#18181b';
        drawRoundedRect(ctx, px + 3, py + 3, tileSize - 6, tileSize - 6, 7);
        ctx.fill();
        ctx.strokeStyle =
          state.phase === 'active'
            ? '#f43f5e'
            : state.phase === 'windup'
              ? '#f59e0b'
              : '#3f3f46';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Speaker cone grille
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.arc(px + tileSize * 0.5, py + tileSize * 0.55, tileSize * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle =
          state.phase === 'active'
            ? '#fb7185'
            : state.phase === 'windup'
              ? '#fbbf24'
              : '#52525b';
        ctx.beginPath();
        ctx.arc(px + tileSize * 0.5, py + tileSize * 0.55, tileSize * 0.1, 0, Math.PI * 2);
        ctx.fill();

        // Brass amp faceplate strip
        ctx.fillStyle = '#d97706';
        ctx.fillRect(px + tileSize * 0.18, py + tileSize * 0.16, tileSize * 0.64, tileSize * 0.11);
      } else if (t === 'wall') {
        // Acoustic foam panel wall block
        ctx.fillStyle = '#242a38';
        drawRoundedRect(ctx, px + 1.5, py + 1.5, tileSize - 3, tileSize - 3, 6);
        ctx.fill();

        // Top bevel highlight
        ctx.fillStyle = '#2f374a';
        drawRoundedRect(ctx, px + 3, py + 3, tileSize - 6, tileSize * 0.34, 4);
        ctx.fill();

        // Acoustic diagonal wedges
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px + tileSize * 0.22, py + tileSize * 0.52);
        ctx.lineTo(px + tileSize * 0.48, py + tileSize * 0.78);
        ctx.moveTo(px + tileSize * 0.52, py + tileSize * 0.52);
        ctx.lineTo(px + tileSize * 0.78, py + tileSize * 0.78);
        ctx.stroke();
      } else if (t === 'console') {
        // Mixing Console / Studio Rack
        ctx.fillStyle = '#1e2430';
        drawRoundedRect(ctx, px + 2, py + 2, tileSize - 4, tileSize - 4, 6);
        ctx.fill();
        ctx.strokeStyle = '#3b4254';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fader sliders & glowing LEDs
        for (let f = 0; f < 3; f++) {
          const fx = px + tileSize * (0.24 + f * 0.25);
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fx, py + tileSize * 0.28);
          ctx.lineTo(fx, py + tileSize * 0.76);
          ctx.stroke();

          const knobY =
            py +
            tileSize * (0.42 + 0.18 * Math.sin(elapsedTime * 2.2 + f * 1.7 + x));
          ctx.fillStyle = f === 1 ? '#f43f5e' : '#f59e0b';
          ctx.fillRect(fx - 3.5, knobY - 2, 7, 4);
        }
      }
    }
  }

  // Pass 6: Collectible Studio Rewards
  for (const item of rewards) {
    if (item.collected) continue;
    const cx = (item.x + 0.5) * tileSize;
    const bob = Math.sin(elapsedTime * 3.5 + item.x) * (tileSize * 0.05);
    const cy = (item.y + 0.5) * tileSize + bob;

    // Soft radial aura
    const auraColor =
      item.kind === 'platinum'
        ? 'rgba(251, 191, 36, 0.24)'
        : item.kind === 'mic'
          ? 'rgba(245, 158, 11, 0.2)'
          : item.kind === 'vinyl'
            ? 'rgba(244, 63, 94, 0.2)'
            : 'rgba(56, 189, 248, 0.18)';
    const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, tileSize * 0.42);
    aura.addColorStop(0, auraColor);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.42, 0, Math.PI * 2);
    ctx.fill();

    if (item.kind === 'vinyl') {
      const r = tileSize * 0.28;
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Groove shine
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, elapsedTime * 2, elapsedTime * 2 + 1.2);
      ctx.stroke();

      // Crimson center label
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fafaf9';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'mic') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.25);
      // Handle
      ctx.fillStyle = '#cbd5e1';
      drawRoundedRect(ctx, -tileSize * 0.05, 0, tileSize * 0.1, tileSize * 0.24, 3);
      ctx.fill();
      // Vintage gold/chrome grille head
      ctx.fillStyle = '#fbbf24';
      drawRoundedRect(ctx, -tileSize * 0.12, -tileSize * 0.22, tileSize * 0.24, tileSize * 0.24, 7);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-tileSize * 0.1, -tileSize * 0.1);
      ctx.lineTo(tileSize * 0.1, -tileSize * 0.1);
      ctx.stroke();
      ctx.restore();
    } else if (item.kind === 'tape') {
      const w = tileSize * 0.52;
      const h = tileSize * 0.34;
      ctx.fillStyle = '#0f172a';
      drawRoundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tape reels
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(cx - w * 0.22, cy, tileSize * 0.06, 0, Math.PI * 2);
      ctx.arc(cx + w * 0.22, cy, tileSize * 0.06, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Platinum Disc Award
      const r = tileSize * 0.3;
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pass 7: Patrol Sweepers
  for (const bot of patrols) {
    const bx = (bot.x + 0.5) * tileSize;
    const by = (bot.y + 0.5) * tileSize;

    // Danger glow
    ctx.fillStyle = 'rgba(225, 29, 72, 0.24)';
    ctx.beginPath();
    ctx.arc(bx, by, tileSize * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Sweeper chassis
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(bx, by, tileSize * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Rotating cross arm
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(elapsedTime * 4.2);
    ctx.strokeStyle = '#fda4af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-tileSize * 0.18, 0);
    ctx.lineTo(tileSize * 0.18, 0);
    ctx.moveTo(0, -tileSize * 0.18);
    ctx.lineTo(0, tileSize * 0.18);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(bx, by, tileSize * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pass 8: Bandmate Character Sprite
  const px = (player.x + 0.5) * tileSize;
  const py = (player.y + 0.5) * tileSize;

  // Personal warm spotlight under Bandmate
  const spot = ctx.createRadialGradient(px, py, 2, px, py, tileSize * 0.85);
  spot.addColorStop(0, 'rgba(251, 191, 36, 0.2)');
  spot.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.arc(px, py, tileSize * 0.85, 0, Math.PI * 2);
  ctx.fill();

  const blinkHide = player.invulnTimer > 0 && Math.floor(player.invulnTimer * 14) % 2 === 1;
  if (!blinkHide) {
    ctx.save();
    const emoteBounce =
      player.emoteTimer > 0 && player.emoteKind === 'dance'
        ? Math.abs(Math.sin(elapsedTime * 14)) * -tileSize * 0.12
        : player.emoteTimer > 0 && player.emoteKind === 'rock'
          ? Math.abs(Math.sin(elapsedTime * 10)) * -tileSize * 0.1
          : 0;
    const emoteRot =
      player.emoteTimer > 0 && player.emoteKind === 'spin'
        ? (1 - player.emoteTimer / 0.8) * Math.PI * 2
        : player.emoteTimer > 0 && player.emoteKind === 'dance'
          ? Math.sin(elapsedTime * 16) * 0.16
          : 0;

    ctx.translate(px, py + emoteBounce);
    ctx.rotate(emoteRot);
    ctx.scale(player.squashX, player.squashY);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, tileSize * 0.28, tileSize * 0.24, tileSize * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated legs / sneakers
    const stride = player.moving ? Math.sin(player.walkCycle * 14) * tileSize * 0.08 : 0;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(-tileSize * 0.11, tileSize * 0.12 + stride * 0.4, tileSize * 0.09, tileSize * 0.16);
    ctx.fillRect(tileSize * 0.02, tileSize * 0.12 - stride * 0.4, tileSize * 0.09, tileSize * 0.16);
    // White sneaker tips
    ctx.fillStyle = '#e7e5e4';
    ctx.fillRect(-tileSize * 0.12, tileSize * 0.25 + stride * 0.4, tileSize * 0.1, tileSize * 0.05);
    ctx.fillRect(tileSize * 0.02, tileSize * 0.25 - stride * 0.4, tileSize * 0.1, tileSize * 0.05);

    // Black leather jacket + Crimson red T-shirt
    ctx.fillStyle = player.hitFlash > 0 ? '#ffffff' : '#18181b';
    drawRoundedRect(ctx, -tileSize * 0.2, -tileSize * 0.06, tileSize * 0.4, tileSize * 0.25, 6);
    ctx.fill();
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Red t-shirt center stripe
    ctx.fillStyle = player.hitFlash > 0 ? '#ffffff' : '#e11d48';
    ctx.fillRect(-tileSize * 0.065, -tileSize * 0.05, tileSize * 0.13, tileSize * 0.22);

    // Chrome microphone in hand
    const micSide = player.facing === 'left' ? -1 : 1;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(micSide * tileSize * 0.2, tileSize * 0.04, tileSize * 0.05, tileSize * 0.14);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(micSide * tileSize * 0.225, tileSize * 0.02, tileSize * 0.055, 0, Math.PI * 2);
    ctx.fill();

    // Headphones around neck
    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.arc(-tileSize * 0.14, -tileSize * 0.05, tileSize * 0.055, 0, Math.PI * 2);
    ctx.arc(tileSize * 0.14, -tileSize * 0.05, tileSize * 0.055, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = player.hitFlash > 0 ? '#ffffff' : '#f5bfa0';
    ctx.beginPath();
    ctx.arc(0, -tileSize * 0.19, tileSize * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // Pompadour hair
    ctx.fillStyle = player.hitFlash > 0 ? '#ffffff' : '#1c1917';
    ctx.beginPath();
    ctx.ellipse(0, -tileSize * 0.32, tileSize * 0.16, tileSize * 0.09, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Eyes oriented slightly toward facing direction
    const lookX =
      player.facing === 'left' ? -tileSize * 0.04 : player.facing === 'right' ? tileSize * 0.04 : 0;
    const lookY =
      player.facing === 'up' ? -tileSize * 0.03 : player.facing === 'down' ? tileSize * 0.02 : 0;
    if (player.facing !== 'up') {
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(-tileSize * 0.055 + lookX, -tileSize * 0.18 + lookY, tileSize * 0.025, 0, Math.PI * 2);
      ctx.arc(tileSize * 0.055 + lookX, -tileSize * 0.18 + lookY, tileSize * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Bandmate Speech Bubble when given a command
  if (player.speechTimer > 0 && player.speechText) {
    const fade = Math.min(1, player.speechTimer * 2.5);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    const textW = Math.min(230, ctx.measureText(player.speechText).width);
    const boxW = textW + 20;
    const boxH = 26;
    const bx = Math.max(4, Math.min(boardW - boxW - 4, px - boxW / 2));
    const by = Math.max(4, py - tileSize * 0.72 - boxH);

    ctx.fillStyle = 'rgba(17, 20, 28, 0.94)';
    drawRoundedRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fafaf9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.speechText, bx + boxW / 2, by + boxH / 2, 214);
    ctx.restore();
  }

  // Pass 9: Particles
  for (const pt of particles) {
    if (!pt.active) continue;
    const alpha = Math.max(0, pt.life / pt.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    const sx = pt.x * tileSize;
    const sy = pt.y * tileSize;
    if (pt.shape === 'note') {
      ctx.font = `700 ${Math.round(pt.size * 2.4)}px "Outfit", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', sx, sy);
    } else {
      ctx.beginPath();
      ctx.arc(sx, sy, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Pass 10: Floating score callouts
  for (const call of callouts) {
    const alpha = Math.max(0, call.life / call.maxLife);
    const rise = (1 - alpha) * tileSize * 0.45;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = call.color;
    ctx.fillText(call.text, (call.x + 0.5) * tileSize, (call.y + 0.15) * tileSize - rise);
    ctx.restore();
  }

  ctx.restore();
}
