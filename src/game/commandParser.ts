import { Direction, QueuedAction, RewardKind } from './types';

export type CommandResult =
  | {
      kind: 'steps';
      actions: QueuedAction[];
      speech: string;
    }
  | {
      kind: 'seek_reward';
      rewardKind: RewardKind | 'any';
      speech: string;
    }
  | {
      kind: 'seek_exit';
      speech: string;
    }
  | {
      kind: 'seek_pedal';
      speech: string;
    }
  | {
      kind: 'emote';
      emoteKind: 'dance' | 'rock' | 'spin';
      speech: string;
    }
  | {
      kind: 'stop';
      speech: string;
    }
  | {
      kind: 'unknown';
      speech: string;
    };

const DIR_DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const DIR_ALIASES: Record<string, Direction> = {
  up: 'up',
  u: 'up',
  op: 'up',
  north: 'up',
  nord: 'up',
  n: 'up',
  top: 'up',
  down: 'down',
  d: 'down',
  ned: 'down',
  south: 'down',
  syd: 'down',
  s: 'down',
  bottom: 'down',
  left: 'left',
  l: 'left',
  venstre: 'left',
  v: 'left',
  west: 'left',
  vest: 'left',
  w: 'left',
  right: 'right',
  r: 'right',
  højre: 'right',
  hojre: 'right',
  h: 'right',
  east: 'right',
  øst: 'right',
  ost: 'right',
  e: 'right',
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  en: 1,
  et: 1,
  two: 2,
  to: 2,
  three: 3,
  tre: 3,
  four: 4,
  fire: 4,
  five: 5,
  fem: 5,
  six: 6,
  seks: 6,
  seven: 7,
  syv: 7,
  eight: 8,
  otte: 8,
  nine: 9,
  ni: 9,
  ten: 10,
  ti: 10,
};

export function parseStudioCommand(rawInput: string): CommandResult {
  const input = rawInput.trim().toLowerCase();
  if (!input) {
    return { kind: 'unknown', speech: 'Tell me a direction or target!' };
  }

  if (/^(stop|halt|wait|cancel|clear|freeze|vent|ryd)$/.test(input)) {
    return { kind: 'stop', speech: 'Holding position!' };
  }

  if (/\b(dance|danse|dans|boogie|groove|vibe)\b/.test(input)) {
    return { kind: 'emote', emoteKind: 'dance', speech: 'Catching the studio groove!' };
  }
  if (/\b(spin|snur|drej|twirl|360)\b/.test(input)) {
    return { kind: 'emote', emoteKind: 'spin', speech: 'Spinning on stage!' };
  }
  if (/\b(rock|sing|syng|spil|mic|shred|hello|hej|hi|hey|jump|hop|cheer)\b/.test(input) && !/\b(grab|get|collect|find|go|hent|tag|gå)\b/.test(input)) {
    return { kind: 'emote', emoteKind: 'rock', speech: 'Testing 1-2... Rock on!' };
  }

  if (/\b(exit|door|dør|udgang|finish|leave|stage|scene|escape|out|ud)\b/.test(input)) {
    return { kind: 'seek_exit', speech: 'Heading for the Stage Door!' };
  }

  if (/\b(pedal|switch|gate|unlock|button|open|åbn|knap|lås)\b/.test(input)) {
    return { kind: 'seek_pedal', speech: 'Going to hit the footswitch!' };
  }

  if (/\b(vinyl|record|disc|plade)\b/.test(input)) {
    return { kind: 'seek_reward', rewardKind: 'vinyl', speech: 'Going for that Vinyl Record!' };
  }
  if (/\b(mic|microphone|mikrofon|gold|guld)\b/.test(input)) {
    return { kind: 'seek_reward', rewardKind: 'mic', speech: 'Grabbing the Golden Mic!' };
  }
  if (/\b(tape|cassette|reel|bånd|baand|kassette)\b/.test(input)) {
    return { kind: 'seek_reward', rewardKind: 'tape', speech: 'Picking up the Master Tape!' };
  }
  if (/\b(platinum|platin|award|trophy)\b/.test(input)) {
    return { kind: 'seek_reward', rewardKind: 'platinum', speech: 'Going for the Platinum Disc!' };
  }
  if (/\b(nearest|closest|nærmeste|naermeste|reward|belønning|collect|grab|get|hent|tag|saml|loot|pickup|item|next|næste)\b/.test(input)) {
    return { kind: 'seek_reward', rewardKind: 'any', speech: 'Heading to the nearest reward!' };
  }

  // Parse directional step sequences such as:
  // "up 3, right 2", "op 3, højre 2", "go north 2 then east 4", "u3 r2"
  const normalized = input
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|en|et|to|tre|fire|fem|seks|syv|otte|ni|ti)\b/g, (m) => String(WORD_NUMBERS[m]))
    .replace(/([a-zæøå]+)(\d+)/g, '$1 $2')
    .replace(/(\d+)([a-zæøå]+)/g, '$1 $2')
    .replace(/[,;]+/g, ' ');

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const actions: QueuedAction[] = [];
  const summaryParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (['go', 'gå', 'gaa', 'move', 'walk', 'step', 'steps', 'skridt', 'then', 'så', 'og', 'and', 'to', 'til', 'by', 'tiles', 'tile'].includes(tok)) {
      continue;
    }

    const dir = DIR_ALIASES[tok];
    if (dir) {
      let count = 1;
      const next = tokens[i + 1];
      if (next && /^\d+$/.test(next)) {
        count = Math.min(20, Math.max(1, parseInt(next, 10)));
        i++;
      }
      const delta = DIR_DELTAS[dir];
      for (let c = 0; c < count; c++) {
        actions.push({ type: 'move', dx: delta.dx, dy: delta.dy, dir });
      }
      summaryParts.push(`${dir} ${count}`);
      continue;
    }

    // Handle "2 right" phrasing
    if (/^\d+$/.test(tok) && tokens[i + 1] && DIR_ALIASES[tokens[i + 1]]) {
      const count = Math.min(20, Math.max(1, parseInt(tok, 10)));
      const dirNext = DIR_ALIASES[tokens[i + 1]];
      const delta = DIR_DELTAS[dirNext];
      for (let c = 0; c < count; c++) {
        actions.push({ type: 'move', dx: delta.dx, dy: delta.dy, dir: dirNext });
      }
      summaryParts.push(`${dirNext} ${count}`);
      i++;
    }
  }

  if (actions.length > 0) {
    const label = summaryParts.slice(0, 3).join(', ') + (summaryParts.length > 3 ? '...' : '');
    return {
      kind: 'steps',
      actions,
      speech: `On it: ${label}!`,
    };
  }

  return {
    kind: 'unknown',
    speech: 'Try "up 2, right 3", "nearest", "exit", or "dance"!',
  };
}
