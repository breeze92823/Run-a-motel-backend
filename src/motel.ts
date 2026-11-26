import {
  CURRENCY_MAX, ID_PATTERN, MOTEL_CHARGES_MAX, MOTEL_FURNITURE_MAX, MOTEL_FUTURE_MS, MOTEL_GAME_MAX_BYTES, MOTEL_GAME_MAX_DEPTH, MOTEL_IDS_MAX,
  MOTEL_LEVEL_MAX, MOTEL_RATE_MAX, MOTEL_ROOM_MAX, MOTEL_ROOMS_MAX,
} from "./constants.js";

// The motel save (client src/economy.js snapshot()): money, everything bought in the Upgrades /
// Hiring / Shop windows, the rooms and their furniture, timers, and `game` (the gameplay
// modules' own sections, src/game/*). Client-authoritative like the rest of the save: only shape
// and bounds are enforced here.
export interface MotelRoom {
  open: boolean;
  furniture: string[];
  magic?: boolean;
}
export interface MotelSave {
  money: number;
  owned: string[]; // upgrade + forever shop ids, "pool", "starter"
  repeats: Record<string, number>; // repeat upgrade id -> times bought (nextRoom)
  staff: Record<string, number>; // staff id -> level (0 = hired)
  boosts: Record<string, number>; // timed boost id -> epoch ms it ends
  charges: Record<string, number>; // consumable id -> uses left
  invest: Record<string, number>; // cash investment id -> epoch ms it pays out
  rooms: Record<string, MotelRoom>; // room number -> state
  cosmetics: string[];
  tourists: number; // called by the bus, not spawned yet
  earned: number; // lifetime income
  rate: number; // recent income $/s (offline earnings)
  lastSeen: number; // epoch ms of this snapshot
  game: Record<string, unknown>;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
const clamp = (v: number, max: number, min = 0) => Math.min(max, Math.max(min, v));

function ids(raw: unknown): string[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isId))].slice(0, MOTEL_IDS_MAX) : [];
}
// { id: number } with slug keys, whole numbers in [0, max].
function counts(raw: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MOTEL_IDS_MAX) break;
    if (isId(k) && finite(v)) out[k] = Math.floor(clamp(v, max));
  }
  return out;
}
function rooms(raw: unknown): Record<string, MotelRoom> {
  const out: Record<string, MotelRoom> = {};
  if (!isObject(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MOTEL_ROOMS_MAX) break;
    const n = Number(k);
    if (!Number.isInteger(n) || n < 1 || n > MOTEL_ROOM_MAX || !isObject(v)) continue;
    out[String(n)] = { open: v.open === true, furniture: ids(v.furniture).slice(0, MOTEL_FURNITURE_MAX), ...(v.magic === true && { magic: true }) };
  }
  return out;
}
// Free-form gameplay state: plain JSON only, no Mongo operator/dotted keys, bounded depth and size.
function plain(v: unknown, depth: number): unknown {
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (finite(v)) return v;
  if (depth >= MOTEL_GAME_MAX_DEPTH) return undefined;
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1)).filter((x) => x !== undefined);
  if (isObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (!k || k.startsWith("$") || k.includes(".") || k.length > 64) continue;
      const c = plain(x, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined;
}
function game(raw: unknown): Record<string, unknown> {
  const g = plain(raw, 0);
  if (!isObject(g)) return {};
  try {
    return JSON.stringify(g).length <= MOTEL_GAME_MAX_BYTES ? g : {};
  } catch {
    return {};
  }
}

export function sanitizeMotel(raw: unknown, now = Date.now()): MotelSave | null {
  if (!isObject(raw)) return null;
  const future = now + MOTEL_FUTURE_MS;
  return {
    money: finite(raw.money) ? Math.floor(clamp(raw.money, CURRENCY_MAX)) : 0,
    owned: ids(raw.owned),
    repeats: counts(raw.repeats, MOTEL_LEVEL_MAX),
    staff: counts(raw.staff, MOTEL_LEVEL_MAX),
    boosts: counts(raw.boosts, future),
    charges: counts(raw.charges, MOTEL_CHARGES_MAX),
    invest: counts(raw.invest, future),
    rooms: rooms(raw.rooms),
    cosmetics: ids(raw.cosmetics),
    tourists: finite(raw.tourists) ? Math.floor(clamp(raw.tourists, 1000)) : 0,
    earned: finite(raw.earned) ? Math.floor(clamp(raw.earned, CURRENCY_MAX)) : 0,
    rate: finite(raw.rate) ? clamp(raw.rate, MOTEL_RATE_MAX) : 0,
    lastSeen: finite(raw.lastSeen) ? Math.floor(clamp(raw.lastSeen, now + 10 * 60 * 1000)) : 0,
    game: game(raw.game),
  };
}
