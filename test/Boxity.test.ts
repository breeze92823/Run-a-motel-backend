import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { __setPlayersForTest } from "../src/db.js";
import { __setFetchForTest, boxity } from "../src/boxity.js";
import { sanitizeMotel } from "../src/motel.js";
import { earnedBadges, statValues } from "../src/reports.js";
import { roomStars } from "../src/stars.js";
import { fakePlayers, sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

// A fake Boxity API: game-token/verify knows two tokens, ads/reward/verify one reward token.
const calls: { url: string; body: any; auth: string }[] = [];
function fakeBoxity(carriedFrom: string[] = []) {
  calls.length = 0;
  __setFetchForTest((async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    const auth = init.headers?.authorization ?? "";
    calls.push({ url, body, auth });
    const json = (status: number, j: unknown) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/v1/auth/game-token/verify")) {
      if (auth === "Bearer good") return json(200, { valid: true, user: { _id: "acc1", username: "ann", displayName: "Ann", pfp: "https://x/p.png" }, carriedFrom });
      return json(401, { valid: false });
    }
    if (url.endsWith("/v1/ads/reward/verify")) return json(200, body.rewardToken === "rw1" ? { valid: true, placement: "double-cash" } : { valid: false, reason: "unknown" });
    return json(404, {});
  }) as typeof fetch);
}

describe("boxity integration", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());
  afterEach(() => {
    __setPlayersForTest(null);
    __setFetchForTest(null);
    boxity.gameId = "";
  });

  it("saves under the verified Boxity id, never a named one", async () => {
    fakeBoxity();
    const fake = fakePlayers();
    __setPlayersForTest(fake);
    boxity.gameId = "run-a-motel"; // a deployed pod: client-named ids are not trusted
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { token: "good", userId: "someone-else", username: "Fake" });
    c.onMessage("noProgress", () => {});
    fake.release();
    await sleep(150);
    assert.strictEqual(room.state.players.get(c.sessionId)?.username, "Ann", "the verified name wins");
    c.send("saveProgress", { motel: { money: 99 } });
    await sleep(150);
    assert.ok(fake.docs.has("acc1"));
    assert.ok(!fake.docs.has("someone-else"));
    assert.strictEqual(calls[0].body.gameSlug, boxity.gameSlug);
  });

  it("treats a missing or refused token as a guest when deployed", async () => {
    fakeBoxity();
    const fake = fakePlayers();
    __setPlayersForTest(fake);
    boxity.gameId = "run-a-motel";
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { token: "forged", userId: "victim" });
    c.onMessage("noProgress", () => {});
    fake.release();
    await sleep(150);
    c.send("saveProgress", { motel: { money: 1 } });
    await sleep(150);
    assert.strictEqual(fake.docs.size, 0, "nothing saved for a guest");
    assert.strictEqual(room.state.players.get(c.sessionId)?.signedIn, false);
  });

  it("carries a guest's motel into a new account once", async () => {
    fakeBoxity(["guestA"]);
    const motel = sanitizeMotel({ money: 777, rooms: { 101: { open: true, furniture: [] } } })!;
    const fake = fakePlayers([{ _id: "guestA", motel, version: 1, updatedAt: new Date() }]);
    __setPlayersForTest(fake);
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, { token: "good" });
    let got: any = null;
    c.onMessage("progress", (m: any) => (got = m));
    fake.release();
    await sleep(200);
    assert.strictEqual(got?.motel?.money, 777);
    assert.strictEqual((fake.docs.get("acc1") as any)?.carriedFrom, "guestA");
    assert.strictEqual((fake.docs.get("guestA") as any)?.carriedTo, "acc1");
  });

  it("checks a rewarded ad's token on the server", async () => {
    fakeBoxity();
    const room = await colyseus.createRoom<WorldState>("world", {});
    const c = await colyseus.connectTo(room, {});
    c.onMessage("noProgress", () => {});
    const results: any[] = [];
    c.onMessage("adRewardResult", (m: any) => results.push(m));
    c.send("adReward", { rewardToken: "rw1", placement: "double-cash" });
    c.send("adReward", { rewardToken: "made-up", placement: "double-cash" });
    await sleep(200);
    assert.deepStrictEqual(results.map((r) => r.ok).sort(), [false, true]);
  });

  it("rates rooms and decides ribbons and stats from the saved motel", () => {
    assert.strictEqual(roomStars([]), 1);
    assert.strictEqual(roomStars(["bed", "deskChair", "sideTable"]), 3 - 1, "3 points but no sink/tub stays at 2 stars");
    const five = ["kingBed", "loveseat", "coffeeTable", "tv", "tub", "vanity"];
    assert.strictEqual(roomStars(five), 5);
    const rooms = Object.fromEntries([101, 102, 103, 104, 105, 106].map((n) => [n, { open: true, furniture: n === 101 ? five : [] }]));
    const m = sanitizeMotel({ money: 50, earned: 2_000_000, rooms, staff: { sam: 0, rose: 2 } })!;
    assert.deepStrictEqual(earnedBadges(m).sort(), ["first-guest", "five-star", "full-house", "millionaire", "welcome"]);
    assert.deepStrictEqual(earnedBadges(sanitizeMotel({})), ["welcome"]);
    assert.deepStrictEqual(statValues(m), { cash: 50, earned: 2_000_000, rooms_open: 6, staff_hired: 2, five_star_rooms: 1 });
  });
});
