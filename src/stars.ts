// A room's star rating from its furniture in use: a copy of the client's src/decor/rules.js
// evaluate() star rule (comfort points per DECOR.starPoints, plus DECOR.requires), so the server
// can decide the "Five Star" ribbon from the saved motel. Keep in step with the client's
// config.js DECOR.items / starPoints / requires.
const ITEMS: Record<string, { slot: string; pts: number }> = {
  bed: { slot: "bed", pts: 2 }, kingBed: { slot: "bed", pts: 3 }, starBed: { slot: "bed", pts: 3 },
  deskChair: { slot: "seat", pts: 1 }, armchair: { slot: "seat", pts: 1 }, loveseat: { slot: "seat", pts: 2 },
  sideTable: { slot: "table", pts: 1 }, desk: { slot: "table", pts: 1 }, coffeeTable: { slot: "table", pts: 2 },
  nightstand: { slot: "night", pts: 1 },
  fileCabinet: { slot: "storage", pts: 1 }, toyChest: { slot: "storage", pts: 1 }, dresser: { slot: "storage", pts: 1 },
  bookcase: { slot: "storage", pts: 1 }, vanityTable: { slot: "storage", pts: 1 },
  tableLamp: { slot: "lamp", pts: 1 }, floorLamp: { slot: "lamp", pts: 1 },
  painting: { slot: "art", pts: 0 }, portrait: { slot: "art", pts: 1 },
  rug: { slot: "rug", pts: 0 }, persianRug: { slot: "rug", pts: 1 },
  plant: { slot: "plant", pts: 0 }, orchid: { slot: "plant", pts: 0 },
  fridge: { slot: "fridge", pts: 1 }, tv: { slot: "tv", pts: 2 }, bigTv: { slot: "tv", pts: 2 },
  radio: { slot: "gadget", pts: 1 }, floorFan: { slot: "fan", pts: 1 },
  sodaMachine: { slot: "machine", pts: 1 }, arcade: { slot: "machine", pts: 1 }, jukebox: { slot: "machine", pts: 1 },
  vanity: { slot: "vanity", pts: 1 }, tub: { slot: "tub", pts: 1 },
};
const STAR_POINTS = [0, 1, 3, 6, 10];
const REQUIRES: { stars: number; anyOf?: string[]; slotPts?: { slot: string; pts: number } }[] = [
  { stars: 3, anyOf: ["vanity", "tub"] },
  { stars: 4, anyOf: ["tv", "bigTv"] },
  { stars: 5, slotPts: { slot: "bed", pts: 3 } },
  { stars: 5, anyOf: ["tub"] },
];

export function roomStars(furniture: string[]): number {
  const slots: Record<string, string> = {};
  for (const id of furniture) if (ITEMS[id]) slots[ITEMS[id].slot] = id; // the latest id wins its slot
  const used = Object.values(slots);
  const pts = used.reduce((s, id) => s + ITEMS[id].pts, 0);
  const ok = (r: (typeof REQUIRES)[number]) =>
    r.anyOf ? r.anyOf.some((id) => used.includes(id)) : (ITEMS[slots[r.slotPts!.slot]]?.pts ?? 0) >= r.slotPts!.pts;
  let stars = 1;
  for (let s = 2; s <= 5; s++) {
    if (pts < STAR_POINTS[s - 1]) break;
    if (REQUIRES.some((r) => r.stars === s && !ok(r))) break;
    stars = s;
  }
  return stars;
}
