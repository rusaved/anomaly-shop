// What: the game itself (docs/01, sections 2–4): player commands (buyEgg, tapIncubator, ...) and the fixed-step tick over the store.
// Called by: src/main.ts (one game per page, tick from the runtime), src/test-api, scripts/balance-model.ts and tests (headless).
// Keep: commands change store.state and commit; flush on hatch, deal, purchase; content and rng come in, so Node runs it without a bundler.

import type { CustomersData, DistrictData, EggsData, FtueData, RarityName, SpeciesData, UpgradesData } from '../content/schemas.ts';
import { createEmitter, type Emitter } from '../core/events.ts';
import type { Rng } from '../core/rng.ts';
import { emptyIncubator, type SaveData } from './state.ts';
import type { GameStore } from './store.ts';
import { coins, creatureValue, hatchNeedSec, hatchShare, isHatched, offerFor, pickRarity, pickSpecies, tapsForLevel, upgradePrice } from './rules.ts';

export interface GameContent {
  eggs: EggsData;
  species: SpeciesData;
  customers: CustomersData;
  upgrades: UpgradesData;
  ftue: FtueData;
}

export type DenyReason = 'coins' | 'busy' | 'full' | 'locked' | 'noDeal' | 'lastPrice' | 'max';

export type GameEvent =
  | { type: 'eggBought'; incubator: number; egg: string; price: number }
  | { type: 'eggTap'; incubator: number; started: boolean }
  | { type: 'hatched'; incubator: number; uid: string; species: string; rarity: RarityName }
  | { type: 'fed'; uid: string; level: number; levelUp: boolean; maxed: boolean; price: number; gain: number }
  | { type: 'customerArrived'; id: number; customer: string }
  | { type: 'customerLeft'; id: number; reason: 'sold' | 'haggle' | 'wait' }
  | { type: 'denied'; action: 'buyEgg' | 'sell' | 'haggle' | 'wait' | 'upgrade'; reason: DenyReason }
  | { type: 'upgradeBought'; id: string; level: number; price: number }
  | { type: 'ftueDone' }
  | { type: 'sold'; uid: string; species: string; price: number; customer: string; customerId: number; haggled: boolean }
  | { type: 'haggled'; customerId: number; result: 'up' | 'left'; bonus: number; offer: number }
  | { type: 'change' };

export interface IncubatorView {
  egg: string | null;
  waiting: boolean;
  /** 0..1 of hatching done. */
  share: number;
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
  /** Customer type id from customers.json (thrifty, collector, rich). */
  customer: string;
}

export interface DealView {
  id: number;
  customer: string;
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
}

export interface GameView {
  incubators: IncubatorView[];
  queue: CustomerView[];
  /** The front customer's offer; null when nobody stands at the counter yet. */
  deal: DealView | null;
  creatures: CreatureView[];
  /** The creature the player works with (last tapped); the deal is about it. */
  selected: string | null;
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
}

export type BuyCheck = { ok: true; incubator: number; price: number } | { ok: false; reason: DenyReason; price: number };

export interface Game {
  readonly store: GameStore;
  readonly content: GameContent;
  readonly events: Emitter<GameEvent>;
  readonly state: SaveData;
  canBuyEgg(eggId?: string): BuyCheck;
  buyEgg(eggId?: string): boolean;
  tapIncubator(index: number): void;
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
  /** Free showcase places (creatures and eggs both take one). */
  freeSlots(): number;
  showcaseSlots(): number;
}

/** Tutorial marks in save.flags (docs/01, section 4). */
export const FLAGS = { starter: 'ftue_starter', fed: 'ftue_fed', bought: 'ftue_bought', done: 'ftue_done' } as const;

export function createGame(store: GameStore, content: GameContent, rng: Rng): Game {
  const events = createEmitter<GameEvent>();
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

  // Customers live only in the session (docs/01, section 3.4): the queue refills after a reload.
  interface Visitor {
    id: number;
    district: DistrictData;
    share: number;
    mult: number;
    bargains: number;
  }
  const queue: Visitor[] = [];
  let nextVisitor = 1;
  let spawnIn = content.customers.spawnEverySec;
  /** Seconds until the front customer steps up (after «wait»). */
  let frontIn = 0;

  const effectSum = (type: string): number =>
    content.upgrades.upgrades.reduce((sum, u) => (u.effect.type === type && 'perLevel' in u.effect ? sum + upgradeLevel(u.id) * u.effect.perLevel : sum), 0);
  const spawnEvery = (): number => content.customers.spawnEverySec * Math.max(0.1, 1 + effectSum('spawnRate'));
  /** Districts open in M1: the start ones (street and square arrive with M2-05). */
  const openDistricts = (): DistrictData[] => content.customers.districts.filter((d) => d.unlock.type === 'start');
  /** Customers start coming once the shop has had its first creature (an empty first visit stays calm). */
  const shopOpen = (): boolean => s().stats.hatched > 0 || s().creatures.length > 0;

  function spawnVisitor(): void {
    const pool = openDistricts();
    const district = pool[rng.int(pool.length)];
    if (!district) return;
    const offer = district.customer.offer;
    const roll = rng.range(offer.min, offer.max);
    // Until the first deal the offer covers the next egg (first minute: sale → «buy a new egg»).
    const share = s().stats.deals === 0 ? Math.max(roll, content.ftue.firstOfferShare) : roll;
    const v: Visitor = { id: nextVisitor++, district, share, mult: 1, bargains: 0 };
    queue.push(v);
    events.emit({ type: 'customerArrived', id: v.id, customer: district.customer.id });
    events.emit({ type: 'change' });
  }

  function currentDeal(): DealView | null {
    const v = queue[0];
    if (!v || frontIn > 0) return null;
    const uid = selected();
    const cr = uid ? s().creatures.find((x) => x.uid === uid) : undefined;
    const spec = cr ? speciesData(cr.species) : undefined;
    const c = v.district.customer;
    const offer =
      cr && spec ? offerFor(spec, cr.level, { share: v.share, mult: v.mult, rarityBonus: c.rarityBonus, levelBonusPerLevel: c.levelBonusPerLevel, cashBonus: effectSum('bargain') }) : 0;
    return {
      id: v.id,
      customer: c.id,
      uid: cr?.uid ?? null,
      species: cr?.species ?? null,
      level: cr?.level ?? 0,
      offer,
      bargains: v.bargains,
      canHaggle: v.bargains < content.customers.bargainMax,
      leaveChance: c.leaveOnBargain,
    };
  }

  /** The front customer leaves; the next one steps up after `delay` seconds. */
  function frontLeaves(reason: 'sold' | 'haggle' | 'wait', delay: number): void {
    const v = queue.shift();
    if (!v) return;
    frontIn = queue.length ? delay : 0;
    if (!queue.length && delay > 0) spawnIn = Math.min(spawnIn, delay);
    events.emit({ type: 'customerLeft', id: v.id, reason });
  }

  /** The first customer of a new player comes sooner (ftue.json, firstCustomerSec). */
  let wasOpen = false;

  let selectedUid: string | null = null;
  function selected(): string | null {
    const list = s().creatures;
    if (selectedUid && list.some((x) => x.uid === selectedUid)) return selectedUid;
    selectedUid = list[0]?.uid ?? null;
    return selectedUid;
  }

  function showcaseSlots(): number {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'showcaseSlots');
    return u && u.effect.type === 'showcaseSlots' ? u.effect.base + upgradeLevel(u.id) * u.effect.perLevel : 3;
  }
  function freeSlots(): number {
    const busy = s().creatures.length + s().incubators.filter((i) => i.egg).length;
    return Math.max(0, showcaseSlots() - busy);
  }

  function canBuyEgg(eggId = basicEgg): BuyCheck {
    const egg = eggData(eggId);
    const price = egg?.price.coins ?? 0;
    if (!egg || egg.special) return { ok: false, reason: 'locked', price };
    const incubator = s().incubators.findIndex((i) => !i.egg);
    if (incubator < 0) return { ok: false, reason: 'busy', price };
    if (freeSlots() <= 0) return { ok: false, reason: 'full', price };
    if (s().coins + 1e-9 < price) return { ok: false, reason: 'coins', price };
    return { ok: true, incubator, price };
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
    const rarity = forced ?? pickRarity(egg.chances, rng.next());
    const kind = pickSpecies(species, rarity, rng.next());
    st.stats.hatched += 1;
    const uid = `c${st.stats.hatched.toString(36)}${rng.int(1296).toString(36)}`;
    st.creatures.push({ uid, species: kind.id, level: 1, fed: 0, hatchedAt: st.savedAt });
    const entry = (st.collection[kind.id] ??= { seen: 0, hatched: 0, sold: 0 });
    entry.seen += 1;
    entry.hatched += 1;
    Object.assign(inc, emptyIncubator());
    const done = st.stats.hatched >= 2 && !st.flags[FLAGS.done];
    if (done) st.flags[FLAGS.done] = true;
    store.commit({ flush: true });
    events.emit({ type: 'hatched', incubator: index, uid, species: kind.id, rarity: kind.rarity });
    if (done) events.emit({ type: 'ftueDone' });
    events.emit({ type: 'change' });
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
    return { id, level, levels: u.levels, price, affordable: !maxed && wallet + 1e-9 >= price, maxed };
  }

  // The starter egg (docs/01, section 4): already in the incubator on the very first visit, waiting for a tap.
  {
    const st = s();
    if (!st.flags[FLAGS.starter] && st.stats.hatched === 0 && st.creatures.length === 0 && st.incubators[0] && !st.incubators[0].egg) {
      placeEgg(0, basicEgg, content.ftue.starterWaitsForTap);
      st.flags[FLAGS.starter] = true;
      store.commit({ flush: true });
    }
  }

  const game: Game = {
    store,
    content,
    events,
    get state() {
      return s();
    },
    canBuyEgg,
    buyEgg(eggId = basicEgg) {
      const check = canBuyEgg(eggId);
      if (!check.ok) {
        events.emit({ type: 'denied', action: 'buyEgg', reason: check.reason });
        return false;
      }
      s().coins -= check.price;
      s().flags[FLAGS.bought] = true;
      placeEgg(check.incubator, eggId, false);
      store.commit({ flush: true });
      events.emit({ type: 'eggBought', incubator: check.incubator, egg: eggId, price: check.price });
      events.emit({ type: 'change' });
      return true;
    },
    tapIncubator(index) {
      const inc = s().incubators[index];
      if (!inc) return;
      if (!inc.egg) {
        game.buyEgg();
        return;
      }
      const started = inc.waiting;
      inc.waiting = false;
      inc.progress += eggs.tapSpeedupSec;
      s().stats.taps += 1;
      store.commit();
      events.emit({ type: 'eggTap', incubator: index, started });
    },
    tapCreature(uid) {
      const st = s();
      const cr = st.creatures.find((x) => x.uid === uid);
      const spec = cr ? speciesData(cr.species) : undefined;
      if (!cr || !spec) return;
      const changed = selectedUid !== uid;
      selectedUid = uid;
      st.stats.taps += 1;
      const maxed = cr.level >= spec.maxLevel;
      let levelUp = false;
      const before = coins(creatureValue(spec, cr.level));
      if (!maxed) {
        cr.fed += 1;
        if (cr.fed >= tapsForLevel(cr.level, species.tapsPerLevelBase)) {
          cr.fed = 0;
          cr.level += 1;
          levelUp = true;
          st.flags[FLAGS.fed] = true;
        }
      }
      const price = coins(creatureValue(spec, cr.level));
      store.commit();
      events.emit({ type: 'fed', uid, level: cr.level, levelUp, maxed: cr.level >= spec.maxLevel, price, gain: price - before });
      if (changed || levelUp) events.emit({ type: 'change' });
    },
    selected,
    accept() {
      const deal = currentDeal();
      const st = s();
      const cr = deal?.uid ? st.creatures.find((x) => x.uid === deal.uid) : undefined;
      if (!deal || !cr) {
        events.emit({ type: 'denied', action: 'sell', reason: 'noDeal' });
        return false;
      }
      const haggled = deal.bargains > 0;
      st.coins += deal.offer;
      st.stats.deals += 1;
      st.stats.coinsEarned += deal.offer;
      st.creatures = st.creatures.filter((x) => x.uid !== cr.uid);
      const entry = (st.collection[cr.species] ??= { seen: 1, hatched: 0, sold: 0 });
      entry.sold += 1;
      if (selectedUid === cr.uid) selectedUid = null;
      store.commit({ flush: true });
      events.emit({ type: 'sold', uid: cr.uid, species: cr.species, price: deal.offer, customer: deal.customer, customerId: deal.id, haggled });
      frontLeaves('sold', 0);
      events.emit({ type: 'change' });
      return true;
    },
    haggle() {
      const deal = currentDeal();
      const v = queue[0];
      if (!deal || !deal.uid || !v) {
        events.emit({ type: 'denied', action: 'haggle', reason: 'noDeal' });
        return false;
      }
      if (!deal.canHaggle) {
        events.emit({ type: 'denied', action: 'haggle', reason: 'lastPrice' });
        return false;
      }
      if (rng.next() < deal.leaveChance) {
        events.emit({ type: 'haggled', customerId: v.id, result: 'left', bonus: 0, offer: 0 });
        frontLeaves('haggle', 0);
      } else {
        const b = content.customers.bargainBonus;
        const bonus = rng.range(b.min, b.max);
        v.mult *= 1 + bonus;
        v.bargains += 1;
        events.emit({ type: 'haggled', customerId: v.id, result: 'up', bonus, offer: currentDeal()?.offer ?? 0 });
      }
      events.emit({ type: 'change' });
      return true;
    },
    wait() {
      if (!currentDeal()) {
        events.emit({ type: 'denied', action: 'wait', reason: 'noDeal' });
        return false;
      }
      frontLeaves('wait', content.customers.waitNextSec);
      events.emit({ type: 'change' });
      return true;
    },
    tick(dt) {
      const st = s();
      if (frontIn > 0) {
        frontIn = Math.max(0, frontIn - dt);
        if (frontIn === 0) events.emit({ type: 'change' });
      }
      if (shopOpen()) {
        if (!wasOpen) {
          wasOpen = true;
          if (st.stats.deals === 0) spawnIn = content.ftue.firstCustomerSec;
        }
        if (queue.length >= content.customers.queueSize) spawnIn = spawnEvery();
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
        inc.elapsed += dt;
        inc.progress += dt;
        const egg = eggData(inc.egg);
        if (!egg) {
          Object.assign(inc, emptyIncubator());
          continue;
        }
        if (isHatched(inc.progress, inc.elapsed, needFor(inc.egg), eggs)) hatch(i);
      }
    },
    view() {
      return {
        incubators: s().incubators.map((inc) => ({ egg: inc.egg, waiting: inc.waiting, share: inc.egg ? hatchShare(inc.progress, needFor(inc.egg)) : 0 })),
        creatures: s().creatures.map((x) => {
          const spec = speciesData(x.species);
          return {
            uid: x.uid,
            species: x.species,
            rarity: spec?.rarity ?? 'common',
            level: x.level,
            maxLevel: spec?.maxLevel ?? 1,
            price: spec ? coins(creatureValue(spec, x.level)) : 0,
            fed: x.fed,
            need: tapsForLevel(x.level, species.tapsPerLevelBase),
          };
        }),
        selected: selected(),
        queue: queue.map((v) => ({ id: v.id, customer: v.district.customer.id })),
        deal: currentDeal(),
      };
    },
    deal: currentDeal,
    upgradeList() {
      return content.upgrades.shop.map(upgradeView).filter((x): x is UpgradeView => x !== null);
    },
    buyUpgrade(id) {
      const view = content.upgrades.shop.includes(id) ? upgradeView(id) : null;
      const u = content.upgrades.upgrades.find((x) => x.id === id);
      if (!view || !u) {
        events.emit({ type: 'denied', action: 'upgrade', reason: 'locked' });
        return false;
      }
      if (view.maxed || !view.affordable) {
        events.emit({ type: 'denied', action: 'upgrade', reason: view.maxed ? 'max' : 'coins' });
        return false;
      }
      const st = s();
      if (u.currency === 'crystals') st.crystals -= view.price;
      else st.coins -= view.price;
      st.upgrades[id] = view.level + 1;
      syncIncubators();
      store.commit({ flush: true });
      events.emit({ type: 'upgradeBought', id, level: view.level + 1, price: view.price });
      events.emit({ type: 'change' });
      return true;
    },
    freeSlots,
    showcaseSlots,
  };
  return game;
}
