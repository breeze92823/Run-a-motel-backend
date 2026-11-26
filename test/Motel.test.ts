import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { sanitizeMotel } from "../src/motel.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

describe("motel save", () => {
  it("keeps a well-formed motel and bounds a forged one", () => {
    const now = 1_000_000;
    const m = sanitizeMotel({
      money: 186.7, owned: ["drip", "autoMachine", "drip", "bad id!"], repeats: { nextRoom: 2 }, staff: { gus: 1, rose: 3 },
      boosts: { flyers: now + 60_000, radio: now + 1e15 }, charges: { rushWash: 5 }, invest: { cashStack: now + 120_000 },
      rooms: { 101: { open: true, furniture: ["fridge", "bed"] }, 102: { open: true, furniture: [], magic: true }, abc: { open: true }, 5000: { open: true } },
      cosmetics: ["goldenLamp"], tourists: 3, earned: 900, rate: 1.5, lastSeen: now,
      game: { cleanSets: 6, rooms: { "101": { dirty: true } }, $where: "x", "a.b": 1, deep: { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } } },
      hack: 1,
    }, now)!;
    assert.strictEqual(m.money, 186);
    assert.deepStrictEqual(m.owned, ["drip", "autoMachine"]);
    assert.deepStrictEqual(m.staff, { gus: 1, rose: 3 });
    assert.strictEqual(m.boosts.flyers, now + 60_000);
    assert.ok(m.boosts.radio <= now + 7 * 24 * 3600 * 1000, "timers are bounded");
    assert.deepStrictEqual(Object.keys(m.rooms).sort(), ["101", "102"]);
    assert.deepStrictEqual(m.rooms["101"].furniture, ["fridge", "bed"]);
    assert.strictEqual(m.rooms["102"].magic, true);
    assert.strictEqual((m.game as any).cleanSets, 6);
    assert.ok(!("$where" in m.game) && !("a.b" in m.game), "no Mongo operator or dotted keys");
    assert.ok(!("hack" in m));
    assert.strictEqual(sanitizeMotel("nope"), null);
  });

  it("keeps a fully furnished room (one item in each of the client's 16 slots)", () => {
    const furniture = ["bed", "deskChair", "sideTable", "nightstand", "fileCabinet", "tableLamp", "painting", "rug",
      "plant", "fridge", "tv", "radio", "floorFan", "sodaMachine", "vanity", "tub"];
    const m = sanitizeMotel({ rooms: { 101: { open: true, furniture } } })!;
    assert.deepStrictEqual(m.rooms["101"].furniture, furniture);
  });

  describe("over the room", () => {
    let colyseus: ColyseusTestServer<typeof appConfig>;
    before(async () => (colyseus = await testServer()));
    beforeEach(async () => await colyseus.cleanup());
    afterEach(() => __setPlayersForTest(null));

    it("saves the motel and sends it back on the next join", async () => {
      const fake = fakePlayers();
      __setPlayersForTest(fake);
      const room = await colyseus.createRoom<WorldState>("world", {});
      const c = await colyseus.connectTo(room, { userId: "m1", username: "Owner" });
      c.onMessage("noProgress", () => {});
      fake.release();
      await sleep(150);
      c.send("saveProgress", { motel: { money: 420, owned: ["drip"], staff: { lou: 0 }, rooms: { 101: { open: true, furniture: ["fridge"] } }, game: { rating: 4.2 } } });
      await sleep(150);
      const doc = fake.docs.get("m1") as any;
      assert.strictEqual(doc.motel.money, 420);
      assert.deepStrictEqual(doc.motel.owned, ["drip"]);
      await c.leave();

      // A fresh (gated) store holding what was saved, so the handler is registered before the load.
      const fake2 = fakePlayers([...fake.docs.values()]);
      __setPlayersForTest(fake2);
      const room2 = await colyseus.createRoom<WorldState>("world", {}); // the first one disposed when empty
      const again = await colyseus.connectTo(room2, { userId: "m1", username: "Owner" });
      let got: any = null;
      again.onMessage("progress", (m: any) => (got = m));
      fake2.release();
      await sleep(200);
      assert.strictEqual(got?.motel?.money, 420);
      assert.deepStrictEqual(got?.motel?.rooms?.["101"]?.furniture, ["fridge"]);
      assert.strictEqual(got?.motel?.game?.rating, 4.2);
    });

    it("answers a save with an ack (the franchise) once it is stored", async () => {
      const fake = fakePlayers();
      __setPlayersForTest(fake);
      const room = await colyseus.createRoom<WorldState>("world", {});
      const c = await colyseus.connectTo(room, { userId: "f1", username: "Owner" });
      c.onMessage("noProgress", () => {});
      const acks: any[] = [];
      c.onMessage("saved", (m: any) => acks.push(m));
      fake.release();
      await sleep(150);
      c.send("saveProgress", { motel: { money: 1 }, ack: "bad ack!" }); // not echoed
      c.send("saveProgress", { motel: { money: 2 } }); // no ack, no answer
      await sleep(100);
      c.send("saveProgress", { motel: { money: 360, game: { franchise: { level: 1, run: 0 } } }, ack: "f123" });
      await sleep(200);
      assert.deepStrictEqual(acks, [{ ack: "f123", stored: true }]);
      assert.strictEqual((fake.docs.get("f1") as any).motel.game.franchise.level, 1);
    });

    it("tells a franchise ack it was not stored without a database", async () => {
      __setPlayersForTest(null);
      const room = await colyseus.createRoom<WorldState>("world", {});
      const c = await colyseus.connectTo(room, { userId: "f2", username: "Owner" });
      c.onMessage("noProgress", () => {});
      let ack: any = null;
      c.onMessage("saved", (m: any) => (ack = m));
      await sleep(150);
      c.send("saveProgress", { motel: { money: 360 }, ack: "f9" });
      await sleep(150);
      assert.deepStrictEqual(ack, { ack: "f9", stored: false });
    });
  });
});
