import { ID_PATTERN, MOTEL_FURNITURE_MAX, MOTEL_VIEW_MAX_LEN } from "./constants.js";
import type { MotelSave } from "./motel.js";

// What the other players in the room draw of a player's motel (client src/remoteMotels.js): the
// roster's `motel` string, built here from the sanitized save only (never from a client message of
// its own), so it shows exactly what that player's game would show. JSON:
//   { rooms: { "101": { o: 1, f: [furniture ids], w?: wall id, l?: floor id, m?: 1 } },
//     pool: 0|1, fountain: 0|1, rating: 1..5, bags: "0110", junk: "01" }
// o = open, f = the furniture in use, w / l = the room's wallpaper / floor (the client's 'decor'
// save section), m = the magic bed; bags / junk = the junk yard's cleared pieces (1 = gone). "" = no save yet: the client draws a fresh motel.

const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

interface ViewRoom {
  o: 0 | 1;
  f: string[];
  w?: string;
  l?: string;
  m?: 1;
}

export function motelView(m: MotelSave | null | undefined): string {
  if (!m) return "";
  const decor = isObject(m.game?.decor) && isObject(m.game.decor.rooms) ? (m.game.decor.rooms as Record<string, unknown>) : {};
  const play = isObject(m.game?.game) ? m.game.game : {};
  const rooms: Record<string, ViewRoom> = {};
  for (const [n, r] of Object.entries(m.rooms ?? {})) {
    const look = isObject(decor[n]) ? decor[n] : {};
    const v: ViewRoom = { o: r.open ? 1 : 0, f: r.furniture.filter(isId).slice(0, MOTEL_FURNITURE_MAX) };
    if (isId(look.wall)) v.w = look.wall;
    if (isId(look.floor)) v.l = look.floor;
    if (r.magic) v.m = 1;
    rooms[n] = v;
  }
  const rating = typeof play.rating === "number" && Number.isFinite(play.rating) ? Math.round(Math.min(5, Math.max(1, play.rating)) * 100) / 100 : 0;
  const flags = (v: unknown) => (typeof v === "string" && /^[01]{0,128}$/.test(v) ? v : "");
  const view = { rooms, pool: m.owned.includes("pool") ? 1 : 0, fountain: play.fountain === true ? 1 : 0, rating, bags: flags(play.bags), junk: flags(play.junk) };
  let text = JSON.stringify(view);
  // Over the cap (a forged save): drop furniture lists, biggest first, until it fits.
  const byLoad = Object.values(rooms).sort((a, b) => b.f.length - a.f.length);
  for (const r of byLoad) {
    if (text.length <= MOTEL_VIEW_MAX_LEN) break;
    r.f = [];
    text = JSON.stringify(view);
  }
  return text.length <= MOTEL_VIEW_MAX_LEN ? text : JSON.stringify({ ...view, rooms: {} });
}
