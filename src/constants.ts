// Keep in step with the client's src/config.js by hand.
// Players per room = motel plots on the road (client PLOTS.count: 3 per side of the main road).
// Also the Legion deploy's seatCap (.github/workflows/deploy.yml reads it from here).
export const ROOM_MAX_CLIENTS = 6;
export const PLOT_COUNT = ROOM_MAX_CLIENTS;

// Longest accepted strings.
export const NAME_MAX = 64;
// Profile picture URL (Bloxity `pfp`), relayed so other players can draw it.
export const PFP_MAX_LEN = 512;
// Presence (presence.ts): the Bloxity avatar JSON relayed for the others to draw, the most pets
// drawn per player, and the pose bounds (|x|, |y| and z up to `xy` m; z down to -`z` m: a race's
// track runs far down -Z; speed in m/s).
export const AVATAR_MAX_LEN = 6000;
// Boxity outfit key (the character kit dresses a remote rig from it) and emote catalogue id.
export const OUTFIT_MAX_LEN = 256;
export const EMOTE_ID_MAX = 64;
// The roster's `motel` view (motelView.ts): what the others draw of a player's motel.
export const MOTEL_VIEW_MAX_LEN = 8000;
export const PRESENCE_PETS_MAX = 8;
export const POSE_BOUNDS = { xy: 5000, z: 1e8, speed: 2000 };

// Colyseus drops the whole connection for a WebSocket message above this (default 4 KB).
export const MAX_PAYLOAD_BYTES = 128 * 1024;

// How long a dropped connection (WiFi blip, backgrounded tab) may reconnect with the same session.
export const RECONNECT_SECONDS = 20;

// Upper bounds for saved values, so a forged payload cannot store a bogus number. Generous
// ceilings, not game rules: the dearest engine costs ~3.6e28 Wins (client ENGINE gems).
export const CURRENCY_MAX = 1e33; // trophies (Wins), gems, lightning (energy)
export const REBIRTHS_MAX = 1e9;
export const DISTANCE_MAX = 1e15; // personal best race distance, studs
export const PLAY_SECONDS_MAX = 31_536_000; // ~1 year

// Owned catalog ids (client BOATS.list ~20, ENGINE ~34, PARTNER ~20, TRAILS ~29), with slack.
export const OWNED_MAX = 256;
// Pets (client PETS): at most PETS_MAX owned, PET_TIERS_MAX craft tiers, slots / storage the
// counters can grow to.
export const PETS_MAX = 1000;
export const PET_TIERS_MAX = 16;
export const PET_SLOTS_MAX = 50;
// Online Gifts (client GIFTS.list, 12 of them): claimed indexes and potion counts.
export const GIFTS_MAX = 64;
export const POTION_KINDS_MAX = 32;
export const POTION_COUNT_MAX = 1e9;
// Daily Reward (client DAILY.days): days in one calendar cycle.
export const DAILY_DAYS = 7;

// Spin wheel (client SPIN in config.js; spin.ts): one free spin every SPIN_EVERY_MS, stored up
// to SPIN_CAP; a new player starts with SPIN_START. SPINS_MAX bounds a saved count.
export const SPIN_EVERY_MS = 15 * 60 * 1000;
export const SPIN_CAP = 5;
export const SPIN_START = 1;
export const SPINS_MAX = 1e6;
// The wedges' prizes and odds (weights in %). Ids match the client's SPIN.wedges; the client
// decides what each prize is, the server only which one is won.
export const SPIN_WEDGES = [
  { id: "doubleWins", weight: 35 },
  { id: "wins50", weight: 25 },
  { id: "luck", weight: 35 },
  { id: "wins250", weight: 4.9 },
  { id: "hugePet", weight: 0.1 },
] as const;

// Leaderboards (leaderboard.ts; client plaza.js boards): the saved doc fields ranked (Rebirth,
// Wins, Power, Playtime), rows per board and how often the lists are re-read and re-sent.
export const LEADERBOARD_STATS = ["rebirths", "trophies", "energy", "playtime"] as const;
export type LeaderboardStat = (typeof LEADERBOARD_STATS)[number];
export const LEADERBOARD_SIZE = 10;
export const LEADERBOARD_EVERY_MS = 60 * 1000;

// Ids from the client's catalogs (boats, engines incl. `ladder-N`, partners, trails, pet kinds,
// potions): camelCase slugs, so nothing odd is stored.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
// `saveProgress` ack (client net.js franchiseAndReload): echoed back in `saved` { ack, stored }.
export const ACK_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

// The client's per-browser fallback id for players who are not signed in to Bloxity.
// Guests are never persisted.
export const GUEST_ID_PREFIX = "guest-";

// The motel save (motel.ts; client src/economy.js snapshot): catalog ids owned / counted (with
// slack over the client's ~40), room numbers up to MOTEL_ROOM_MAX (101..207 today), levels, charges,
// timers at most MOTEL_FUTURE_MS ahead (the longest cash investment is 1 h), the offline income
// rate ($/s), and the gameplay modules' free-form `game` sections (bytes of JSON, nesting depth).
export const MOTEL_IDS_MAX = 128;
export const MOTEL_ROOMS_MAX = 64;
export const MOTEL_ROOM_MAX = 999;
// Furniture in use per room: one per slot (client DECOR.items has 16 slots today), with slack.
export const MOTEL_FURNITURE_MAX = 32;
export const MOTEL_LEVEL_MAX = 100;
export const MOTEL_CHARGES_MAX = 1e6;
export const MOTEL_FUTURE_MS = 7 * 24 * 3600 * 1000;
export const MOTEL_RATE_MAX = 1e12;
export const MOTEL_GAME_MAX_BYTES = 32 * 1024;
export const MOTEL_GAME_MAX_DEPTH = 8;
