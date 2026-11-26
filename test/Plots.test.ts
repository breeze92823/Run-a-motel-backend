import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { MOTEL_VIEW_MAX_LEN, PLOT_COUNT, ROOM_MAX_CLIENTS } from "../src/constants.js";
import { motelView } from "../src/motelView.js";
import { sanitizeMotel } from "../src/motel.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("motel plots", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());
  afterEach(() => __setPlayersForTest(null));

  it("seats six players, one per plot, and frees a plot when its owner leaves", async () => {
    assert.strictEqual(ROOM_MAX_CLIENTS, 6);
    assert.strictEqual(PLOT_COUNT, ROOM_MAX_CLIENTS);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const clients = [];
    for (let i = 0; i < PLOT_COUNT; i++) clients.push(await colyseus.connectTo(room, { userId: `guest-${i}` }));
    await sleep(50);
    const plots = clients.map((c) => room.state.players.get(c.sessionId)!.plot).sort();
    assert.deepStrictEqual(plots, [0, 1, 2, 3, 4, 5]);
    await assert.rejects(colyseus.connectTo(room, { userId: "guest-7" }), "a 7th player does not fit");

    const gone = room.state.players.get(clients[2].sessionId)!.plot;
    await clients[2].leave(true);
    await sleep(80);
    const next = await colyseus.connectTo(room, { userId: "guest-8" });
    await sleep(50);
    assert.strictEqual(room.state.players.get(next.sessionId)!.plot, gone, "the newcomer takes the freed plot");
  });

  it("relays the outfit key, emote and grounded flag, bounded", async () => {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "guest-a", outfit: "o1.abc" });
    const b = await colyseus.connectTo(room, { userId: "guest-b" });
    await sleep(50);
    const p = room.state.players.get(a.sessionId)!;
    assert.strictEqual(p.outfit, "o1.abc", "from the join options");
    a.send("look", { outfit: "o2.xyz", emote: "wave", avatar: '{"equipped":{}}' });
    a.send("pose", { x: 1, y: 0, z: 2, yaw: 0, speed: 3, grounded: false });
    await sleep(80);
    assert.deepStrictEqual([p.outfit, p.emote, p.avatar, p.grounded], ["o2.xyz", "wave", '{"equipped":{}}', false]);
    a.send("look", { outfit: "x".repeat(300), emote: "bad id with spaces" });
    await sleep(80);
    assert.deepStrictEqual([p.outfit, p.emote], ["o2.xyz", "wave"], "oversized / unprintable values are ignored");
    const seen = (b.state as any).players.get(a.sessionId);
    assert.strictEqual(seen.outfit, "o2.xyz");
    assert.ok(seen.plot >= 0);
  });

  it("shows each motel to the others from its save, guests included", async () => {
    const fake = fakePlayers([{ _id: "owner", version: 1, updatedAt: new Date(), motel: sanitizeMotel({ owned: ["pool"], rooms: { 101: { open: true, furniture: ["bed", "tv"] } }, game: { game: { rating: 4.4, fountain: true, bags: "0110", junk: "bad" }, decor: { rooms: { 101: { wall: "stripes", floor: "oak" } } } } })! } as any]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const owner = await colyseus.connectTo(room, { userId: "owner" });
    const guest = await colyseus.connectTo(room, { userId: "guest-g" });
    for (const c of [owner, guest]) for (const t of ["progress", "noProgress", "spins", "daily", "leaderboard"]) c.onMessage(t, () => {});
    fake.release();
    await sleep(150);
    const view = JSON.parse(room.state.players.get(owner.sessionId)!.motel);
    assert.deepStrictEqual(view, { rooms: { 101: { o: 1, f: ["bed", "tv"], w: "stripes", l: "oak" } }, pool: 1, fountain: 1, rating: 4.4, bags: "0110", junk: "" });
    assert.strictEqual(room.state.players.get(guest.sessionId)!.motel, "", "a guest starts on a fresh motel");

    guest.send("saveProgress", { motel: { rooms: { 101: { open: true, furniture: [] }, 102: { open: true, furniture: ["fridge"] } } } });
    await sleep(100);
    const g = JSON.parse(room.state.players.get(guest.sessionId)!.motel);
    assert.deepStrictEqual(g.rooms["102"], { o: 1, f: ["fridge"] });
    assert.ok(!fake.docs.has("guest-g"), "a guest's save is still never stored");
  });

  it("keeps the view under its cap", () => {
    const rooms: Record<number, unknown> = {};
    for (let n = 101; n < 140; n++) rooms[n] = { open: true, furniture: Array.from({ length: 32 }, (_, i) => `longFurnitureName${i}`) };
    const text = motelView(sanitizeMotel({ rooms })!);
    assert.ok(text.length <= MOTEL_VIEW_MAX_LEN);
    assert.ok(JSON.parse(text).rooms["101"], "rooms stay, only furniture lists are dropped");
  });
});
