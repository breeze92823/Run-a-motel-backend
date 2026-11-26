import { schema, t, type SchemaType } from "@colyseus/schema";

// The live roster: who is in the room. Durable progress lives in Mongo (src/db.ts).
// To sync something new about a player, add a field here and accept it in a WorldRoom message.
export const PlayerState = schema(
  {
    username: t.string().default(""), // client-reported Bloxity displayName/username, not validated
    signedIn: t.boolean().default(false), // has a Bloxity id: only signed-in players are saved
    pfp: t.string().default(""), // Bloxity profile picture URL ("" = none), for the others' racer heads
    racing: t.boolean().default(false), // in a race right now (`race` message)
    distance: t.float64().default(0), // this race's distance so far, studs
    // Presence (presence.ts, `pose` / `loadout` / `setAvatar`): what the others draw in the world.
    x: t.float64().default(0), // feet position in track coordinates (z minus the race scroll)
    y: t.float64().default(0),
    z: t.float64().default(0),
    yaw: t.float32().default(0), // heading, rad (PI = facing the gate)
    speed: t.float32().default(0), // m/s, for flames and dead reckoning
    boat: t.string().default(""), // equipped catalog ids (client config.js), "" = none / default
    engine: t.string().default(""),
    trail: t.string().default(""),
    partner: t.string().default(""),
    pets: t.string().default(""), // equipped pets "kind:tier,kind:tier"
    world: t.string().default(""), // the world the player is in (client WORLDS id), "" = the start world
    avatar: t.string().default(""), // Bloxity look JSON { equipped, proportions, skin }, "" = default
    // Run a Motel: the plot (0..PLOT_COUNT-1, client PLOTS) this player's motel stands on, -1 until
    // assigned; x/y/z/yaw are then feet + heading in that plot's own frame (the client places it).
    plot: t.int8().default(-1),
    grounded: t.boolean().default(true), // on the ground (the others' animator: run vs airborne)
    outfit: t.string().default(""), // Boxity outfit key: the character kit dresses the others' copy
    emote: t.string().default(""), // the Boxity emote id playing now ("" = none)
    motel: t.string().default(""), // what the others draw of this motel (motelView.ts), "" = fresh
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const WorldState = schema(
  {
    players: t.map(PlayerState), // keyed by sessionId
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
