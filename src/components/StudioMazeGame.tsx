import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Compass,
  Music,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { studioAudio } from '../game/audio';
import { parseStudioCommand } from '../game/commandParser';
import {
  computeBoardMetrics,
  isAmpDangerTile,
  renderStudioMazeScene,
} from '../game/canvasRenderer';
import {
  findPath,
  isTileWalkable,
  ParsedRoom,
  parseRoom,
  STUDIO_ROOMS,
} from '../game/levels';
import {
  AmpHazard,
  Direction,
  FloatingCallout,
  GameState,
  GridPos,
  HudSnapshot,
  Particle,
  PatrolBot,
  QueuedAction,
  RewardItem,
  RewardKind,
  ScoreBreakdown,
  TileKind,
} from '../game/types';
import { TitleScreen } from './TitleScreen';

const MAX_PARTICLES = 120;
const MOVE_SPEED_TILES_PER_SEC = 7.2;

const REWARD_POINT_VALUES: Record<RewardKind, number> = {
  vinyl: 100,
  mic: 200,
  tape: 150,
  platinum: 350,
};

function createEmptyScoreBreakdown(): ScoreBreakdown {
  return {
    vinylCount: 0,
    vinylPoints: 0,
    micCount: 0,
    micPoints: 0,
    tapeCount: 0,
    tapePoints: 0,
    awardCount: 0,
    awardPoints: 0,
    bonusPoints: 0,
  };
}

interface SimState {
  roomIndex: number;
  cols: number;
  rows: number;
  tiles: TileKind[][];
  start: GridPos;
  exit: GridPos;
  rewards: RewardItem[];
  amps: AmpHazard[];
  patrols: PatrolBot[];
  gateUnlocked: boolean;
  exitUnlocked: boolean;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  hearts: number;
  maxHearts: number;
  combo: number;
  moves: number;
  elapsedTime: number;
  hitstopTimer: number;
  shakeTimer: number;
  shakeMagnitude: number;
  player: {
    gridX: number;
    gridY: number;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    moving: boolean;
    facing: Direction;
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
  heldDirs: Direction[];
  bufferedDir: Direction | null;
  queuedActions: QueuedAction[];
  queuedPathPreview: GridPos[];
  particles: Particle[];
  callouts: FloatingCallout[];
  nextCalloutId: number;
}

function createParticlePool(): Particle[] {
  return Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#fbbf24',
    shape: 'circle',
  }));
}

function buildInitialSim(
  roomIndex: number,
  keepScore = 0,
  keepHearts = 3,
  keepBreakdown: ScoreBreakdown = createEmptyScoreBreakdown()
): SimState {
  const safeIdx = Math.max(0, Math.min(STUDIO_ROOMS.length - 1, roomIndex));
  const parsed: ParsedRoom = parseRoom(STUDIO_ROOMS[safeIdx]);
  return {
    roomIndex: safeIdx,
    cols: parsed.cols,
    rows: parsed.rows,
    tiles: parsed.tiles,
    start: parsed.start,
    exit: parsed.exit,
    rewards: parsed.rewards,
    amps: parsed.amps,
    patrols: parsed.patrols,
    gateUnlocked: !parsed.hasGate,
    exitUnlocked: parsed.rewards.length === 0,
    score: keepScore,
    scoreBreakdown: { ...keepBreakdown },
    hearts: keepHearts,
    maxHearts: 3,
    combo: 0,
    moves: 0,
    elapsedTime: 0,
    hitstopTimer: 0,
    shakeTimer: 0,
    shakeMagnitude: 0,
    player: {
      gridX: parsed.start.x,
      gridY: parsed.start.y,
      x: parsed.start.x,
      y: parsed.start.y,
      targetX: parsed.start.x,
      targetY: parsed.start.y,
      moving: false,
      facing: 'down',
      walkCycle: 0,
      squashX: 1,
      squashY: 1,
      invulnTimer: 0,
      hitFlash: 0,
      emoteTimer: 0,
      emoteKind: null,
      speechText: '',
      speechTimer: 0,
    },
    heldDirs: [],
    bufferedDir: null,
    queuedActions: [],
    queuedPathPreview: [],
    particles: createParticlePool(),
    callouts: [],
    nextCalloutId: 1,
  };
}

function directionFromKey(key: string): Direction | null {
  switch (key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      return 'up';
    case 's':
    case 'arrowdown':
      return 'down';
    case 'a':
    case 'arrowleft':
      return 'left';
    case 'd':
    case 'arrowright':
      return 'right';
    default:
      return null;
  }
}

function deltaForDir(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up':
      return { dx: 0, dy: -1 };
    case 'down':
      return { dx: 0, dy: 1 };
    case 'left':
      return { dx: -1, dy: 0 };
    case 'right':
      return { dx: 1, dy: 0 };
  }
}

export const StudioMazeGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [selectedStartRoom, setSelectedStartRoom] = useState(0);
  const [muted, setMuted] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [avatarError, setAvatarError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const gameStateRef = useRef<GameState>('TITLE_MENU');
  const simRef = useRef<SimState>(buildInitialSim(0));

  const [hud, setHud] = useState<HudSnapshot>(() => {
    const s = simRef.current;
    const room = STUDIO_ROOMS[s.roomIndex];
    return {
      roomIndex: s.roomIndex,
      totalRooms: STUDIO_ROOMS.length,
      roomName: room.name,
      roomSubtitle: room.subtitle,
      score: s.score,
      scoreBreakdown: { ...s.scoreBreakdown },
      hearts: s.hearts,
      maxHearts: s.maxHearts,
      rewardsCollected: 0,
      rewardsTotal: s.rewards.length,
      combo: s.combo,
      moves: s.moves,
      gateUnlocked: s.gateUnlocked,
      exitUnlocked: s.exitUnlocked,
      queueLength: 0,
      bandmateLine: 'Waiting for your cue!',
    };
  });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const syncHud = useCallback((customLine?: string) => {
    const s = simRef.current;
    const room = STUDIO_ROOMS[s.roomIndex];
    const collected = s.rewards.filter((r) => r.collected).length;
    setHud((prev) => ({
      roomIndex: s.roomIndex,
      totalRooms: STUDIO_ROOMS.length,
      roomName: room.name,
      roomSubtitle: room.subtitle,
      score: s.score,
      scoreBreakdown: { ...s.scoreBreakdown },
      hearts: s.hearts,
      maxHearts: s.maxHearts,
      rewardsCollected: collected,
      rewardsTotal: s.rewards.length,
      combo: s.combo,
      moves: s.moves,
      gateUnlocked: s.gateUnlocked,
      exitUnlocked: s.exitUnlocked,
      queueLength: s.queuedActions.length,
      bandmateLine: customLine ?? (s.player.speechTimer > 0 ? s.player.speechText : prev.bandmateLine),
    }));
  }, []);

  const spawnBurst = useCallback(
    (
      gx: number,
      gy: number,
      count: number,
      color: string,
      shape: Particle['shape'] = 'circle'
    ) => {
      const s = simRef.current;
      let spawned = 0;
      for (const p of s.particles) {
        if (p.active) continue;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.2 + Math.random() * 2.8;
        p.active = true;
        p.x = gx + 0.5;
        p.y = gy + 0.5;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 0.6;
        p.life = 0.45 + Math.random() * 0.35;
        p.maxLife = p.life;
        p.size = shape === 'note' ? 5 : 2.5 + Math.random() * 2.5;
        p.color = color;
        p.shape = shape;
        spawned++;
        if (spawned >= count) break;
      }
    },
    []
  );

  const addCallout = useCallback((gx: number, gy: number, text: string, color: string) => {
    const s = simRef.current;
    s.callouts.push({
      id: s.nextCalloutId++,
      x: gx,
      y: gy,
      text,
      color,
      life: 0.9,
      maxLife: 0.9,
    });
  }, []);

  const sayLine = useCallback(
    (line: string, duration = 2.2) => {
      const s = simRef.current;
      s.player.speechText = line;
      s.player.speechTimer = duration;
      syncHud(line);
    },
    [syncHud]
  );

  const rebuildPathPreview = useCallback(() => {
    const s = simRef.current;
    const preview: GridPos[] = [];
    let cx = s.player.moving ? s.player.targetX : s.player.gridX;
    let cy = s.player.moving ? s.player.targetY : s.player.gridY;
    for (const act of s.queuedActions) {
      if (act.type === 'move') {
        const nx = cx + act.dx;
        const ny = cy + act.dy;
        if (!isTileWalkable(s.tiles, nx, ny, s.gateUnlocked)) break;
        cx = nx;
        cy = ny;
        preview.push({ x: cx, y: cy });
      }
    }
    s.queuedPathPreview = preview;
  }, []);

  const queuePathTo = useCallback(
    (target: GridPos, speech: string): boolean => {
      const s = simRef.current;
      const startPos: GridPos = {
        x: s.player.moving ? s.player.targetX : s.player.gridX,
        y: s.player.moving ? s.player.targetY : s.player.gridY,
      };
      if (startPos.x === target.x && startPos.y === target.y) {
        sayLine('Already right here!');
        return true;
      }
      const path = findPath(s.tiles, startPos, target, s.gateUnlocked);
      if (path.length === 0) {
        studioAudio.playBump();
        sayLine("Can't reach that spot yet!");
        return false;
      }
      const actions: QueuedAction[] = [];
      let prev = startPos;
      for (const step of path) {
        const dx = step.x - prev.x;
        const dy = step.y - prev.y;
        const dir: Direction =
          dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
        actions.push({ type: 'move', dx, dy, dir });
        prev = step;
      }
      s.queuedActions = actions;
      rebuildPathPreview();
      sayLine(speech);
      return true;
    },
    [rebuildPathPreview, sayLine]
  );

  const triggerEmote = useCallback(
    (kind: 'dance' | 'rock' | 'spin', speech?: string) => {
      const s = simRef.current;
      s.player.emoteKind = kind;
      s.player.emoteTimer = 0.8;
      s.player.squashX = 1.18;
      s.player.squashY = 0.84;
      studioAudio.playEmote();
      spawnBurst(s.player.x, s.player.y, 10, '#fbbf24', 'note');
      sayLine(speech ?? (kind === 'spin' ? 'Spinning!' : 'Rock on!'));
    },
    [sayLine, spawnBurst]
  );

  const startRoom = useCallback(
    (
      roomIdx: number,
      carryScore = 0,
      carryHearts = 3,
      carryBreakdown: ScoreBreakdown = createEmptyScoreBreakdown()
    ) => {
      simRef.current = buildInitialSim(roomIdx, carryScore, carryHearts, carryBreakdown);
      setGameState('PLAYING');
      gameStateRef.current = 'PLAYING';
      const room = STUDIO_ROOMS[roomIdx];
      sayLine(`Ready in ${room.name}!`);
    },
    [sayLine]
  );

  const restartCurrentRun = useCallback(() => {
    startRoom(selectedStartRoom, 0, 3, createEmptyScoreBreakdown());
  }, [selectedStartRoom, startRoom]);

  const handleRoomSelection = useCallback((idx: number) => {
    setSelectedStartRoom(idx);
    if (gameStateRef.current === 'TITLE_MENU') {
      simRef.current = buildInitialSim(idx, 0, 3);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = studioAudio.toggleMute();
    setMuted(nextMuted);
  }, []);

  const executeTextCommand = useCallback(
    (raw: string) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const s = simRef.current;
      const parsed = parseStudioCommand(raw);

      if (parsed.kind === 'stop') {
        s.queuedActions = [];
        s.queuedPathPreview = [];
        sayLine(parsed.speech);
        return;
      }

      if (parsed.kind === 'emote') {
        triggerEmote(parsed.emoteKind, parsed.speech);
        return;
      }

      if (parsed.kind === 'steps') {
        s.queuedActions = [...parsed.actions];
        rebuildPathPreview();
        sayLine(parsed.speech);
        return;
      }

      if (parsed.kind === 'seek_exit') {
        if (!s.exitUnlocked) {
          sayLine('Collect all rewards first to open the Stage Door!');
          studioAudio.playBump();
          return;
        }
        queuePathTo(s.exit, parsed.speech);
        return;
      }

      if (parsed.kind === 'seek_pedal') {
        if (s.gateUnlocked) {
          sayLine('The Soundboard Gate is already open!');
          return;
        }
        for (let y = 0; y < s.rows; y++) {
          for (let x = 0; x < s.cols; x++) {
            if (s.tiles[y][x] === 'pedal') {
              queuePathTo({ x, y }, parsed.speech);
              return;
            }
          }
        }
        sayLine('No footswitch in this room!');
        return;
      }

      if (parsed.kind === 'seek_reward') {
        const startPos: GridPos = {
          x: s.player.moving ? s.player.targetX : s.player.gridX,
          y: s.player.moving ? s.player.targetY : s.player.gridY,
        };
        const candidates = s.rewards.filter(
          (r) => !r.collected && (parsed.rewardKind === 'any' || r.kind === parsed.rewardKind)
        );
        if (candidates.length === 0) {
          if (s.exitUnlocked) {
            queuePathTo(s.exit, 'All rewards collected — heading to Stage Door!');
          } else {
            sayLine('None left of that item!');
          }
          return;
        }
        let bestPath: GridPos[] = [];
        let bestReward: RewardItem | null = null;
        for (const r of candidates) {
          const path = findPath(s.tiles, startPos, { x: r.x, y: r.y }, s.gateUnlocked);
          if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
            bestPath = path;
            bestReward = r;
          }
        }
        if (bestReward) {
          queuePathTo({ x: bestReward.x, y: bestReward.y }, `Grabbing ${bestReward.label}!`);
        } else {
          sayLine('Hit the Footswitch Pedal first to reach that!');
          studioAudio.playBump();
        }
        return;
      }

      studioAudio.playBump();
      sayLine(parsed.speech);
    },
    [queuePathTo, rebuildPathPreview, sayLine, triggerEmote]
  );

  const handleQuickDirection = useCallback(
    (dir: Direction) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const s = simRef.current;
      const { dx, dy } = deltaForDir(dir);
      s.queuedActions.push({ type: 'move', dx, dy, dir });
      rebuildPathPreview();
      sayLine(`Cue: ${dir}!`);
    },
    [rebuildPathPreview, sayLine]
  );

  const handleNearestCue = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    const s = simRef.current;
    if (s.exitUnlocked) {
      queuePathTo(s.exit, 'All tracks ready — heading to Stage Door!');
      return;
    }
    executeTextCommand('nearest');
  }, [executeTextCommand, queuePathTo]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const s = simRef.current;
      const { tileSize, offsetX, offsetY } = computeBoardMetrics(
        rect.width,
        rect.height,
        s.cols,
        s.rows
      );
      const gx = Math.floor((cx - offsetX) / tileSize);
      const gy = Math.floor((cy - offsetY) / tileSize);
      if (gx < 0 || gx >= s.cols || gy < 0 || gy >= s.rows) return;
      if (!isTileWalkable(s.tiles, gx, gy, s.gateUnlocked)) {
        studioAudio.playBump();
        sayLine('Blocked by studio gear!');
        return;
      }
      queuePathTo({ x: gx, y: gy }, 'On my way!');
    },
    [queuePathTo, sayLine]
  );

  // Keyboard bindings with clean input focus handling and window blur clearing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const inTextInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (e.key === 'Escape') {
        if (inTextInput) {
          (activeEl as HTMLElement).blur();
          return;
        }
        if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
        }
        return;
      }

      if (inTextInput) return;

      if (gameStateRef.current === 'TITLE_MENU') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startRoom(selectedStartRoom, 0, 3);
        }
        return;
      }

      if (gameStateRef.current === 'ROOM_CLEAR') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const s = simRef.current;
          startRoom(s.roomIndex + 1, s.score, s.hearts, s.scoreBreakdown);
        }
        return;
      }

      if (gameStateRef.current === 'VICTORY' || gameStateRef.current === 'GAME_OVER') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          restartCurrentRun();
        }
        return;
      }

      if (gameStateRef.current !== 'PLAYING') return;

      if (e.key === ' ') {
        e.preventDefault();
        triggerEmote('spin', 'Soundcheck spin!');
        return;
      }

      const dir = directionFromKey(e.key);
      if (dir) {
        e.preventDefault();
        const s = simRef.current;
        // Direct keyboard input interrupts queued autopilot path for snappy control
        if (s.queuedActions.length > 0) {
          s.queuedActions = [];
          s.queuedPathPreview = [];
          syncHud();
        }
        if (!s.heldDirs.includes(dir)) {
          s.heldDirs.push(dir);
        }
        s.bufferedDir = dir;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const dir = directionFromKey(e.key);
      if (!dir) return;
      const s = simRef.current;
      s.heldDirs = s.heldDirs.filter((d) => d !== dir);
    };

    const onBlur = () => {
      simRef.current.heldDirs = [];
      simRef.current.bufferedDir = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [restartCurrentRun, selectedStartRoom, startRoom, syncHud, triggerEmote]);

  // Isolated 60fps Canvas simulation & render loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const stepMoveStart = (s: SimState, dir: Direction): boolean => {
      const { dx, dy } = deltaForDir(dir);
      s.player.facing = dir;
      const nx = s.player.gridX + dx;
      const ny = s.player.gridY + dy;
      if (!isTileWalkable(s.tiles, nx, ny, s.gateUnlocked)) {
        studioAudio.playBump();
        s.player.squashX = 0.88;
        s.player.squashY = 1.12;
        return false;
      }
      s.player.targetX = nx;
      s.player.targetY = ny;
      s.player.moving = true;
      s.player.squashX = 1.12;
      s.player.squashY = 0.9;
      s.moves++;
      studioAudio.playStep();
      return true;
    };

    const triggerDamage = (s: SimState, reason: string) => {
      if (s.player.invulnTimer > 0) return;
      s.hearts = Math.max(0, s.hearts - 1);
      s.combo = 0;
      s.player.invulnTimer = 1.3;
      s.player.hitFlash = 0.22;
      s.hitstopTimer = 0.045;
      s.shakeTimer = 0.28;
      s.shakeMagnitude = 7;
      s.queuedActions = [];
      s.queuedPathPreview = [];
      studioAudio.playHit();
      spawnBurst(s.player.x, s.player.y, 16, '#f43f5e', 'circle');
      addCallout(s.player.gridX, s.player.gridY, reason, '#fb7185');
      sayLine('Watch that feedback!');

      if (s.hearts <= 0) {
        studioAudio.playGameOver();
        setGameState('GAME_OVER');
        gameStateRef.current = 'GAME_OVER';
      } else {
        syncHud();
      }
    };

    const handleTileArrival = (s: SimState) => {
      const gx = s.player.gridX;
      const gy = s.player.gridY;

      // 1. Collectibles
      let hudDirty = true;
      for (const item of s.rewards) {
        if (!item.collected && item.x === gx && item.y === gy) {
          item.collected = true;
          const basePoints = REWARD_POINT_VALUES[item.kind] ?? item.points;
          const comboBonus = s.combo * 25;
          const gained = basePoints + comboBonus;
          s.score += gained;
          s.scoreBreakdown.bonusPoints += comboBonus;
          if (item.kind === 'vinyl') {
            s.scoreBreakdown.vinylCount += 1;
            s.scoreBreakdown.vinylPoints += basePoints;
          } else if (item.kind === 'mic') {
            s.scoreBreakdown.micCount += 1;
            s.scoreBreakdown.micPoints += basePoints;
          } else if (item.kind === 'tape') {
            s.scoreBreakdown.tapeCount += 1;
            s.scoreBreakdown.tapePoints += basePoints;
          } else if (item.kind === 'platinum') {
            s.scoreBreakdown.awardCount += 1;
            s.scoreBreakdown.awardPoints += basePoints;
          }
          s.combo++;
          if (item.kind === 'platinum') {
            studioAudio.playPlatinum();
            s.hitstopTimer = 0.04;
            s.shakeTimer = 0.18;
            s.shakeMagnitude = 4;
            spawnBurst(gx, gy, 20, '#fbbf24', 'note');
          } else {
            studioAudio.playPickup(s.combo - 1);
            spawnBurst(
              gx,
              gy,
              12,
              item.kind === 'vinyl' ? '#f43f5e' : item.kind === 'mic' ? '#fbbf24' : '#38bdf8',
              'note'
            );
          }
          addCallout(gx, gy, `+${gained}`, '#fbbf24');

          const remaining = s.rewards.filter((r) => !r.collected).length;
          if (remaining === 0 && !s.exitUnlocked) {
            s.exitUnlocked = true;
            studioAudio.playExitUnlock();
            sayLine('All tracks collected! Stage Door is open!', 3.0);
            spawnBurst(s.exit.x, s.exit.y, 18, '#34d399', 'circle');
          } else {
            sayLine(`Got ${item.label} (+${gained})!`);
          }
        }
      }

      // 2. Footswitch Pedal
      if (s.tiles[gy][gx] === 'pedal' && !s.gateUnlocked) {
        s.gateUnlocked = true;
        studioAudio.playPedal();
        spawnBurst(gx, gy, 14, '#34d399', 'circle');
        addCallout(gx, gy, 'GATE OPEN', '#34d399');
        sayLine('Soundboard Gate unlocked!', 2.6);
      }

      // 3. Stage Exit Door
      if (s.tiles[gy][gx] === 'exit' && s.exitUnlocked) {
        const roomBonus = Math.max(0, (STUDIO_ROOMS[s.roomIndex].parMoves - s.moves) * 10);
        const clearPoints = 300 + roomBonus;
        s.score += clearPoints;
        s.scoreBreakdown.bonusPoints += clearPoints;
        studioAudio.playRoomClear();
        spawnBurst(gx, gy, 24, '#34d399', 'note');
        if (s.roomIndex >= STUDIO_ROOMS.length - 1) {
          setGameState('VICTORY');
          gameStateRef.current = 'VICTORY';
        } else {
          setGameState('ROOM_CLEAR');
          gameStateRef.current = 'ROOM_CLEAR';
        }
      }

      if (hudDirty) {
        syncHud();
      }
    };

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      const s = simRef.current;
      const state = gameStateRef.current;

      if (state === 'TITLE_MENU') {
        s.elapsedTime += dt;
      } else if (state === 'PLAYING') {
        if (s.hitstopTimer > 0) {
          s.hitstopTimer = Math.max(0, s.hitstopTimer - dt);
        } else {
          s.elapsedTime += dt;

          // Recover squash-and-stretch smoothly
          s.player.squashX += (1 - s.player.squashX) * Math.min(1, dt * 16);
          s.player.squashY += (1 - s.player.squashY) * Math.min(1, dt * 16);
          if (s.player.invulnTimer > 0) s.player.invulnTimer = Math.max(0, s.player.invulnTimer - dt);
          if (s.player.hitFlash > 0) s.player.hitFlash = Math.max(0, s.player.hitFlash - dt);
          if (s.player.emoteTimer > 0) {
            s.player.emoteTimer = Math.max(0, s.player.emoteTimer - dt);
            if (s.player.emoteTimer === 0) s.player.emoteKind = null;
          }
          if (s.player.speechTimer > 0) {
            s.player.speechTimer = Math.max(0, s.player.speechTimer - dt);
          }
          if (s.shakeTimer > 0) {
            s.shakeTimer = Math.max(0, s.shakeTimer - dt);
          }

          // Update Patrol Sweepers
          for (const bot of s.patrols) {
            const dx = bot.to.x - bot.from.x;
            const dy = bot.to.y - bot.from.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              const step = (bot.speedTilesPerSec * dt) / len;
              const ux = dx / len;
              const uy = dy / len;
              bot.x += ux * bot.dir * bot.speedTilesPerSec * dt;
              bot.y += uy * bot.dir * bot.speedTilesPerSec * dt;

              const proj = ((bot.x - bot.from.x) * ux + (bot.y - bot.from.y) * uy) / len;
              if (proj >= 1 - step * 0.1 && bot.dir === 1) {
                bot.x = bot.to.x;
                bot.y = bot.to.y;
                bot.dir = -1;
              } else if (proj <= step * 0.1 && bot.dir === -1) {
                bot.x = bot.from.x;
                bot.y = bot.from.y;
                bot.dir = 1;
              }
            }
          }

          // Player movement interpolation
          if (s.player.moving) {
            s.player.walkCycle += dt;
            const dx = s.player.targetX - s.player.x;
            const dy = s.player.targetY - s.player.y;
            const dist = Math.hypot(dx, dy);
            const maxStep = MOVE_SPEED_TILES_PER_SEC * dt;
            if (dist <= maxStep) {
              s.player.x = s.player.targetX;
              s.player.y = s.player.targetY;
              s.player.gridX = s.player.targetX;
              s.player.gridY = s.player.targetY;
              s.player.moving = false;
              handleTileArrival(s);
              rebuildPathPreview();
            } else {
              s.player.x += (dx / dist) * maxStep;
              s.player.y += (dy / dist) * maxStep;
            }
          }

          // Start next move when idle
          if (!s.player.moving && gameStateRef.current === 'PLAYING') {
            const activeHeld = s.heldDirs[s.heldDirs.length - 1] ?? null;
            const nextDir = s.bufferedDir ?? activeHeld;
            s.bufferedDir = null;

            if (nextDir) {
              stepMoveStart(s, nextDir);
            } else if (s.queuedActions.length > 0) {
              const nextAct = s.queuedActions.shift()!;
              if (nextAct.type === 'move') {
                const ok = stepMoveStart(s, nextAct.dir);
                if (!ok) {
                  s.queuedActions = [];
                  s.queuedPathPreview = [];
                  sayLine('Path blocked!');
                } else {
                  rebuildPathPreview();
                  syncHud();
                }
              } else {
                triggerEmote(nextAct.kind);
              }
            }
          }

          // Check Hazard Collisions (Feedback Amps & Patrol Sweepers)
          if (gameStateRef.current === 'PLAYING' && s.player.invulnTimer <= 0) {
            const gx = Math.round(s.player.x);
            const gy = Math.round(s.player.y);
            if (isAmpDangerTile(s.amps, gx, gy, s.elapsedTime)) {
              triggerDamage(s, 'AMP ZAP!');
            } else {
              for (const bot of s.patrols) {
                if (Math.hypot(bot.x - s.player.x, bot.y - s.player.y) < 0.52) {
                  triggerDamage(s, 'SWEEPER HIT!');
                  break;
                }
              }
            }
          }

          // Update Particles
          for (const p of s.particles) {
            if (!p.active) continue;
            p.life -= dt;
            if (p.life <= 0) {
              p.active = false;
              continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 2.2 * dt;
          }

          // Update Callouts
          for (let i = s.callouts.length - 1; i >= 0; i--) {
            s.callouts[i].life -= dt;
            if (s.callouts[i].life <= 0) {
              s.callouts.splice(i, 1);
            }
          }
        }
      }

      // Render Canvas
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.max(1, Math.floor(rect.width * dpr));
        const targetH = Math.max(1, Math.floor(rect.height * dpr));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          const shakeRatio = s.shakeTimer > 0 ? s.shakeTimer / 0.28 : 0;
          const shakeX = (Math.random() * 2 - 1) * s.shakeMagnitude * shakeRatio;
          const shakeY = (Math.random() * 2 - 1) * s.shakeMagnitude * shakeRatio;

          renderStudioMazeScene({
            ctx,
            width: rect.width,
            height: rect.height,
            cols: s.cols,
            rows: s.rows,
            tiles: s.tiles,
            rewards: s.rewards,
            amps: s.amps,
            patrols: s.patrols,
            player: s.player,
            queuedPath: s.queuedPathPreview,
            gateUnlocked: s.gateUnlocked,
            exitUnlocked: s.exitUnlocked,
            elapsedTime: s.elapsedTime,
            shakeX,
            shakeY,
            particles: s.particles,
            callouts: s.callouts,
            cameraPanOnly: state === 'TITLE_MENU',
          });
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [addCallout, rebuildPathPreview, sayLine, spawnBurst, syncHud, triggerEmote]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    executeTextCommand(commandInput);
    setCommandInput('');
    commandInputRef.current?.blur();
  };

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-[#0e1015] text-stone-100 select-none">
      {/* Low-Occlusion Top Studio Perimeter HUD (pointer-events-none wrapper) */}
      <header className="pointer-events-none z-10 flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
        {/* Left: Bandmate Avatar + Room Identity */}
        <div className="pointer-events-auto flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-lg border border-white/15 bg-[#181c26]">
            {!avatarError ? (
              <img
                src="/assets/aistudio/Bandmate-_profile_9211c775.png"
                alt="Bandmate avatar"
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-amber-400">
                BM
              </div>
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="font-display">Room {hud.roomIndex + 1}/{hud.totalRooms}</span>
              <span aria-hidden="true" className="text-stone-500">·</span>
              <span>{hud.roomName}</span>
            </div>
            <span className="hidden text-xs text-stone-400 sm:inline">
              {hud.bandmateLine}
            </span>
          </div>
        </div>

        {/* Center/Right: Tabular Metrics & Compact Controls */}
        <div className="pointer-events-auto flex items-center gap-4 sm:gap-5">
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="hidden items-center gap-3 text-xs text-stone-400 lg:flex">
              <span>
                Vinyl <span className="font-mono-tabular font-semibold text-rose-400">{hud.scoreBreakdown.vinylCount}</span>
              </span>
              <span aria-hidden="true" className="text-stone-600">·</span>
              <span>
                Mic <span className="font-mono-tabular font-semibold text-amber-300">{hud.scoreBreakdown.micCount}</span>
              </span>
              <span aria-hidden="true" className="text-stone-600">·</span>
              <span>
                Award <span className="font-mono-tabular font-semibold text-stone-200">{hud.scoreBreakdown.awardCount}</span>
              </span>
              <span aria-hidden="true" className="text-stone-600">·</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400">Tracks</span>
              <span className="font-mono-tabular font-bold text-amber-400">
                {hud.rewardsCollected}/{hud.rewardsTotal}
              </span>
            </div>
            <span aria-hidden="true" className="text-stone-600">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400">Score</span>
              <span className="font-mono-tabular text-sm sm:text-base font-bold text-white">
                {hud.score}
              </span>
              {hud.combo > 1 && (
                <span className="font-mono-tabular text-xs font-semibold text-amber-400">
                  x{hud.combo}
                </span>
              )}
            </div>
            <span aria-hidden="true" className="hidden text-stone-600 sm:inline">·</span>
            {/* Non-hue-only Health Readout with SVG heart icons + numeric */}
            <div className="hidden items-center gap-1.5 sm:flex" aria-label={`Health ${hud.hearts} of ${hud.maxHearts}`}>
              <div className="flex items-center gap-1">
                {Array.from({ length: hud.maxHearts }).map((_, idx) => (
                  <svg
                    key={idx}
                    viewBox="0 0 16 16"
                    className={`h-3.5 w-3.5 ${idx < hud.hearts ? 'text-rose-500' : 'text-stone-700'}`}
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 14.25l-1.15-1.05C3.1 9.8 1 7.9 1 5.45 1 3.55 2.5 2.05 4.4 2.05c1.08 0 2.11.5 2.78 1.3L8 4.3l.82-.95c.67-.8 1.7-1.3 2.78-1.3 1.9 0 3.4 1.5 3.4 3.4 0 2.45-2.1 4.35-5.85 7.75L8 14.25z" />
                  </svg>
                ))}
              </div>
              <span className="font-mono-tabular text-xs font-semibold text-stone-300">
                {hud.hearts}/{hud.maxHearts}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#161922] text-stone-300 transition-colors hover:border-amber-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
            </button>
            <button
              type="button"
              onClick={() => setGameState((prev) => (prev === 'PAUSED' ? 'PLAYING' : 'PAUSED'))}
              aria-label={gameState === 'PAUSED' ? 'Resume game' : 'Pause game'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#161922] text-stone-300 transition-colors hover:border-amber-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {gameState === 'PAUSED' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Isolated 60fps Canvas Arena (~85% of viewport height) */}
      <main ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="block h-full w-full cursor-pointer"
        />
      </main>

      {/* Compact Bottom Command Dock ("Tell Him What To Do") */}
      <footer className="z-10 flex h-16 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#13161f] px-4 sm:px-6">
        {/* Quick Directional Steps + Auto-Seek */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleQuickDirection('left')}
            aria-label="Step left"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1b202c] text-stone-200 transition-colors hover:border-amber-400/50 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleQuickDirection('up')}
            aria-label="Step up"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1b202c] text-stone-200 transition-colors hover:border-amber-400/50 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleQuickDirection('down')}
            aria-label="Step down"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1b202c] text-stone-200 transition-colors hover:border-amber-400/50 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleQuickDirection('right')}
            aria-label="Step right"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#1b202c] text-stone-200 transition-colors hover:border-amber-400/50 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleNearestCue}
            className="hidden h-10 items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-amber-500/35 bg-amber-500/15 px-3 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/25 sm:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>{hud.exitUnlocked ? 'Go to Stage' : 'Nearest Reward'}</span>
          </button>

          <button
            type="button"
            onClick={() => triggerEmote('dance', 'Catching the studio groove!')}
            className="hidden h-10 items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/10 bg-[#1b202c] px-3 text-xs font-medium text-stone-200 transition-colors hover:border-rose-400/40 hover:text-white md:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Music className="h-3.5 w-3.5 text-rose-400" />
            <span>Dance</span>
          </button>
        </div>

        {/* Natural Command Input ("Tell him what to do") */}
        <form onSubmit={handleCommandSubmit} className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            ref={commandInputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder='Tell him what to do... e.g. "up 2, right 3", "get mic", "exit", "dance"'
            aria-label="Tell him what to do"
            className="h-10 w-full max-w-md rounded-lg border border-white/12 bg-[#0e1015] px-3.5 text-xs sm:text-sm text-white placeholder:text-stone-500 focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-rose-600 px-4 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Go</span>
          </button>
          {hud.queueLength > 0 && (
            <button
              type="button"
              onClick={() => {
                simRef.current.queuedActions = [];
                simRef.current.queuedPathPreview = [];
                sayLine('Stopped!');
              }}
              aria-label="Stop queued path"
              className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-white/15 bg-[#1b202c] px-3 text-xs font-medium text-stone-200 hover:border-rose-500/50 hover:text-white"
            >
              <Square className="h-3 w-3 fill-current text-rose-400" />
              <span className="font-mono-tabular">{hud.queueLength}</span>
            </button>
          )}
        </form>
      </footer>

      {/* Title Screen */}
      {gameState === 'TITLE_MENU' && (
        <TitleScreen
          selectedRoom={selectedStartRoom}
          onSelectRoom={handleRoomSelection}
          onStart={() => startRoom(selectedStartRoom, 0, 3)}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#161922] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/Jacobi__4c26d62a.png"
                alt="Jacobi Music"
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-lg border border-amber-500/30 object-cover"
              />
              <div>
                <h2 className="font-display text-xl font-bold text-white">Bandmate Paused</h2>
                <p className="text-xs text-stone-400">
                  Room {hud.roomIndex + 1} · {hud.roomName} · Jacobi Music
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setGameState('PLAYING')}
                className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Resume</span>
              </button>
              <button
                type="button"
                onClick={() => startRoom(hud.roomIndex, 0, 3)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#1d222e] px-5 py-3 text-sm font-medium text-stone-200 hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart Room</span>
              </button>
              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-400 hover:text-white"
              >
                Back to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Clear Modal */}
      {gameState === 'ROOM_CLEAR' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/72 px-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-[#161922] p-7 shadow-2xl">
            <span className="text-xs font-semibold text-emerald-400">
              Room {hud.roomIndex + 1} Complete
            </span>
            <h2 className="font-display mt-1 text-3xl font-bold text-white">
              {hud.roomName} Cleared
            </h2>
            <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-4 text-center">
              <div>
                <div className="text-xs text-stone-400">Score</div>
                <div className="font-mono-tabular mt-0.5 text-lg font-bold text-amber-400">
                  {hud.score}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Moves</div>
                <div className="font-mono-tabular mt-0.5 text-lg font-bold text-white">
                  {hud.moves}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Tracks</div>
                <div className="font-mono-tabular mt-0.5 text-lg font-bold text-emerald-400">
                  {hud.rewardsCollected}/{hud.rewardsTotal}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Vinyl ({hud.scoreBreakdown.vinylCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.vinylPoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Mics ({hud.scoreBreakdown.micCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.micPoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Tapes ({hud.scoreBreakdown.tapeCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.tapePoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Awards ({hud.scoreBreakdown.awardCount})</span>
                <span className="font-mono-tabular font-semibold text-amber-300">+{hud.scoreBreakdown.awardPoints}</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => startRoom(hud.roomIndex + 1, hud.score, hud.hearts, hud.scoreBreakdown)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-stone-950 hover:bg-emerald-400"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Next Studio Room</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory / Game Over Modal */}
      {(gameState === 'VICTORY' || gameState === 'GAME_OVER') && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#161922] p-7 shadow-2xl">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/Jacobi__4c26d62a.png"
                alt="Jacobi Music"
                referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-xl border border-amber-500/30 object-cover"
              />
              <div>
                <span
                  className={`text-xs font-semibold ${
                    gameState === 'VICTORY' ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {gameState === 'VICTORY' ? 'All 5 Studio Rooms Complete' : 'Amp Feedback Overload'}
                </span>
                <p className="text-xs text-stone-400">Bandmate · Lavet af Jacobi Music</p>
              </div>
            </div>
            <h2 className="font-display mt-3 text-3xl font-bold text-white">
              {gameState === 'VICTORY' ? 'Soundcheck Complete!' : 'Stage Blackout'}
            </h2>
            <p className="mt-2 text-sm text-stone-300">
              {gameState === 'VICTORY'
                ? 'Your bandmate nailed every studio room and grabbed the Platinum Disc.'
                : 'Too many feedback shocks in the studio. Ready for another take?'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 border-y border-white/10 py-4 text-center">
              <div>
                <div className="text-xs text-stone-400">Final Score</div>
                <div className="font-mono-tabular mt-0.5 text-2xl font-bold text-amber-400">
                  {hud.score}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400">Studio Room</div>
                <div className="font-mono-tabular mt-0.5 text-2xl font-bold text-white">
                  {hud.roomIndex + 1}/{hud.totalRooms}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Vinyl ({hud.scoreBreakdown.vinylCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.vinylPoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Mics ({hud.scoreBreakdown.micCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.micPoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Tapes ({hud.scoreBreakdown.tapeCount})</span>
                <span className="font-mono-tabular font-semibold text-white">+{hud.scoreBreakdown.tapePoints}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Awards ({hud.scoreBreakdown.awardCount})</span>
                <span className="font-mono-tabular font-semibold text-amber-300">+{hud.scoreBreakdown.awardPoints}</span>
              </div>
              <div className="col-span-2 flex justify-between border-t border-white/10 pt-1.5">
                <span className="text-stone-400">Combo & Stage Bonus</span>
                <span className="font-mono-tabular font-semibold text-emerald-400">+{hud.scoreBreakdown.bonusPoints}</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={restartCurrentRun}
                className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-500"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Play Again</span>
              </button>
              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="whitespace-nowrap shrink-0 rounded-xl border border-white/12 bg-[#1d222e] px-4 py-3 text-sm font-medium text-stone-200 hover:bg-white/10"
              >
                Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
