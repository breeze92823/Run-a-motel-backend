// What this server tells Boxity about its players (docs.bloxity.io/#html5): the leaderboard
// scores, the profile stats ("Only in this game") and the Game Ribbons (badges). Everything is read
// from the save this server stores for the player (motel.ts, kept in `active` from the load and
// every accepted save), never from a field a client message names. All of it is a no-op outside a
// Boxity deploy (boxity.canReport()) and never throws into the room.
import { boxity, canReport, hostedPost, legionId } from "./boxity.js";
import type { MotelSave } from "./motel.js";
import { roomStars } from "./stars.js";

// --- Leaderboards (client Legion.SDK.leaderboard.define declares the same board) --------------
export const BOARDS = [
  { id: "earned", label: "Lifetime Earnings", order: "desc", mode: "best", format: "compact", reset: "weekly" },
];

// --- Profile stats ------------------------------------------------------------------------------
const STATS = [
  { key: "cash", label: "Cash", type: "currency", sortOrder: 1 },
  { key: "earned", label: "Total Earned", type: "currency", sortOrder: 2 },
  { key: "rooms_open", label: "Rooms Open", type: "number", sortOrder: 3 },
  { key: "staff_hired", label: "Staff Hired", type: "number", sortOrder: 4 },
  { key: "five_star_rooms", label: "5-Star Rooms", type: "number", sortOrder: 5 },
];
// Boxity rejects (never clamps) values above these.
const CEILING: Record<string, number> = { number: 1e9, seconds: 31_536_000_000, currency: 1e12, percent: 100 };

// --- Game Ribbons ---------------------------------------------------------------------------------
export const BADGES = [
  { key: "welcome", name: "Welcome", description: "Open your motel for the first time.", icon: "🔑", rarity: "common" },
  { key: "first-guest", name: "First Guest", description: "Check in your first paying guest.", icon: "🛎️", rarity: "uncommon" },
  { key: "full-house", name: "Full House", description: "Open all six ground-floor rooms (101-106).", icon: "🏨", rarity: "rare" },
  { key: "five-star", name: "Five Star", description: "Furnish a room to 5 stars.", icon: "⭐", rarity: "epic" },
  { key: "millionaire", name: "Millionaire", description: "Earn $1,000,000 in total.", icon: "💰", rarity: "legendary" },
];

const openRooms = (m: MotelSave) => Object.values(m.rooms).filter((r) => r.open);
const fiveStarRooms = (m: MotelSave) => openRooms(m).filter((r) => roomStars(r.furniture) >= 5).length;

// Which ribbons a save has reached.
export function earnedBadges(m: MotelSave | null): string[] {
  if (!m) return ["welcome"];
  const seen = (m.game?.game as { seen?: unknown } | undefined)?.seen;
  const out = ["welcome"];
  if (m.earned > 0 || (Array.isArray(seen) && seen.length > 0)) out.push("first-guest");
  if ([101, 102, 103, 104, 105, 106].every((n) => m.rooms[String(n)]?.open)) out.push("full-house");
  if (fiveStarRooms(m) > 0) out.push("five-star");
  if (m.earned >= 1_000_000) out.push("millionaire");
  return out;
}

// The profile stat values of a save; anything not finite, negative or over its ceiling is left out.
export function statValues(m: MotelSave): Record<string, number> {
  const raw: Record<string, number> = {
    cash: m.money,
    earned: m.earned,
    rooms_open: openRooms(m).length,
    staff_hired: Object.keys(m.staff).length,
    five_star_rooms: fiveStarRooms(m),
  };
  const out: Record<string, number> = {};
  for (const s of STATS) {
    const v = raw[s.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= CEILING[s.type]) out[s.key] = v;
  }
  return out;
}

// --- The players this pod holds -------------------------------------------------------------------
interface Active {
  motel: MotelSave | null;
  owned: Set<string> | null; // their ribbons, once Boxity answered `owned`
  awarding: Set<string>;
  reportedEarned: number; // last leaderboard score sent
  dirtyStats: boolean;
}
const active = new Map<string, Active>(); // Boxity user id -> state (guests are never here)

// The player's save as this server stores it: on load and after every accepted save.
export function trackPlayer(userId: string, motel: MotelSave | null | undefined): void {
  if (!userId) return;
  let a = active.get(userId);
  if (!a) {
    a = { motel: null, owned: null, awarding: new Set(), reportedEarned: -1, dirtyStats: true };
    active.set(userId, a);
    void loadOwned(userId, a);
  }
  if (motel) a.motel = motel;
  a.dirtyStats = true;
  if (a.owned) void awardReached(userId, a);
}

// The player left: one last report, then forget them.
export async function untrackPlayer(userId: string): Promise<void> {
  const a = active.get(userId);
  if (!a) return;
  await Promise.all([reportStats([userId]), reportLeaderboard([userId])]);
  active.delete(userId);
}

async function loadOwned(userId: string, a: Active): Promise<void> {
  if (!canReport() || !badgesDeclared) return;
  const r = await hostedPost("/v1/game-badges/hosted/{id}/owned", { userIds: [legionId(userId)] });
  if (!r || r.status >= 300) return void logRefusal("badges owned", r);
  const list = r.json?.owned?.[legionId(userId)] ?? r.json?.owned?.[userId] ?? [];
  a.owned = new Set(Array.isArray(list) ? list : []);
  await awardReached(userId, a);
}

async function awardReached(userId: string, a: Active): Promise<void> {
  if (!a.owned) return;
  const missing = earnedBadges(a.motel).filter((k) => !a.owned!.has(k) && !a.awarding.has(k));
  if (!missing.length) return;
  for (const k of missing) a.awarding.add(k);
  const r = await hostedPost("/v1/game-badges/hosted/{id}/award", { awards: missing.map((key) => ({ userId: legionId(userId), key })) });
  for (const k of missing) a.awarding.delete(k);
  if (!r || r.status >= 300) return void logRefusal("badges award", r); // retried on the next save
  for (const k of missing) a.owned.add(k);
}

let badgesDeclared = false;
async function declareBadges(): Promise<void> {
  const r = await hostedPost("/v1/game-badges/hosted/{id}/declare", { badges: BADGES });
  if (r && r.status < 300) {
    badgesDeclared = true;
    for (const [id, a] of active) if (!a.owned) void loadOwned(id, a);
    return;
  }
  logRefusal("badges declare", r);
  if (r?.status === 403) return; // dev channel on production: Boxity refuses it, stop asking
  setTimeout(() => void declareBadges(), 30_000).unref();
}

async function reportStats(only?: string[]): Promise<void> {
  const players = [];
  for (const [id, a] of active) {
    if ((only && !only.includes(id)) || !a.motel || (!only && !a.dirtyStats)) continue;
    const values = statValues(a.motel);
    if (Object.keys(values).length) players.push({ userId: legionId(id), values });
    a.dirtyStats = false;
  }
  for (let i = 0; i < players.length; i += 200) {
    const r = await hostedPost(`/v1/games/{id}/stats`, { definitions: STATS, players: players.slice(i, i + 200) });
    if (r) console.log("[reports] stats", r.status, JSON.stringify(r.json));
  }
}

async function reportLeaderboard(only?: string[]): Promise<void> {
  const scores = [];
  for (const [id, a] of active) {
    if ((only && !only.includes(id)) || !a.motel) continue;
    const earned = Math.floor(a.motel.earned);
    if (!(earned > 0) || earned === a.reportedEarned) continue;
    scores.push({ board: "earned", userId: legionId(id), score: earned, id, earned });
  }
  for (let i = 0; i < scores.length; i += 200) {
    const batch = scores.slice(i, i + 200);
    const r = await hostedPost("/v1/leaderboards/hosted/{id}/report", { boards: BOARDS, scores: batch.map(({ board, userId, score }) => ({ board, userId, score })) });
    if (r) console.log("[reports] leaderboard", r.status, JSON.stringify(r.json?.dropped ?? r.json));
    if (r && r.status < 300) for (const s of batch) {
      const a = active.get(s.id);
      if (a) a.reportedEarned = s.earned;
    }
  }
}

function logRefusal(what: string, r: { status: number; json: unknown } | null) {
  console.warn(`[reports] ${what} failed`, r ? `${r.status} ${JSON.stringify(r.json)}` : "(no answer)");
}

let installed = false;
// Once at server start: declares the ribbons, then reports stats every 60 s and leaderboard
// scores every 20 s. A no-op outside a Boxity deploy.
export function installReports(): void {
  if (installed || !canReport()) return;
  installed = true;
  console.log(`[reports] reporting to ${boxity.apiUrl} as ${boxity.gameId}`);
  void declareBadges();
  setInterval(() => void reportStats(), 60_000).unref();
  setInterval(() => void reportLeaderboard(), 20_000).unref();
}

// Shutdown / drain: the last values of everyone on this pod.
export async function flushReports(): Promise<void> {
  if (!canReport()) return;
  for (const a of active.values()) a.dirtyStats = true;
  await Promise.all([reportStats(), reportLeaderboard()]);
}

// Test-only: forget every tracked player.
export function __resetReportsForTest(): void {
  active.clear();
  badgesDeclared = false;
}
