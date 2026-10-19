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
  /** M4-07: game seconds the anomaly of the day still settles in (no buyers, no «sell now»); missing = none. */
  hold?: number;
  /** M4-25: a mark from hatching (species.json marks); missing = none. */
  mark?: string;
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
  /** M4-06: coins earned when the shop moved to its current city (the next move counts from here). */
  cityEarnedAt: number;
  /** M4-07: the day of the device and its goals: the stats at the day's start, the goals picked, what is claimed, the daily egg taken. */
  daily: { day: string; base: Record<string, number>; goals: string[]; claimed: string[]; egg: boolean };
  /** M4-05: the guest zone of the pickup point — decorations standing; unpaid: the upkeep failed (the bonus waits); due: upkeep owed (< 1 coin). */
  guest: { items: string[]; unpaid: boolean; due: number };
  /** xp — reputation points of the seller level (UB-08); saves made before it count their deals. */
  stats: { deals: number; coinsEarned: number; hatched: number; taps: number; levelUps: number; haggles: number; xp?: number; dealsAll?: number; income?: number };
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
  /** «Chats» (M3-08): buyers' messages, newest last; and seconds until a buyer writes about each creature on sale. */
  chats: Chat[];
  chatIn: Record<string, number>;
  /** The market (M3-09): the lots and game seconds until the sellers bring new ones. */
  market: { lots: Lot[]; refreshIn: number };
  /** «Gifts» (M3-11): communities and the review rewarded once; the 7 days — rewards taken so far and the last local date taken. */
  gifts: { subscribed: Record<string, boolean>; reviewed: boolean; days: number; lastDay: string };
  /** Side job level (M3-12), from 1. */
  work: number;
  /** Promo codes already used (M3-13). */
  codes: string[];
}

export interface Order {
  species: string;
  level: number;
  reward: number;
  left: number;
  person: number;
}

/** One line of a chat (M3-08): the buyer's line by context and index in customers.json, or the player's answer; n — coins. */
export interface ChatLine {
  from: 'them' | 'me';
  ctx: string;
  i: number;
  n?: number;
}
/** A buyer writing about a creature on sale (docs/01 §3 p. 13). */
export interface Chat {
  id: number;
  uid: string;
  species: string;
  person: number;
  character: string;
  hobby: string;
  offer: number;
  countered: boolean;
  state: 'open' | 'sold' | 'gone';
  unread: boolean;
  lines: ChatLine[];
  /** The buyer's type (UB-05): a district customer id of customers.json, 'golden' for the event buyer; '' in chats saved before UB. */
  customer?: string;
  /** The chat is about the collector's order on the board: the offer is at least the reward. */
  order?: boolean;
  /** Game seconds the chat has been open (the seller helper answers after delaySec). */
  age?: number;
}

/** A lot on the market (M3-09): a creature from a seller-character; price in coins; sold lots stay greyed until the refresh. */
export interface Lot {
  id: number;
  species: string;
  level: number;
  price: number;
  person: number;
  character: string;
  hobby: string;
  sold: boolean;
  /** Seller chat (M3-10): the discount for a shared hobby was given; the bargain was tried. */
  hobbyDone: boolean;
  bargained: boolean;
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
    cityEarnedAt: 0,
    guest: { items: [], unpaid: false, due: 0 },
    daily: { day: '', base: {}, goals: [], claimed: [], egg: false },
    stats: { deals: 0, coinsEarned: 0, hatched: 0, taps: 0, levelUps: 0, haggles: 0, xp: 0, dealsAll: 0, income: 0 },
    settings: { sound: true, lang: null },
    flags: {},
    secrets: {},
    order: null,
    myEggs: {},
    freeIn: {},
    chats: [],
    chatIn: {},
    market: { lots: [], refreshIn: 0 },
    gifts: { subscribed: {}, reviewed: false, days: 0, lastDay: '' },
    work: 1,
    codes: [],
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
      .map((o) => ({ uid: o.uid as string, species: o.species as string, level: Math.max(1, num(o.level, 1)), fed: Math.max(0, num(o.fed, 0)), hatchedAt: num(o.hatchedAt, 0), age: Math.max(0, num(o.age, 0)), mult: Math.max(1, num(o.mult, 1)), ...(typeof o.askShare === 'number' && Number.isFinite(o.askShare) ? { askShare: o.askShare } : {}), ...(num(o.hold, 0) > 0 ? { hold: num(o.hold, 0) } : {}), ...(typeof o.mark === 'string' && o.mark ? { mark: o.mark } : {}) })),
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
    cityEarnedAt: Math.max(0, num(r.cityEarnedAt, 0)),
    daily: (() => {
      const d = rec(r.daily);
      return { day: str(d.day, ''), base: numberMap(d.base), goals: arr(d.goals).filter((x): x is string => typeof x === 'string'), claimed: arr(d.claimed).filter((x): x is string => typeof x === 'string'), egg: bool(d.egg, false) };
    })(),
    guest: {
      items: arr(rec(r.guest).items).filter((x): x is string => typeof x === 'string'),
      unpaid: bool(rec(r.guest).unpaid, false),
      due: Math.max(0, num(rec(r.guest).due, 0)),
    },
    stats: {
      deals: num(st.deals, 0),
      coinsEarned: num(st.coinsEarned, 0),
      hatched: num(st.hatched, 0),
      taps: num(st.taps, 0),
      levelUps: num(st.levelUps, 0),
      haggles: num(st.haggles, 0),
      xp: Math.max(0, num(st.xp, num(st.deals, 0))),
      // M4-20: deals in all cities (a move to a new city starts the city's own count over).
      dealsAll: Math.max(num(st.dealsAll, 0), num(st.deals, 0)),
      // FB-02: coins a minute of live play (a moving average): free rewards are measured in it.
      income: Math.max(0, num(st.income, 0)),
    },
    settings: { sound: bool(set.sound, true), lang: lang === 'ru' || lang === 'en' ? lang : null },
    flags: Object.fromEntries(Object.entries(rec(r.flags)).filter(([, v]) => v === true).map(([k]) => [k, true])),
    secrets: numberMap(r.secrets),
    order: normalizeOrder(r.order),
    myEggs: Object.fromEntries(Object.entries(numberMap(r.myEggs)).filter(([, n]) => n >= 1).map(([k, n]) => [k, Math.floor(n)])),
    freeIn: Object.fromEntries(Object.entries(numberMap(r.freeIn)).map(([k, n]) => [k, Math.max(0, n)])),
    chats: arr(r.chats).map(normalizeChat).filter((c): c is Chat => c !== null),
    chatIn: numberMap(r.chatIn),
    market: normalizeMarket(r.market),
    work: Math.max(1, Math.floor(num(r.work, 1))),
    codes: arr(r.codes).filter((x): x is string => typeof x === 'string'),
    gifts: (() => {
      const g = rec(r.gifts);
      return {
        subscribed: Object.fromEntries(Object.entries(rec(g.subscribed)).filter(([, x]) => x === true).map(([k]) => [k, true])),
        reviewed: bool(g.reviewed, false),
        days: Math.max(0, Math.floor(num(g.days, 0))),
        lastDay: str(g.lastDay, ''),
      };
    })(),
  };
}

function normalizeMarket(v: unknown): { lots: Lot[]; refreshIn: number } {
  const o = rec(v);
  const lots = arr(o.lots)
    .map((x) => rec(x))
    .filter((x) => typeof x.species === 'string' && typeof x.character === 'string')
    .map((x) => ({
      id: Math.floor(num(x.id, 0)),
      species: x.species as string,
      level: Math.max(1, Math.floor(num(x.level, 1))),
      price: Math.max(1, num(x.price, 1)),
      person: Math.floor(num(x.person, 0)),
      character: x.character as string,
      hobby: str(x.hobby, ''),
      sold: bool(x.sold, false),
      hobbyDone: bool(x.hobbyDone, false),
      bargained: bool(x.bargained, false),
    }));
  return { lots, refreshIn: Math.max(0, num(o.refreshIn, 0)) };
}

function normalizeChat(v: unknown): Chat | null {
  const o = rec(v);
  if (typeof o.uid !== 'string' || typeof o.character !== 'string') return null;
  const state = o.state === 'sold' || o.state === 'gone' ? o.state : 'open';
  return {
    id: Math.floor(num(o.id, 0)),
    uid: o.uid,
    species: str(o.species, ''),
    person: Math.floor(num(o.person, 0)),
    character: o.character,
    hobby: str(o.hobby, ''),
    offer: Math.max(1, num(o.offer, 1)),
    countered: bool(o.countered, false),
    state,
    unread: bool(o.unread, false),
    customer: str(o.customer, ''),
    order: bool(o.order, false),
    age: Math.max(0, num(o.age, 0)),
    lines: arr(o.lines)
      .map((l) => rec(l))
      .filter((l) => (l.from === 'them' || l.from === 'me') && typeof l.ctx === 'string')
      .map((l) => ({ from: l.from as 'them' | 'me', ctx: l.ctx as string, i: Math.floor(num(l.i, 0)), ...(typeof l.n === 'number' ? { n: l.n } : {}) })),
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
