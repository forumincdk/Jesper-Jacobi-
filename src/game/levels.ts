import { AmpHazard, GridPos, PatrolBot, RewardItem, RoomDef, TileKind } from './types';

export const STUDIO_ROOMS: RoomDef[] = [
  {
    id: 1,
    name: 'Warm-Up Booth',
    subtitle: 'Grab every studio track and head to the glowing Stage Door',
    parMoves: 38,
    ampCycle: 0,
    layout: [
      '###############',
      '#S..v..#..t..m#',
      '#.#.#..#..#.#.#',
      '#...#.....#...#',
      '#.#.==###==.#.#',
      '#...v.....t...#',
      '#.###.###.###.#',
      '#m..#..E..#..p#',
      '###############',
    ],
    patrols: [],
  },
  {
    id: 2,
    name: 'Amp Alley',
    subtitle: 'Watch the amber charge rings before Feedback Amps pulse red',
    parMoves: 46,
    ampCycle: 2.6,
    layout: [
      '###############',
      '#S..v..=..t..m#',
      '#.#.#..#..#.#.#',
      '#...#..A..#...#',
      '#.###.....###.#',
      '#v....###....p#',
      '#.#.#.....#.#.#',
      '#m..#..A..#..E#',
      '###############',
    ],
    patrols: [],
  },
  {
    id: 3,
    name: 'Cable Maze',
    subtitle: 'Dodge roaming mic-stand sweepers along the studio floor',
    parMoves: 56,
    ampCycle: 2.4,
    layout: [
      '#################',
      '#S...v..=..t...m#',
      '#.###.#.#.#.###.#',
      '#...#.......#...#',
      '###.#.==A==.#.###',
      '#v..#.......#..p#',
      '#.###.#.#.#.###.#',
      '#m.....t.v.....E#',
      '#################',
    ],
    patrols: [
      { from: { x: 5, y: 3 }, to: { x: 11, y: 3 }, speed: 2.2 },
      { from: { x: 3, y: 7 }, to: { x: 13, y: 7 }, speed: 2.5 },
    ],
  },
  {
    id: 4,
    name: 'Mixing Hall',
    subtitle: 'Step on the Footswitch Pedal to drop the Soundboard Gate',
    parMoves: 64,
    ampCycle: 2.2,
    layout: [
      '#################',
      '#S..v..#P#..t..m#',
      '#.####.#.#.####.#',
      '#.#..#.....#..#.#',
      '#.#.A=.#G#.=A.#.#',
      '#...v..#.#..t...#',
      '#.####.#.#.####.#',
      '#m.....#E#.....p#',
      '#################',
    ],
    patrols: [
      { from: { x: 6, y: 3 }, to: { x: 10, y: 3 }, speed: 2.3 },
      { from: { x: 2, y: 5 }, to: { x: 6, y: 5 }, speed: 2.1 },
    ],
  },
  {
    id: 5,
    name: 'Main Stage',
    subtitle: 'Full studio run — unlock the stage gate and claim the platinum disc',
    parMoves: 76,
    ampCycle: 2.0,
    layout: [
      '#################',
      '#S..v...=..t...m#',
      '#.###.#.#.#.###.#',
      '#.#...#...#...#.#',
      '#.#.A.=.#.=.A.#.#',
      '#...v.......t...#',
      '#.###.#.#.#.###.#',
      '#P..#.......#..p#',
      '#.#.#.##G##.#.#.#',
      '#m..#...E...#..v#',
      '#################',
    ],
    patrols: [
      { from: { x: 5, y: 5 }, to: { x: 11, y: 5 }, speed: 2.7 },
      { from: { x: 5, y: 7 }, to: { x: 11, y: 7 }, speed: 2.4 },
    ],
  },
];

export interface ParsedRoom {
  cols: number;
  rows: number;
  tiles: TileKind[][];
  start: GridPos;
  exit: GridPos;
  rewards: RewardItem[];
  amps: AmpHazard[];
  patrols: PatrolBot[];
  hasGate: boolean;
}

const REWARD_META: Record<string, { kind: RewardItem['kind']; points: number; label: string }> = {
  v: { kind: 'vinyl', points: 100, label: 'Vinyl Record' },
  m: { kind: 'mic', points: 200, label: 'Golden Mic' },
  t: { kind: 'tape', points: 150, label: 'Master Tape' },
  p: { kind: 'platinum', points: 350, label: 'Platinum Disc' },
};

export function parseRoom(room: RoomDef): ParsedRoom {
  const rows = room.layout.length;
  const cols = room.layout[0].length;
  const tiles: TileKind[][] = [];
  let start: GridPos = { x: 1, y: 1 };
  let exit: GridPos = { x: cols - 2, y: rows - 2 };
  const rewards: RewardItem[] = [];
  const amps: AmpHazard[] = [];
  let hasGate = false;

  for (let y = 0; y < rows; y++) {
    const row: TileKind[] = [];
    const line = room.layout[y];
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      if (ch === '#') {
        row.push('wall');
      } else if (ch === '=') {
        row.push('console');
      } else if (ch === 'E') {
        row.push('exit');
        exit = { x, y };
      } else if (ch === 'G') {
        row.push('gate');
        hasGate = true;
      } else if (ch === 'P') {
        row.push('pedal');
      } else if (ch === 'A') {
        row.push('wall');
        amps.push({
          id: `amp-${x}-${y}`,
          x,
          y,
          cycleSeconds: room.ampCycle || 2.4,
          phaseOffset: amps.length * 0.75,
          windupRatio: 0.45,
          activeRatio: 0.22,
        });
      } else {
        row.push('floor');
        if (ch === 'S') {
          start = { x, y };
        } else if (REWARD_META[ch]) {
          const meta = REWARD_META[ch];
          rewards.push({
            id: `reward-${x}-${y}`,
            x,
            y,
            kind: meta.kind,
            points: meta.points,
            label: meta.label,
            collected: false,
          });
        }
      }
    }
    tiles.push(row);
  }

  const patrols: PatrolBot[] = room.patrols.map((p, idx) => ({
    id: `patrol-${idx}`,
    from: { ...p.from },
    to: { ...p.to },
    speedTilesPerSec: p.speed,
    x: p.from.x,
    y: p.from.y,
    dir: 1,
  }));

  return {
    cols,
    rows,
    tiles,
    start,
    exit,
    rewards,
    amps,
    patrols,
    hasGate,
  };
}

export function isTileWalkable(
  tiles: TileKind[][],
  x: number,
  y: number,
  gateUnlocked: boolean
): boolean {
  if (y < 0 || y >= tiles.length || x < 0 || x >= tiles[0].length) return false;
  const t = tiles[y][x];
  if (t === 'wall' || t === 'console') return false;
  if (t === 'gate' && !gateUnlocked) return false;
  return true;
}

export function findPath(
  tiles: TileKind[][],
  from: GridPos,
  to: GridPos,
  gateUnlocked: boolean
): GridPos[] {
  if (from.x === to.x && from.y === to.y) return [];
  if (!isTileWalkable(tiles, to.x, to.y, gateUnlocked)) return [];

  const rows = tiles.length;
  const cols = tiles[0].length;
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const parent = new Map<string, GridPos>();
  const queue: GridPos[] = [from];
  visited[from.y][from.x] = true;

  const dirs: GridPos[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.x === to.x && curr.y === to.y) {
      const path: GridPos[] = [];
      let trace: GridPos | undefined = curr;
      while (trace && !(trace.x === from.x && trace.y === from.y)) {
        path.unshift(trace);
        trace = parent.get(`${trace.x},${trace.y}`);
      }
      return path;
    }

    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (visited[ny][nx]) continue;
      if (!isTileWalkable(tiles, nx, ny, gateUnlocked)) continue;
      visited[ny][nx] = true;
      parent.set(`${nx},${ny}`, curr);
      queue.push({ x: nx, y: ny });
    }
  }

  return [];
}
