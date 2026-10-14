// What: the game itself (docs/01, sections 2–4): player commands (buyEgg, tapIncubator, ...) and the fixed-step tick over the store.
// Called by: src/main.ts (one game per page, tick from the runtime), src/test-api, scripts/balance-model.ts and tests (headless).
// Keep: commands change store.state and commit; flush on hatch, deal, purchase; content and rng come in, so Node runs it without a bundler.

import type { CustomersData, DistrictData, EggsData, EventsData, FtueData, RarityName, SecretsData, SecretTarget, SpeciesData, UpgradeData, UpgradesData } from '../content/schemas.ts';
import { RARITIES } from '../content/schemas.ts';
import { createEmitter, type Emitter } from '../core/events.ts';
import type { Rng } from '../core/rng.ts';
import { emptyIncubator, type Creature, type Incubator, type Order, type SaveData } from './state.ts';
import type { GameStore } from './store.ts';
import { careBonus, careChances, careLevel, coins, creatureValue, eggUnlocked, hatchNeedSec, hatchShare, isHatched, offerFor, pickRarity, pickSpecies, shelfBonus, tapsForLevel, unlockMet, upgradePrice, type UnlockFacts } from './rules.ts';

export interface GameContent {
  eggs: EggsData;
  species: SpeciesData;
  customers: CustomersData;
  upgrades: UpgradesData;
  ftue: FtueData;
  events: EventsData;
  secrets: SecretsData;
}

/** Step of the offline catch-up: coarse but finer than every helper timer (feeder 1 s, courier 2 s, seller 4 s). */
const OFFLINE_STEP_SEC = 0.5;

/** Customer type id of the golden event customer (style.json → customers.golden, i18n customer.golden). */
export const GOLDEN = 'golden';

const RARITIES_ALL = RARITIES;

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<RarityName, number>;

export type EventKind = EventsData['events'][number]['kind'];

/** The random event on now (docs/01b, section 3): what the scene shows and what a tap does. */
export interface EventView {
  id: string;
  kind: EventKind;
  /** Seconds left before it goes (nothing is lost). */
  left: number;
  /** Sneeze: coins to tap, positions 0..1 inside the free floor. */
  coins: Array<{ id: number; x: number; y: number }>;
  /** Sneeze: who sneezed. */
  uid: string | null;
  /** Door egg: the egg in the basket. */
  egg: string | null;
}

export interface MerchantOffer {
  discount: { egg: string; price: number; check: BuyCheck };
  mystery: { egg: string; price: number; check: BuyCheck };
}

/** Who fed a creature: the player's tap, the feeder helper, the cuckoo clock. */
export type FeedBy = 'tap' | 'helper' | 'cuckoo';

/** What the helpers did while the player was away (docs/01a, section 5: up to 8 hours at offlineRate of the live pace). */
export interface OfflineReport {
  /** Real seconds away (clamped) and the game seconds the shop worked for them. */
  awaySec: number;
  workedSec: number;
  coins: number;
  sold: number;
  hatched: number;
  levelUps: number;
}

export type DenyReason = 'coins' | 'busy' | 'full' | 'locked' | 'noDeal' | 'noCreature' | 'lastPrice' | 'max';

export type GameEvent =
  | { type: 'eggBought'; incubator: number; egg: string; price: number; by: 'player' | 'helper' | 'gift' | 'merchant' }
  | { type: 'eggTap'; incubator: number; started: boolean }
  | { type: 'eggReady'; incubator: number }
  | { type: 'eggFed'; incubator: number; price: number; level: number }
  | { type: 'hatched'; incubator: number; uid: string; species: string; rarity: RarityName }
  | { type: 'fed'; uid: string; level: number; levelUp: boolean; maxed: boolean; price: number; gain: number; by: FeedBy }
  | { type: 'customerArrived'; id: number; customer: string }
  | { type: 'customerLeft'; id: number; reason: 'sold' | 'haggle' | 'wait' }
  | { type: 'denied'; action: 'buyEgg' | 'sell' | 'haggle' | 'wait' | 'upgrade'; reason: DenyReason }
  | { type: 'upgradeBought'; id: string; level: number; price: number }
  | { type: 'ftueDone' }
  | { type: 'eggUnlocked'; egg: string }
  | { type: 'districtOpened'; district: string; customer: string }
  | { type: 'firstCrystal' }
  | { type: 'cuckoo' }
  | { type: 'eventStarted'; id: string; kind: EventKind; uid?: string | undefined }
  | { type: 'eventEnded'; id: string; kind: EventKind; outcome: 'done' | 'missed' }
  | { type: 'eventCoin'; id: number; value: number }
  | { type: 'eventGift'; coins: number }
  | { type: 'merchantOpen' }
  | { type: 'orderNew'; species: string; level: number; reward: number }
  | { type: 'orderDone'; species: string; reward: number }
  | { type: 'orderExpired'; species: string }
  | { type: 'thingTapped'; target: SecretTarget; first: string; count: number }
  | { type: 'secret'; id: string; target: SecretTarget; show: string; coins: number; repeat: boolean }
  | { type: 'upgradeUnlocked'; id: string }
  | { type: 'rescueEgg'; incubator: number }
  | { type: 'sold'; uid: string; species: string; rarity: RarityName; price: number; crystals: number; customer: string; customerId: number; haggled: boolean; by: 'player' | 'helper'; liked: boolean }
  | { type: 'customerUp'; id: number; customer: string }
  | { type: 'haggled'; customerId: number; result: 'up' | 'left'; bonus: number; offer: number }
  | { type: 'change' };

export interface IncubatorView {
  egg: string | null;
  waiting: boolean;
  /** 0..1 of hatching done. */
  share: number;
  /** Hatched and waiting for a tap (ripening, docs/01 §3 p. 12). */
  ready: boolean;
  /** Care bonus b and its shell color step (0 — the egg's own color). */
  care: number;
  careLevel: number;
  /** The next portion of food: its price, or null when the egg has had all its food. */
  feedPrice: number | null;
}

export interface CreatureView {
  uid: string;
  species: string;
  rarity: RarityName;
  level: number;
  maxLevel: number;
  /** Appraisal in whole coins at the current level. */
  price: number;
  /** Feeding taps done toward the next level and taps it needs. */
  fed: number;
  need: number;
}

export interface CustomerView {
  id: number;
  /** Customer type id from customers.json (thrifty, collector, rich; golden for the event customer). */
  customer: string;
  /** Index into customers.json → people.names (−1: the golden customer has no name), outfit color, accessory (M2-18). */
  person: number;
  outfit: string;
  accessory: string;
}

export interface DealView {
  id: number;
  customer: string;
  /** Index into people.names; −1 for the golden customer. */
  person: number;
  /** The creature fits the board order: the offer is at least the order reward. */
  order: boolean;
  /** The creature on offer (the selected one); null while the shop has none. */
  uid: string | null;
  species: string | null;
  level: number;
  offer: number;
  bargains: number;
  /** True while one more haggle is allowed. */
  canHaggle: boolean;
  /** Chance that a haggle sends this customer away, 0..1. */
  leaveChance: number;
  /** Share of the creature's price tag offered now (haggles included). */
  share: number;
}

export interface GameView {
  incubators: IncubatorView[];
  queue: CustomerView[];
  /** The front customer's offer; null when nobody stands at the counter yet. */
  deal: DealView | null;
  creatures: CreatureView[];
  /** The creature the player works with (last tapped); the deal is about it. */
  selected: string | null;
  /** Showcase places (upgrades included). */
  slots: number;
  /** Places in the customer queue (the bell adds one). */
  queueSize: number;
  /** The random event on now, or null. */
  event: EventView | null;
  /** The collector's order on the board (M2-19), or null without the board. */
  order: Order | null;
  /** Bought things the scene draws, by decor item: level bought. */
  decor: Record<string, number>;
}

export interface UpgradeView {
  id: string;
  /** Levels bought so far and the most there are. */
  level: number;
  levels: number;
  /** Price of the next level; 0 when maxed. */
  price: number;
  affordable: boolean;
  maxed: boolean;
  /** Opened since the player last looked at the shop («New!»). */
  fresh: boolean;
}

/** The nearest goal not reached yet (docs/01b, section 5.2): the «Next» card shows exactly one. */
export interface GoalView {
  kind: 'upgrade' | 'district' | 'egg' | 'rebirth';
  id: string;
  /** Progress: have of need, in coins, crystals or deals. */
  have: number;
  need: number;
  unit: 'coins' | 'crystals' | 'deals';
}

export type BuyCheck = { ok: true; incubator: number; price: number } | { ok: false; reason: DenyReason; price: number };

export interface Game {
  readonly store: GameStore;
  readonly content: GameContent;
  readonly events: Emitter<GameEvent>;
  readonly state: SaveData;
  canBuyEgg(eggId?: string): BuyCheck;
  /** Eggs on sale now (unlocked ones), cheapest first, with their purchase check. */
  eggList(): Array<{ id: string; check: BuyCheck; fresh: boolean }>;
  buyEgg(eggId?: string): boolean;
  tapIncubator(index: number): void;
  /** Egg care: one portion of food for coins (docs/01 §3 p. 12). */
  feedEgg(index: number): boolean;
  /** Feeds the creature (+1 toward its next level) and selects it. */
  tapCreature(uid: string): void;
  /** The selected creature, falling back to the first one. */
  selected(): string | null;
  tick(dt: number): void;
  view(): GameView;
  deal(): DealView | null;
  /** Sells the selected creature to the front customer at the offered price. */
  accept(): boolean;
  /** Asks for more: +bargainBonus on success, the customer leaves on failure (docs/01a, section 4). */
  haggle(): boolean;
  /** Lets the front customer go; the next one steps up after waitNextSec. */
  wait(): boolean;
  /** The shop positions of upgrades.json (shop list) with their next price. */
  upgradeList(): UpgradeView[];
  buyUpgrade(id: string): boolean;
  /** The player looked at the shop: «New!» marks go out. */
  seenShop(): void;
  /** Open district ids (yard first). */
  districts(): string[];
  /** Tap on the event thing at the door: the door egg is taken, the merchant opens his cart (merchantOpen). */
  tapEvent(): void;
  /** Tap on a sneeze coin. */
  tapEventCoin(id: number): void;
  /** What the merchant sells now; null when he is not here. */
  merchantOffer(): MerchantOffer | null;
  merchantBuy(choice: 'discount' | 'mystery'): boolean;
  /** A tap on a shop thing (sign, door, lamp): a reply always, a secret on the counter (docs/01b, section 2). */
  tapThing(target: SecretTarget): void;
  /** The nearest goal not reached yet: the one with the largest share done (shop positions, districts, eggs; rebirth when all is bought). */
  nextGoal(): GoalView;
  /** Free showcase places (creatures and eggs both take one). */
  freeSlots(): number;
  showcaseSlots(): number;
  /** The shop works on while the player is away (helpers, incubators): awaySec real seconds, clamped to offlineMaxHours, at offlineRate. */
  offline(awaySec: number): OfflineReport;
}

/** Tutorial marks in save.flags (docs/01, section 4). */
export const FLAGS = { starter: 'ftue_starter', fed: 'ftue_fed', bought: 'ftue_bought', done: 'ftue_done', crystal: 'crystal_seen' } as const;

export function createGame(store: GameStore, content: GameContent, rng: Rng): Game {
  const events = createEmitter<GameEvent>();
  /** Offline catch-up runs quiet: no events, no saves until it is done (one commit at the end). */
  let quiet = false;
  const emit = (e: GameEvent): void => {
    if (!quiet) events.emit(e);
  };
  const commit = (opts?: { flush?: boolean }): void => {
    if (!quiet) store.commit(opts);
  };
  const { eggs, species } = content;
  const basicEgg = content.ftue.starterEgg;
  const s = (): SaveData => store.state;

  const eggData = (id: string) => eggs.eggs.find((e) => e.id === id);
  const speciesData = (id: string) => species.species.find((x) => x.id === id);
  const upgradeLevel = (id: string): number => s().upgrades[id] ?? 0;
  const speedEffect = (): number => {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'hatchTime');
    return u && u.effect.type === 'hatchTime' ? upgradeLevel(u.id) * u.effect.perLevel : 0;
  };
  const needFor = (eggId: string): number => {
    const egg = eggData(eggId);
    return egg ? hatchNeedSec(egg, speedEffect()) : 0;
  };
  /** Hatched and waiting for a tap (the egg ripens meanwhile). */
  const eggReady = (inc: Incubator): boolean => !!inc.egg && !inc.waiting && isHatched(inc.progress, inc.elapsed, needFor(inc.egg), eggs);
  const careOf = (inc: Incubator): number => careBonus({ taps: inc.careTaps ?? 0, fed: inc.careFed ?? 0, ripeSec: inc.ripeSec ?? 0 }, eggs.care);
  /** One portion of egg food: a share of the egg price (at least a coin); null when fed in full or no egg. */
  const feedPrice = (inc: Incubator): number | null => {
    const egg = inc.egg ? eggData(inc.egg) : undefined;
    if (!egg || (inc.careFed ?? 0) >= eggs.care.feed.steps) return null;
    return Math.max(1, coins(egg.price.coins * eggs.care.feed.priceShare));
  };

  // Customers live only in the session (docs/01, section 3.4): the queue refills after a reload.
  interface Visitor {
    id: number;
    district: DistrictData;
    share: number;
    mult: number;
    bargains: number;
    /** The golden customer of an event: pays golden × the price tag, no haggle risk, leaves after ttl seconds. */
    golden?: number;
    ttl?: number;
    /** Who this is (M2-18): a name never twice in the queue, an outfit, an accessory. */
    person: number;
    outfit: string;
    accessory: string;
  }
  const queue: Visitor[] = [];
  let nextVisitor = 1;
  let spawnIn = content.customers.spawnEverySec;
  /** Seconds until the front customer steps up (after «wait»). */
  let frontIn = 0;

  const effectSum = (type: string): number =>
    content.upgrades.upgrades.reduce((sum, u) => (u.effect.type === type && 'perLevel' in u.effect ? sum + upgradeLevel(u.id) * u.effect.perLevel : sum), 0);
  /** Price-tag multiplier of a creature: shelf growth (radio speeds it up) and price tags (docs/01, section 3.5; docs/01b, section 5.1). */
  const valueMult = (cr: Creature): number => (cr.mult ?? 1) * (1 + shelfBonus(cr.age ?? 0, species.shelf, 1 + effectSum('shelfGrowth'))) * (1 + effectSum('appraisal'));
  /** The price tag in whole coins: level price × valueMult. */
  const appraisal = (cr: Creature): number => {
    const spec = speciesData(cr.species);
    return spec ? coins(creatureValue(spec, cr.level) * valueMult(cr)) : 0;
  };
  const baseFacts = (): UnlockFacts => {
    const st = s().stats;
    return { deals: st.deals, hatched: st.hatched, levelUps: st.levelUps ?? 0, haggles: st.haggles ?? 0, upgrades: s().upgrades, districts: [] };
  };
  /** Districts open by deals (docs/01a, section 4); a district never waits for another district (validate:content). */
  const openDistricts = (): DistrictData[] => content.customers.districts.filter((d) => unlockMet(d.unlock, baseFacts()));
  const facts = (): UnlockFacts => ({ ...baseFacts(), districts: openDistricts().map((d) => d.id) });
  /** Eggs for sale for coins (the ladder and seasonal ones); free and reward eggs come by timer or as gifts (docs/01 §3 p. 12). */
  const forSale = (e: EggsData['eggs'][number]): boolean => !e.special && (e.section === 'ladder' || e.section === 'seasonal');
  const eggOpen = (e: EggsData['eggs'][number]): boolean => forSale(e) && eggUnlocked(e, facts());
  /** Does this customer type like the creature (docs/01, section 3.5: the showcase attracts its customers). */
  const likes = (c: DistrictData['customer'], cr: Creature): boolean => {
    const spec = speciesData(cr.species);
    if (!spec) return false;
    if (c.likes === 'cheap') return spec.rarity === 'common';
    if (c.likes === 'rare') return spec.rarity !== 'common';
    return cr.level >= 3;
  };
  /** The dearest creature (the golden customer takes it: he pays a multiple of the tag). */
  const dearest = (): string | null => s().creatures.reduce<Creature | null>((best, cr) => (!best || appraisal(cr) > appraisal(best) ? cr : best), null)?.uid ?? null;
  /** The creature a customer picks from the showcase by type: thrifty the cheapest, collector the rarest, rich the highest level. */
  const favorite = (c: DistrictData['customer']): string | null => {
    const list = s().creatures.map((cr) => ({ cr, spec: speciesData(cr.species), price: appraisal(cr) }));
    if (!list.length) return null;
    const rank = (x: (typeof list)[number]): number =>
      c.likes === 'cheap' ? -x.price : c.likes === 'rare' ? RARITY_RANK[x.spec?.rarity ?? 'common'] * 1e9 + x.price : x.cr.level * 1e9 + x.price;
    return list.reduce((best, x) => (rank(x) > rank(best) ? x : best)).cr.uid;
  };
  const spawnEvery = (): number => content.customers.spawnEverySec * Math.max(0.1, 1 + effectSum('spawnRate'));
  /** Customers start coming once the shop has had its first creature (an empty first visit stays calm). */
  const shopOpen = (): boolean => s().stats.hatched > 0 || s().creatures.length > 0;

  /** A face for a new customer: a name nobody in the queue has, an outfit and an accessory (docs/01b, section 4.3). */
  function newPerson(): { person: number; outfit: string; accessory: string } {
    const people = content.customers.people;
    const taken = new Set(queue.map((v) => v.person));
    const free = people.names.map((_, i) => i).filter((i) => !taken.has(i));
    const person = free[rng.int(free.length)] ?? 0;
    return { person, outfit: people.outfits[rng.int(people.outfits.length)] ?? '', accessory: people.accessories[rng.int(people.accessories.length)] ?? 'none' };
  }

  /** Arrival weights (docs/01a, section 4): the district share, raised by the creatures on the showcase this type likes. */
  function arrivalWeights(): Array<{ district: DistrictData; weight: number }> {
    return openDistricts().map((d) => ({ district: d, weight: d.weight * (1 + d.attract * s().creatures.filter((cr) => likes(d.customer, cr)).length) }));
  }

  function spawnVisitor(): void {
    const pool = arrivalWeights();
    const total = pool.reduce((sum, x) => sum + x.weight, 0);
    let pick = rng.next() * total;
    const district = (pool.find((x) => (pick -= x.weight) < 0) ?? pool[pool.length - 1])?.district;
    if (!district) return;
    const offer = district.customer.offer;
    const roll = rng.range(offer.min, offer.max);
    // Until the first deal the offer covers the next egg (first minute: sale → «buy a new egg»).
    const share = s().stats.deals === 0 ? Math.max(roll, content.ftue.firstOfferShare) : roll;
    const v: Visitor = { id: nextVisitor++, district, share, mult: 1, bargains: 0, ...newPerson() };
    queue.push(v);
    emit({ type: 'customerArrived', id: v.id, customer: district.customer.id });
    emit({ type: 'change' });
  }

  // ---- Collector orders (docs/01b, section 5.3; M2-19): one at a time on the board, from species the player can get.
  const orderFits = (cr: Creature): boolean => {
    const o = s().order;
    return Boolean(o && owned('orders') && cr.species === o.species && cr.level >= o.level);
  };

  function newOrder(): void {
    const cfg = content.customers.orders;
    // Species of the rarities the open eggs can hatch.
    const rarities = new Set(eggs.eggs.filter(eggOpen).flatMap((e) => RARITIES_ALL.filter((r) => e.chances[r] > 0)));
    const pool = species.species.filter((x) => rarities.has(x.rarity));
    const spec = pool[rng.int(pool.length)];
    if (!spec) return;
    const top = Math.max(cfg.level.min, Math.min(cfg.level.max, spec.maxLevel));
    const level = cfg.level.min + rng.int(top - cfg.level.min + 1);
    const reward = coins(creatureValue(spec, level) * rng.range(cfg.rewardMult.min, cfg.rewardMult.max));
    const person = rng.int(content.customers.people.names.length);
    s().order = { species: spec.id, level, reward, left: cfg.minutes * 60, person };
    emit({ type: 'orderNew', species: spec.id, level, reward });
  }

  function runOrders(dt: number): void {
    const st = s();
    if (!owned('orders')) return;
    if (!st.order) {
      newOrder();
      commit();
      emit({ type: 'change' });
      return;
    }
    st.order.left -= dt;
    if (st.order.left > 0) return;
    // Missed: nothing is taken, a new collector writes a new order.
    const old = st.order.species;
    st.order = null;
    emit({ type: 'orderExpired', species: old });
  }

  function currentDeal(): DealView | null {
    const v = queue[0];
    if (!v || frontIn > 0) return null;
    const uid = selected();
    const cr = uid ? s().creatures.find((x) => x.uid === uid) : undefined;
    const spec = cr ? speciesData(cr.species) : undefined;
    const c = v.district.customer;
    const offer = !cr || !spec
      ? 0
      : v.golden
        ? coins(appraisal(cr) * v.golden * v.mult)
        : offerFor(spec, cr.level, { share: v.share, mult: v.mult, rarityBonus: c.rarityBonus, levelBonusPerLevel: c.levelBonusPerLevel, cashBonus: effectSum('bargain'), valueMult: valueMult(cr) });
    const fits = Boolean(cr && orderFits(cr));
    const order = s().order;
    const paid = fits && order ? Math.max(offer, order.reward) : offer;
    return {
      id: v.id,
      customer: v.golden ? GOLDEN : c.id,
      person: v.person,
      order: fits,
      uid: cr?.uid ?? null,
      species: cr?.species ?? null,
      level: cr?.level ?? 0,
      offer: paid,
      bargains: v.bargains,
      canHaggle: v.bargains < content.customers.bargainMax,
      leaveChance: v.golden ? 0 : Math.max(0, c.leaveOnBargain + effectSum('leaveChance')),
      share: cr && spec ? paid / appraisal(cr) : v.share * v.mult,
    };
  }

  /** The front customer leaves; the next one steps up after `delay` seconds. */
  function frontLeaves(reason: 'sold' | 'haggle' | 'wait', delay: number): void {
    const v = queue.shift();
    if (!v) return;
    frontIn = queue.length ? delay : 0;
    if (!queue.length && delay > 0) spawnIn = Math.min(spawnIn, delay);
    emit({ type: 'customerLeft', id: v.id, reason });
    if (v.golden && active?.data.kind === 'golden') endEvent(reason === 'sold' ? 'done' : 'missed');
  }

  /** The first customer of a new player comes sooner (ftue.json, firstCustomerSec). */
  let wasOpen = false;
  /** Id of the customer who last stepped up to the counter. */
  let frontSeen = 0;

  let selectedUid: string | null = null;
  function selected(): string | null {
    const list = s().creatures;
    if (selectedUid && list.some((x) => x.uid === selectedUid)) return selectedUid;
    selectedUid = list[0]?.uid ?? null;
    return selectedUid;
  }

  const queueSize = (): number => content.customers.queueSize + effectSum('queueSize');
  let decorKey = '';
  let decorCache: Record<string, number> = {};
  /** Bought upgrades that show in the shop (docs/01b, section 1.4), cached between purchases. */
  function decorLevels(): Record<string, number> {
    const key = JSON.stringify(s().upgrades);
    if (key !== decorKey) {
      decorKey = key;
      decorCache = {};
      for (const u of content.upgrades.upgrades) if (u.decor && upgradeLevel(u.id) > 0) decorCache[u.decor] = upgradeLevel(u.id);
    }
    return decorCache;
  }

  /** Showcase places: the base of the showcase upgrade plus every bought level (showcase, stool). */
  function showcaseSlots(): number {
    const n = content.upgrades.upgrades.reduce((sum, u) => (u.effect.type === 'showcaseSlots' ? sum + (u.effect.base ?? 0) + upgradeLevel(u.id) * u.effect.perLevel : sum), 0);
    return n > 0 ? n : 3;
  }
  function freeSlots(): number {
    const busy = s().creatures.length + s().incubators.filter((i) => i.egg).length;
    return Math.max(0, showcaseSlots() - busy);
  }

  type Effect = UpgradeData['effect'];
  /** The effect of a bought upgrade of this type (helpers are one-level upgrades), or null. */
  function owned<T extends Effect['type']>(type: T): Extract<Effect, { type: T }> | null {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === type && upgradeLevel(x.id) > 0);
    return u ? (u.effect as Extract<Effect, { type: T }>) : null;
  }
  const helperSellShare = (): number => owned('autoSell')?.priceShare ?? 1;
  let feedAcc = 0;
  let courierIn = 0;
  /** Seconds the front customer has stood at the counter with a creature to offer (the seller waits for the player first). */
  let counterSec = 0;
  let cuckooIn = 0;
  /** Shop positions open so far: a new one is announced once (docs/01b, section 1.7: mechanics as a reward). */
  let openShop = new Set<string>();
  let shopCheckIn = 0;
  const openShopIds = (): string[] => {
    const f = facts();
    return content.upgrades.shop.filter((id) => unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, f));
  };

  /** The cuckoo clock (docs/01b, section 5.1): every everySec all creatures get food. */
  function runClock(dt: number): void {
    const clock = owned('cuckoo');
    if (!clock) return;
    cuckooIn += dt;
    if (cuckooIn < clock.everySec) return;
    cuckooIn = 0;
    emit({ type: 'cuckoo' });
    for (const cr of [...s().creatures]) feed(cr, clock.fed, 'cuckoo');
  }

  // ---- Random events (docs/01b, section 3; M2-15): one at a time, only a plus, never in the first minute, never while away.
  type EventData = EventsData['events'][number];
  interface ActiveEvent {
    data: EventData;
    left: number;
    coins: Array<{ id: number; x: number; y: number; value: number }>;
    uid: string | null;
    egg: string | null;
  }
  let active: ActiveEvent | null = null;
  let sessionSec = 0;
  let eventIn = rng.range(content.events.firstAfterSec.min, content.events.firstAfterSec.max);
  let nextCoinId = 1;
  const randInt = (r: { min: number; max: number }): number => r.min + rng.int(r.max - r.min + 1);
  /** The egg a gift brings: the warm one when it is open, else the basic one. */
  const giftEgg = (): string => (eggs.eggs.find((e) => e.id === 'egg_warm' && eggOpen(e)) ? 'egg_warm' : basicEgg);
  /** A spot for an egg: a free incubator and a free showcase place. */
  const eggSpot = (): number => (freeSlots() > 0 ? s().incubators.findIndex((i) => !i.egg) : -1);

  function possible(e: EventData): boolean {
    if (e.weight <= 0 || sessionSec < e.fromMin * 60) return false;
    if (e.kind === 'golden' || e.kind === 'sneeze') return s().creatures.length > 0;
    return true;
  }

  function startEvent(): void {
    const pool = content.events.events.filter(possible);
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    if (!pool.length || total <= 0) return;
    let pick = rng.next() * total;
    const data = pool.find((e) => (pick -= e.weight) < 0) ?? pool[pool.length - 1]!;
    const ev: ActiveEvent = { data, left: data.durationSec, coins: [], uid: null, egg: null };
    if (data.kind === 'golden') {
      const yard = openDistricts()[0];
      if (!yard) return;
      const v: Visitor = { id: nextVisitor++, district: yard, share: 1, mult: 1, bargains: 0, golden: data.priceMult, ttl: data.durationSec, person: -1, outfit: '', accessory: 'none' };
      queue.unshift(v);
      frontIn = 0;
      emit({ type: 'customerArrived', id: v.id, customer: GOLDEN });
    } else if (data.kind === 'sneeze') {
      const list = s().creatures;
      ev.uid = list[rng.int(list.length)]?.uid ?? null;
      const st = s().stats;
      const avgSale = st.deals > 0 ? st.coinsEarned / st.deals : 0;
      const n = randInt(data.coins);
      for (let i = 0; i < n; i++) ev.coins.push({ id: nextCoinId++, x: rng.next(), y: rng.next(), value: Math.max(randInt(data.coinValue), Math.round(avgSale * data.saleShare)) });
    } else if (data.kind === 'doorEgg') ev.egg = giftEgg();
    active = ev;
    emit({ type: 'eventStarted', id: data.id, kind: data.kind, uid: ev.uid ?? undefined });
    emit({ type: 'change' });
  }

  function endEvent(outcome: 'done' | 'missed'): void {
    const ev = active;
    if (!ev) return;
    active = null;
    eventIn = rng.range(content.events.everySec.min, content.events.everySec.max);
    emit({ type: 'eventEnded', id: ev.data.id, kind: ev.data.kind, outcome });
    emit({ type: 'change' });
  }

  function runEvents(dt: number): void {
    if (!s().flags[FLAGS.done]) return;
    sessionSec += dt;
    for (const v of [...queue]) {
      if (v.ttl === undefined) continue;
      v.ttl -= dt;
      if (v.ttl > 0) continue;
      if (queue[0] === v) frontLeaves('wait', 0);
      else {
        queue.splice(queue.indexOf(v), 1);
        emit({ type: 'customerLeft', id: v.id, reason: 'wait' });
        if (active?.data.kind === 'golden') endEvent('missed');
      }
    }
    if (active) {
      active.left -= dt;
      if (active.left <= 0 && active.data.kind !== 'golden') endEvent('missed');
      return;
    }
    eventIn -= dt;
    if (eventIn <= 0) {
      eventIn = rng.range(content.events.everySec.min, content.events.everySec.max);
      startEvent();
    }
  }

  // ---- Easter eggs (docs/01b, section 2; M2-16): counters in the save, a streak for «in a row».
  let clock = 0;
  const streaks: Record<string, { n: number; at: number }> = {};

  function merchantOffer(): MerchantOffer | null {
    const ev = active;
    if (!ev || ev.data.kind !== 'merchant') return null;
    const open = eggs.eggs.filter(eggOpen).sort((a, b) => b.price.coins - a.price.coins);
    const best = open[0] ?? eggData(basicEgg)!;
    const check = (price: number): BuyCheck => {
      const incubator = eggSpot();
      if (incubator < 0) return { ok: false, reason: s().incubators.some((i) => !i.egg) ? 'full' : 'busy', price };
      if (s().coins + 1e-9 < price) return { ok: false, reason: 'coins', price };
      return { ok: true, incubator, price };
    };
    const discount = Math.max(1, Math.round(best.price.coins * (1 - ev.data.discount)));
    const mystery = eggData(ev.data.mysteryPriceOf)?.price.coins ?? 0;
    return {
      discount: { egg: best.id, price: discount, check: check(discount) },
      mystery: { egg: ev.data.mysteryEgg, price: mystery, check: check(mystery) },
    };
  }

  /** Announces shop positions that opened since the last look (flag up_new_<id> until the shop is opened). */
  function checkShop(dt: number): void {
    shopCheckIn -= dt;
    if (shopCheckIn > 0) return;
    shopCheckIn = 0.5;
    const now = openShopIds();
    const fresh = now.filter((id) => !openShop.has(id));
    openShop = new Set(now);
    for (const id of fresh) {
      s().flags[`up_new_${id}`] = true;
      emit({ type: 'upgradeUnlocked', id });
    }
    if (fresh.length) emit({ type: 'change' });
  }

  /** Helpers (docs/01, section 3.6): the feeder feeds the hungriest, the seller sells to a customer kept waiting, the courier brings eggs. */
  function runHelpers(dt: number): void {
    const st = s();
    const feeder = owned('autoFeed');
    if (feeder) {
      feedAcc += dt * feeder.tapsPerSec;
      while (feedAcc >= 1) {
        feedAcc -= 1;
        const hungry = st.creatures
          .filter((cr) => cr.level < (speciesData(cr.species)?.maxLevel ?? 0))
          .sort((a, b) => a.level - b.level || a.hatchedAt - b.hatchedAt)[0];
        if (!hungry) {
          feedAcc = 0;
          break;
        }
        feed(hungry, 1 + effectSum('feedPerTap'), 'helper');
      }
    }
    const seller = owned('autoSell');
    if (currentDeal()?.uid) {
      counterSec += dt;
      if (seller && counterSec >= seller.delaySec) {
        counterSec = 0;
        sell('helper');
      }
    } else counterSec = 0;
    const courier = owned('autoBuyEgg');
    if (courier) {
      courierIn -= dt;
      if (courierIn <= 0) {
        courierIn = courier.everySec;
        if (canBuyEgg(courier.egg).ok) buyEggBy(courier.egg, 'helper');
      }
    }
  }

  /** Adds food to a creature (a tap, the feeder, the cuckoo); true on a level up. */
  function feed(cr: Creature, food: number, by: FeedBy): boolean {
    const spec = speciesData(cr.species);
    if (!spec) return false;
    const st = s();
    const maxed = cr.level >= spec.maxLevel;
    let levelUp = false;
    const before = appraisal(cr);
    if (!maxed) {
      cr.fed += food;
      if (cr.fed >= tapsForLevel(cr.level, species.tapsPerLevelBase, species.tapGrowth)) {
        cr.fed = 0;
        cr.level += 1;
        levelUp = true;
        st.stats.levelUps = (st.stats.levelUps ?? 0) + 1;
        if (by === 'tap') st.flags[FLAGS.fed] = true;
      }
    }
    const price = appraisal(cr);
    commit();
    emit({ type: 'fed', uid: cr.uid, level: cr.level, levelUp, maxed: cr.level >= spec.maxLevel, price, gain: price - before, by });
    return levelUp;
  }

  /** Sells the deal's creature at the offer (the player's Sell, or the seller helper without haggling). */
  function sell(by: 'player' | 'helper'): boolean {
    const deal = currentDeal();
    const st = s();
    const cr = deal?.uid ? st.creatures.find((x) => x.uid === deal.uid) : undefined;
    if (!deal || !cr) {
      if (by === 'player') emit({ type: 'denied', action: 'sell', reason: deal ? 'noCreature' : 'noDeal' });
      return false;
    }
    const districtsBefore = new Set(openDistricts().map((d) => d.id));
    const eggsBefore = new Set(eggs.eggs.filter(eggOpen).map((e) => e.id));
    const share = by === 'helper' && !deal.order ? helperSellShare() : 1;
    const price = Math.max(1, Math.round(deal.offer * share));
    const haggled = deal.bargains > 0;
    const doneOrder = deal.order ? st.order : null;
    if (doneOrder) st.order = null;
    const crystals = species.crystalsPerSale[speciesData(cr.species)?.rarity ?? 'common'];
    st.crystals += crystals;
    const firstCrystal = crystals > 0 && !st.flags[FLAGS.crystal];
    if (firstCrystal) st.flags[FLAGS.crystal] = true;
    st.coins += price;
    st.stats.deals += 1;
    st.stats.coinsEarned += price;
    st.creatures = st.creatures.filter((x) => x.uid !== cr.uid);
    const districts = openDistricts().filter((d) => !districtsBefore.has(d.id));
    const opened = eggs.eggs.filter((e) => eggOpen(e) && !eggsBefore.has(e.id));
    for (const e of opened) st.flags[`egg_new_${e.id}`] = true;
    const entry = (st.collection[cr.species] ??= { seen: 1, hatched: 0, sold: 0 });
    entry.sold += 1;
    if (selectedUid === cr.uid) selectedUid = null;
    commit({ flush: true });
    const buyer = queue[0];
    const liked = buyer ? Boolean(buyer.golden) || likes(buyer.district.customer, cr) : true;
    emit({ type: 'sold', uid: cr.uid, species: cr.species, rarity: speciesData(cr.species)?.rarity ?? 'common', price, crystals, customer: deal.customer, customerId: deal.id, haggled, by, liked });
    frontLeaves('sold', 0);
    if (firstCrystal) emit({ type: 'firstCrystal' });
    if (doneOrder) emit({ type: 'orderDone', species: doneOrder.species, reward: price });
    for (const d of districts) emit({ type: 'districtOpened', district: d.id, customer: d.customer.id });
    for (const e of opened) emit({ type: 'eggUnlocked', egg: e.id });
    emit({ type: 'change' });
    return true;
  }

  function canBuyEgg(eggId = basicEgg): BuyCheck {
    const egg = eggData(eggId);
    const price = egg?.price.coins ?? 0;
    if (!egg || !eggOpen(egg)) return { ok: false, reason: 'locked', price };
    const incubator = s().incubators.findIndex((i) => !i.egg);
    if (incubator < 0) return { ok: false, reason: 'busy', price };
    if (freeSlots() <= 0) return { ok: false, reason: 'full', price };
    if (s().coins + 1e-9 < price) return { ok: false, reason: 'coins', price };
    return { ok: true, incubator, price };
  }

  function buyEggBy(eggId: string, by: 'player' | 'helper'): boolean {
    const check = canBuyEgg(eggId);
    if (!check.ok) {
      if (by === 'player') emit({ type: 'denied', action: 'buyEgg', reason: check.reason });
      return false;
    }
    s().coins -= check.price;
    if (by === 'player') {
      s().flags[FLAGS.bought] = true;
      delete s().flags[`egg_new_${eggId}`];
    }
    placeEgg(check.incubator, eggId, false);
    commit({ flush: true });
    emit({ type: 'eggBought', incubator: check.incubator, egg: eggId, price: check.price, by });
    emit({ type: 'change' });
    return true;
  }

  function placeEgg(index: number, eggId: string, waiting: boolean): void {
    const inc = s().incubators[index];
    if (!inc) return;
    Object.assign(inc, emptyIncubator(), { egg: eggId, startedAt: store.state.savedAt, waiting });
  }

  function hatch(index: number): void {
    const inc = s().incubators[index];
    const egg = inc?.egg ? eggData(inc.egg) : undefined;
    if (!inc || !egg) return;
    const st = s();
    // The first minute (docs/01, section 4): the first creature is common, the second one rare.
    const forced = st.stats.hatched === 0 ? content.ftue.firstRarity : st.stats.hatched === 1 && !st.flags[FLAGS.done] ? content.ftue.secondRarity : null;
    // The first egg of a dearer kind gives at least its firstRarity (once per kind, flag first_<egg>).
    const firstOf = egg.firstRarity && !st.flags[`first_${egg.id}`] ? egg.firstRarity : null;
    if (egg.firstRarity) st.flags[`first_${egg.id}`] = true;
    let rarity = forced ?? pickRarity(careChances(egg.chances, careOf(inc)), rng.next());
    if (!forced && firstOf && RARITY_RANK[rarity] < RARITY_RANK[firstOf]) rarity = firstOf;
    const kind = pickSpecies(species, rarity, rng.next());
    st.stats.hatched += 1;
    const uid = `c${st.stats.hatched.toString(36)}${rng.int(1296).toString(36)}`;
    st.creatures.push({ uid, species: kind.id, level: 1, fed: 0, hatchedAt: st.savedAt, age: 0, mult: egg.valueMult ?? 1 });
    const entry = (st.collection[kind.id] ??= { seen: 0, hatched: 0, sold: 0 });
    entry.seen += 1;
    entry.hatched += 1;
    Object.assign(inc, emptyIncubator());
    const done = st.stats.hatched >= 2 && !st.flags[FLAGS.done];
    if (done) st.flags[FLAGS.done] = true;
    commit({ flush: true });
    emit({ type: 'hatched', incubator: index, uid, species: kind.id, rarity: kind.rarity });
    if (done) emit({ type: 'ftueDone' });
    emit({ type: 'change' });
  }

  /** Incubators follow the incubator upgrade (1 + bought × perLevel), also for saves made before a purchase. */
  function syncIncubators(): void {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'slots');
    const want = 1 + (u && u.effect.type === 'slots' ? upgradeLevel(u.id) * u.effect.perLevel : 0);
    const list = s().incubators;
    while (list.length < want) list.push(emptyIncubator());
  }
  syncIncubators();

  function upgradeView(id: string): UpgradeView | null {
    const u = content.upgrades.upgrades.find((x) => x.id === id);
    if (!u) return null;
    const level = upgradeLevel(id);
    const maxed = level >= u.levels;
    const price = maxed ? 0 : upgradePrice(u, level);
    const wallet = u.currency === 'crystals' ? s().crystals : s().coins;
    return { id, level, levels: u.levels, price, affordable: !maxed && wallet + 1e-9 >= price, maxed, fresh: Boolean(s().flags[`up_new_${id}`]) };
  }

  // The starter egg (docs/01, section 4): already in the incubator on the very first visit, waiting for a tap.
  {
    const st = s();
    if (!st.flags[FLAGS.starter] && st.stats.hatched === 0 && st.creatures.length === 0 && st.incubators[0] && !st.incubators[0].egg) {
      placeEgg(0, basicEgg, content.ftue.starterWaitsForTap);
      st.flags[FLAGS.starter] = true;
      commit({ flush: true });
    }
  }

  openShop = new Set(openShopIds());

  const game: Game = {
    store,
    content,
    events,
    get state() {
      return s();
    },
    canBuyEgg,
    eggList() {
      return eggs.eggs
        .filter(eggOpen)
        .sort((a, b) => a.price.coins - b.price.coins)
        .map((e) => ({ id: e.id, check: canBuyEgg(e.id), fresh: Boolean(s().flags[`egg_new_${e.id}`]) }));
    },
    buyEgg(eggId = basicEgg) {
      return buyEggBy(eggId, 'player');
    },
    tapIncubator(index) {
      const inc = s().incubators[index];
      if (!inc) return;
      if (!inc.egg) {
        game.buyEgg();
        return;
      }
      s().stats.taps += 1;
      if (eggReady(inc)) {
        hatch(index);
        return;
      }
      const started = inc.waiting;
      inc.waiting = false;
      inc.progress += eggs.tapSpeedupSec;
      // Warmth (care): taps while the egg is still hatching.
      inc.careTaps = (inc.careTaps ?? 0) + 1;
      commit();
      emit({ type: 'eggTap', incubator: index, started });
    },
    feedEgg(index) {
      const inc = s().incubators[index];
      const price = inc ? feedPrice(inc) : null;
      if (!inc || price === null || s().coins < price) return false;
      s().coins -= price;
      inc.careFed = (inc.careFed ?? 0) + 1;
      commit({ flush: true });
      emit({ type: 'eggFed', incubator: index, price, level: careLevel(careOf(inc), eggs.care) });
      emit({ type: 'change' });
      return true;
    },
    tapCreature(uid) {
      const st = s();
      const cr = st.creatures.find((x) => x.uid === uid);
      if (!cr) return;
      const changed = selectedUid !== uid;
      selectedUid = uid;
      st.stats.taps += 1;
      if (feed(cr, 1 + effectSum('feedPerTap'), 'tap') || changed) emit({ type: 'change' });
    },
    selected,
    accept() {
      return sell('player');
    },
    haggle() {
      const deal = currentDeal();
      const v = queue[0];
      if (!deal || !deal.uid || !v) {
        emit({ type: 'denied', action: 'haggle', reason: deal ? 'noCreature' : 'noDeal' });
        return false;
      }
      if (!deal.canHaggle) {
        emit({ type: 'denied', action: 'haggle', reason: 'lastPrice' });
        return false;
      }
      s().stats.haggles = (s().stats.haggles ?? 0) + 1;
      counterSec = 0;
      if (rng.next() < deal.leaveChance) {
        emit({ type: 'haggled', customerId: v.id, result: 'left', bonus: 0, offer: 0 });
        frontLeaves('haggle', 0);
      } else {
        const b = content.customers.bargainBonus;
        const bonus = rng.range(b.min, b.max);
        v.mult *= 1 + bonus;
        v.bargains += 1;
        emit({ type: 'haggled', customerId: v.id, result: 'up', bonus, offer: currentDeal()?.offer ?? 0 });
      }
      emit({ type: 'change' });
      return true;
    },
    wait() {
      if (!currentDeal()) {
        emit({ type: 'denied', action: 'wait', reason: 'noDeal' });
        return false;
      }
      frontLeaves('wait', content.customers.waitNextSec);
      emit({ type: 'change' });
      return true;
    },
    tick(dt) {
      const st = s();
      for (const cr of st.creatures) cr.age = (cr.age ?? 0) + dt;
      if (frontIn > 0) {
        frontIn = Math.max(0, frontIn - dt);
        if (frontIn === 0) emit({ type: 'change' });
      }
      // A customer stepping up to the counter picks a creature by type (docs/01, section 3.5); a tap picks another.
      const front = frontIn > 0 ? undefined : queue[0];
      if (front && front.id !== frontSeen) {
        frontSeen = front.id;
        counterSec = 0;
        emit({ type: 'customerUp', id: front.id, customer: front.golden ? GOLDEN : front.district.customer.id });
        const pick = front.golden ? dearest() : favorite(front.district.customer);
        if (pick && pick !== selectedUid) {
          selectedUid = pick;
          emit({ type: 'change' });
        }
      }
      // No dead end (genre standard): an empty shop without coins for the cheapest egg gets one for free.
      if (st.creatures.length === 0 && st.incubators[0] && !st.incubators.some((i) => i.egg) && st.stats.hatched > 0) {
        const cheapest = Math.min(...eggs.eggs.filter(eggOpen).map((e) => e.price.coins));
        if (st.coins + 1e-9 < cheapest) {
          placeEgg(0, eggs.rescueEgg, false);
          commit({ flush: true });
          emit({ type: 'rescueEgg', incubator: 0 });
          emit({ type: 'change' });
        }
      }
      if (shopOpen()) {
        if (!wasOpen) {
          wasOpen = true;
          if (st.stats.deals === 0) spawnIn = content.ftue.firstCustomerSec;
        }
        if (queue.length >= queueSize()) spawnIn = spawnEvery();
        else {
          spawnIn -= dt;
          if (spawnIn <= 1e-9) {
            spawnIn += spawnEvery();
            spawnVisitor();
          }
        }
      }
      for (let i = 0; i < st.incubators.length; i++) {
        const inc = st.incubators[i]!;
        if (!inc.egg || inc.waiting) continue;
        const egg = eggData(inc.egg);
        if (!egg) {
          Object.assign(inc, emptyIncubator());
          continue;
        }
        if (eggReady(inc)) {
          // Ready: it ripens while it waits for a tap. Away and with the courier (a helper does the routine) it hatches at once,
          // as in M2; an idle shop without one hatches it after selfSec.
          inc.ripeSec = (inc.ripeSec ?? 0) + dt;
          if (quiet || owned('autoBuyEgg') || inc.ripeSec >= eggs.care.ripe.selfSec) hatch(i);
          continue;
        }
        inc.elapsed += dt;
        inc.progress += dt;
        if (eggReady(inc)) {
          inc.ripeSec = 0;
          if (quiet) hatch(i);
          else emit({ type: 'eggReady', incubator: i });
        }
      }
      runHelpers(dt);
      runClock(dt);
      runOrders(dt);
      if (!quiet) {
        clock += dt;
        checkShop(dt);
        runEvents(dt);
      }
    },
    view() {
      return {
        incubators: s().incubators.map((inc) => {
          const care = careOf(inc);
          return {
            egg: inc.egg,
            waiting: inc.waiting,
            share: inc.egg ? hatchShare(inc.progress, needFor(inc.egg)) : 0,
            ready: eggReady(inc),
            care,
            careLevel: careLevel(care, eggs.care),
            feedPrice: feedPrice(inc),
          };
        }),
        creatures: s().creatures.map((x) => {
          const spec = speciesData(x.species);
          return {
            uid: x.uid,
            species: x.species,
            rarity: spec?.rarity ?? 'common',
            level: x.level,
            maxLevel: spec?.maxLevel ?? 1,
            price: appraisal(x),
            fed: x.fed,
            need: tapsForLevel(x.level, species.tapsPerLevelBase, species.tapGrowth),
          };
        }),
        selected: selected(),
        slots: showcaseSlots(),
        queueSize: queueSize(),
        order: owned('orders') ? s().order : null,
        event: active ? { id: active.data.id, kind: active.data.kind, left: active.left, coins: active.coins.map(({ id, x, y }) => ({ id, x, y })), uid: active.uid, egg: active.egg } : null,
        decor: decorLevels(),
        queue: queue.map((v) => ({ id: v.id, customer: v.golden ? GOLDEN : v.district.customer.id, person: v.person, outfit: v.outfit, accessory: v.accessory })),
        deal: currentDeal(),
      };
    },
    deal: currentDeal,
    upgradeList() {
      const f = facts();
      return content.upgrades.shop
        .filter((id) => unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, f))
        .map(upgradeView)
        .filter((x): x is UpgradeView => x !== null);
    },
    buyUpgrade(id) {
      const listed = content.upgrades.shop.includes(id) && unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, facts());
      const view = listed ? upgradeView(id) : null;
      const u = content.upgrades.upgrades.find((x) => x.id === id);
      if (!view || !u) {
        emit({ type: 'denied', action: 'upgrade', reason: 'locked' });
        return false;
      }
      if (view.maxed || !view.affordable) {
        emit({ type: 'denied', action: 'upgrade', reason: view.maxed ? 'max' : 'coins' });
        return false;
      }
      const st = s();
      if (u.currency === 'crystals') st.crystals -= view.price;
      else st.coins -= view.price;
      st.upgrades[id] = view.level + 1;
      syncIncubators();
      commit({ flush: true });
      emit({ type: 'upgradeBought', id, level: view.level + 1, price: view.price });
      emit({ type: 'change' });
      return true;
    },
    districts() {
      return openDistricts().map((d) => d.id);
    },
    tapEvent() {
      const ev = active;
      if (!ev) return;
      if (ev.data.kind === 'merchant') {
        emit({ type: 'merchantOpen' });
        return;
      }
      if (ev.data.kind !== 'doorEgg' || !ev.egg) return;
      const st = s();
      const at = eggSpot();
      if (at >= 0) {
        placeEgg(at, ev.egg, false);
        emit({ type: 'eggBought', incubator: at, egg: ev.egg, price: 0, by: 'gift' });
      } else {
        // No room: the gift comes as the egg's price (nothing is ever lost).
        const value = eggData(ev.egg)?.price.coins ?? 0;
        st.coins += value;
        st.stats.coinsEarned += value;
        emit({ type: 'eventGift', coins: value });
      }
      commit({ flush: true });
      endEvent('done');
    },
    tapEventCoin(id) {
      const ev = active;
      const coin = ev?.coins.find((c) => c.id === id);
      if (!ev || !coin) return;
      ev.coins = ev.coins.filter((c) => c.id !== id);
      s().coins += coin.value;
      s().stats.coinsEarned += coin.value;
      commit();
      emit({ type: 'eventCoin', id, value: coin.value });
      if (!ev.coins.length) endEvent('done');
    },
    tapThing(target) {
      const st = s();
      for (const sec of content.secrets.secrets.filter((x) => x.target === target)) {
        const count = (st.secrets[sec.id] = (st.secrets[sec.id] ?? 0) + 1);
        const streak = (streaks[sec.id] ??= { n: 0, at: -Infinity });
        streak.n = clock - streak.at <= content.secrets.streakSec ? streak.n + 1 : 1;
        streak.at = clock;
        emit({ type: 'thingTapped', target, first: sec.first, count });
        sec.steps.forEach((step, i) => {
          const hit = step.streak ? streak.n === step.at : count === step.at;
          if (!hit) return;
          const flag = `secret_${sec.id}_${i}`;
          const repeat = Boolean(st.flags[flag]);
          const coinsWon = repeat ? 0 : step.coins;
          st.flags[flag] = true;
          st.coins += coinsWon;
          st.stats.coinsEarned += coinsWon;
          if (step.streak) streak.n = 0;
          emit({ type: 'secret', id: sec.id, target, show: step.show, coins: coinsWon, repeat });
        });
      }
      commit();
    },
    merchantOffer,
    merchantBuy(choice) {
      const offer = merchantOffer()?.[choice];
      if (!offer) return false;
      if (!offer.check.ok) {
        emit({ type: 'denied', action: 'buyEgg', reason: offer.check.reason });
        return false;
      }
      s().coins -= offer.price;
      placeEgg(offer.check.incubator, offer.egg, false);
      commit({ flush: true });
      emit({ type: 'eggBought', incubator: offer.check.incubator, egg: offer.egg, price: offer.price, by: 'merchant' });
      endEvent('done');
      return true;
    },
    nextGoal() {
      const st = s();
      const goals: GoalView[] = [];
      for (const u of game.upgradeList()) {
        if (u.maxed || u.affordable) continue;
        const crystals = content.upgrades.upgrades.find((x) => x.id === u.id)?.currency === 'crystals';
        goals.push({ kind: 'upgrade', id: u.id, have: crystals ? st.crystals : st.coins, need: u.price, unit: crystals ? 'crystals' : 'coins' });
      }
      for (const d of content.customers.districts) {
        if (d.unlock.type === 'deals' && st.stats.deals < d.unlock.count) goals.push({ kind: 'district', id: d.id, have: st.stats.deals, need: d.unlock.count, unit: 'deals' });
      }
      for (const e of eggs.eggs) {
        if (forSale(e) && e.unlock.type === 'deals' && st.stats.deals < e.unlock.count) goals.push({ kind: 'egg', id: e.id, have: st.stats.deals, need: e.unlock.count, unit: 'deals' });
      }
      const share = (g: GoalView): number => (g.need > 0 ? g.have / g.need : 1);
      const best = goals.reduce<GoalView | null>((a, g) => (!a || share(g) > share(a) + 1e-9 ? g : a), null);
      return best ?? { kind: 'rebirth', id: 'rebirth', have: st.stats.coinsEarned, need: content.upgrades.prestige.thresholdCoinsEarned, unit: 'coins' };
    },
    seenShop() {
      const st = s();
      let changed = false;
      for (const key of Object.keys(st.flags)) {
        if (!key.startsWith('up_new_')) continue;
        delete st.flags[key];
        changed = true;
      }
      if (changed) {
        commit();
        emit({ type: 'change' });
      }
    },
    freeSlots,
    showcaseSlots,
    offline(awaySec) {
      const st = s();
      const away = Math.max(0, Math.min(content.upgrades.offlineMaxHours * 3600, Number.isFinite(awaySec) ? awaySec : 0));
      const worked = away * content.upgrades.offlineRate;
      const before = { coins: st.coins, deals: st.stats.deals, hatched: st.stats.hatched, levelUps: st.stats.levelUps ?? 0 };
      quiet = true;
      try {
        for (let t = 0; t < worked - 1e-9; t += OFFLINE_STEP_SEC) game.tick(Math.min(OFFLINE_STEP_SEC, worked - t));
      } finally {
        quiet = false;
      }
      const report: OfflineReport = {
        awaySec: away,
        workedSec: worked,
        coins: st.coins - before.coins,
        sold: st.stats.deals - before.deals,
        hatched: st.stats.hatched - before.hatched,
        levelUps: (st.stats.levelUps ?? 0) - before.levelUps,
      };
      if (worked > 0) {
        commit({ flush: true });
        emit({ type: 'change' });
      }
      return report;
    },
  };
  return game;
}
