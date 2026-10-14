// What: SaveData — everything that survives a reload (docs/02-tech.md, section 4.3): schema v1, defaults, parse, serialize.
// Called by: src/sim/* (reads and writes state), src/sim/migrate.ts, src/platform/persist.ts, tests/save.test.ts.
// Keep: a new field always gets a default in newSave() and normalize(); a changed meaning bumps SAVE_VERSION with a migration.

export const SAVE_VERSION = 1;
export const SAVE_LIMIT_BYTES = 100 * 1024;
export const SAVE_TARGET_BYTES = 50 * 1024;

export type Lang = 'ru' | 'en';

export interface Creature {
  uid: string;
  species: string;
  level: number;
  /** Taps toward the next level. */
  fed: number;
  hatchedAt: number;
  /** Game seconds on the showcase: the price grows with it (docs/01, section 3.5). */
  age: number;
  /** Price multiplier from the egg it hatched from (eggs.json valueMult: the ×10 egg ladder). */
  mult?: number;
  /** The asking price on the price slider as a share of the appraisal (M3-06); missing = the market price (1). */
  askShare?: number;
}

export interface Incubator {
  egg: string | null;
  startedAt: number;
  /** Seconds of hatching already done, taps included. */
  progress: number;
  /** Game seconds since the egg started (the floor of minHatchSec counts these). */
  elapsed: number;
  /** The starter egg waits for the first tap before its timer runs (docs/01, section 4). */
  waiting: boolean;
  /** Egg care (docs/01 §3 p. 12): warming taps while hatching, portions of food, seconds ready and waiting for a tap. */
  careTaps?: number;
  careFed?: number;
  ripeSec?: number;
}

export interface CollectionEntry {
  seen: number;
  hatched: number;
  sold: number;
}

export interface SaveData {
  v: number;
  rev: number;
  savedAt: number;
  createdAt: number;
  lastSeenAt: number;
  coins: number;
  crystals: number;
  collectionPoints: number;
  incubators: Incubator[];
  creatures: Creature[];
  /** Creature uids on the showcase, in slot order. */
  showcase: string[];
  upgrades: Record<string, number>;
  helpers: Record<string, number>;
  collection: Record<string, CollectionEntry>;
  calendar: { lastDailyAt: number; streak: number; lastLoginDay: string };
  prestige: number;
  stats: { deals: number; coinsEarned: number; hatched: number; taps: number; levelUps: number; haggles: number };
  settings: { sound: boolean; lang: Lang | null };
  /** Once-per-player analytics flags and tutorial marks. */
  flags: Record<string, boolean>;
  /** Taps on shop things for the easter eggs (docs/01b, section 2): sign, door, lamp. */
  secrets: Record<string, number>;
  /** The collector's order on the board (docs/01b, section 5.3): species, level at least, reward, game seconds left, who asks. */
  order: Order | null;
  /** «My eggs» (docs/01 §3 p. 12; M3-04): bought or given eggs waiting for an incubator, by egg id. */
  myEggs: Record<string, number>;
  /** Game seconds until each free egg comes back (eggs.json freeEverySec); missing = ready now. */
  freeIn: Record<string, number>;
}

export interface Order {
  species: string;
  level: number;
  reward: number;
  left: number;
  person: number;
}

export function emptyIncubator(): Incubator {
  return { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false, careTaps: 0, careFed: 0, ripeSec: 0 };
}

export function newSave(now: number): SaveData {
  return {
    v: SAVE_VERSION,
    rev: 0,
    savedAt: now,
    createdAt: now,
    lastSeenAt: now,
    coins: 0,
    crystals: 0,
    collectionPoints: 0,
    incubators: [emptyIncubator()],
    creatures: [],
    showcase: [],
    upgrades: {},
    helpers: {},
    collection: {},
    calendar: { lastDailyAt: 0, streak: 0, lastLoginDay: '' },
    prestige: 0,
    stats: { deals: 0, coinsEarned: 0, hatched: 0, taps: 0, levelUps: 0, haggles: 0 },
    settings: { sound: true, lang: null },
    flags: {},
    secrets: {},
    order: null,
    myEggs: {},
    freeIn: {},
  };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(rec(v))) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  return out;
}

/** Fills every missing or broken field of a v-current save with its default; never throws. */
export function normalize(raw: unknown, now: number): SaveData {
  const r = rec(raw);
  const d = newSave(now);
  const cal = rec(r.calendar);
  const st = rec(r.stats);
  const set = rec(r.settings);
  const lang = set.lang;
  return {
    v: SAVE_VERSION,
    rev: Math.max(0, Math.floor(num(r.rev, 0))),
    savedAt: num(r.savedAt, d.savedAt),
    createdAt: num(r.createdAt, d.createdAt),
    lastSeenAt: num(r.lastSeenAt, d.lastSeenAt),
    coins: Math.max(0, num(r.coins, 0)),
    crystals: Math.max(0, num(r.crystals, 0)),
    collectionPoints: Math.max(0, num(r.collectionPoints, 0)),
    incubators: arr(r.incubators).length
      ? arr(r.incubators).map((i) => {
          const o = rec(i);
          const egg = typeof o.egg === 'string' ? o.egg : null;
          return {
            egg,
            startedAt: num(o.startedAt, 0),
            progress: Math.max(0, num(o.progress, 0)),
            elapsed: Math.max(0, num(o.elapsed, 0)),
            waiting: egg !== null && bool(o.waiting, false),
            careTaps: Math.max(0, num(o.careTaps, 0)),
            careFed: Math.max(0, num(o.careFed, 0)),
            ripeSec: Math.max(0, num(o.ripeSec, 0)),
          };
        })
      : d.incubators,
    creatures: arr(r.creatures)
      .map((c) => rec(c))
      .filter((o) => typeof o.uid === 'string' && typeof o.species === 'string')
      .map((o) => ({ uid: o.uid as string, species: o.species as string, level: Math.max(1, num(o.level, 1)), fed: Math.max(0, num(o.fed, 0)), hatchedAt: num(o.hatchedAt, 0), age: Math.max(0, num(o.age, 0)), mult: Math.max(1, num(o.mult, 1)), ...(typeof o.askShare === 'number' && Number.isFinite(o.askShare) ? { askShare: o.askShare } : {}) })),
    showcase: arr(r.showcase).filter((x): x is string => typeof x === 'string'),
    upgrades: numberMap(r.upgrades),
    helpers: numberMap(r.helpers),
    collection: Object.fromEntries(
      Object.entries(rec(r.collection)).map(([k, v]) => {
        const o = rec(v);
        return [k, { seen: num(o.seen, 0), hatched: num(o.hatched, 0), sold: num(o.sold, 0) }];
      }),
    ),
    calendar: { lastDailyAt: num(cal.lastDailyAt, 0), streak: num(cal.streak, 0), lastLoginDay: str(cal.lastLoginDay, '') },
    prestige: Math.max(0, num(r.prestige, 0)),
    stats: {
      deals: num(st.deals, 0),
      coinsEarned: num(st.coinsEarned, 0),
      hatched: num(st.hatched, 0),
      taps: num(st.taps, 0),
      levelUps: num(st.levelUps, 0),
      haggles: num(st.haggles, 0),
    },
    settings: { sound: bool(set.sound, true), lang: lang === 'ru' || lang === 'en' ? lang : null },
    flags: Object.fromEntries(Object.entries(rec(r.flags)).filter(([, v]) => v === true).map(([k]) => [k, true])),
    secrets: numberMap(r.secrets),
    order: normalizeOrder(r.order),
    myEggs: Object.fromEntries(Object.entries(numberMap(r.myEggs)).filter(([, n]) => n >= 1).map(([k, n]) => [k, Math.floor(n)])),
    freeIn: Object.fromEntries(Object.entries(numberMap(r.freeIn)).map(([k, n]) => [k, Math.max(0, n)])),
  };
}

function normalizeOrder(v: unknown): Order | null {
  const o = rec(v);
  if (typeof o.species !== 'string') return null;
  return { species: o.species, level: Math.max(1, num(o.level, 1)), reward: Math.max(1, num(o.reward, 1)), left: Math.max(0, num(o.left, 0)), person: Math.floor(num(o.person, 0)) };
}

export function serialize(save: SaveData): string {
  return JSON.stringify(save);
}

/** JSON text → raw object, or null for anything that is not a save envelope (corrupted text, wrong shape). */
export function parseSave(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const o: unknown = JSON.parse(text);
    if (o && typeof o === 'object' && !Array.isArray(o) && typeof (o as { v?: unknown }).v === 'number') return o as Record<string, unknown>;
  } catch {
    /* corrupted */
  }
  return null;
}

/** UTF-16 code units of the serialized save (what the platforms count). */
export function saveSize(save: SaveData): number {
  return serialize(save).length;
}
