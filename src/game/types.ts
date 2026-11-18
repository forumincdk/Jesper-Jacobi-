export type GameState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'ROOM_CLEAR'
  | 'VICTORY'
  | 'GAME_OVER';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type TileKind = 'floor' | 'wall' | 'console' | 'exit' | 'gate' | 'pedal';

export type RewardKind = 'vinyl' | 'mic' | 'tape' | 'platinum';

export interface GridPos {
  x: number;
  y: number;
}

export interface RewardItem {
  id: string;
  x: number;
  y: number;
  kind: RewardKind;
  points: number;
  label: string;
  collected: boolean;
}

export interface AmpHazard {
  id: string;
  x: number;
  y: number;
  cycleSeconds: number;
  phaseOffset: number;
  windupRatio: number; // fraction of cycle spent telegraphing amber before active pulse
  activeRatio: number; // fraction of cycle active red shockwave
}

export interface PatrolBot {
  id: string;
  from: GridPos;
  to: GridPos;
  speedTilesPerSec: number;
  x: number;
  y: number;
  dir: 1 | -1;
}

export type QueuedAction =
  | { type: 'move'; dx: number; dy: number; dir: Direction }
  | { type: 'emote'; kind: 'dance' | 'rock' | 'spin' };

export interface RoomDef {
  id: number;
  name: string;
  subtitle: string;
  parMoves: number;
  layout: string[];
  patrols: Array<{
    from: GridPos;
    to: GridPos;
    speed: number;
  }>;
  ampCycle: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'note' | 'spark';
}

export interface FloatingCallout {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface ScoreBreakdown {
  vinylCount: number;
  vinylPoints: number;
  micCount: number;
  micPoints: number;
  tapeCount: number;
  tapePoints: number;
  awardCount: number;
  awardPoints: number;
  bonusPoints: number;
}

export interface HudSnapshot {
  roomIndex: number;
  totalRooms: number;
  roomName: string;
  roomSubtitle: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  hearts: number;
  maxHearts: number;
  rewardsCollected: number;
  rewardsTotal: number;
  combo: number;
  moves: number;
  gateUnlocked: boolean;
  exitUnlocked: boolean;
  queueLength: number;
  bandmateLine: string;
}
