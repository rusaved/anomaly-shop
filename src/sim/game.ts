// What: the game itself (docs/01, sections 2–4): player commands (buyEgg, tapIncubator, ...) and the fixed-step tick over the store.
// Called by: src/main.ts (one game per page, tick from the runtime), src/test-api, scripts/balance-model.ts and tests (headless).
// Keep: commands change store.state and commit; flush on hatch, deal, purchase; content and rng come in, so Node runs it without a bundler.

import type { CustomersData, DistrictData, EggsData, FtueData, RarityName, SpeciesData, UpgradesData } from '../content/schemas.ts';
import { createEmitter, type Emitter } from '../core/events.ts';
import type { Rng } from '../core/rng.ts';
import { emptyIncubator, type SaveData } from './state.ts';
import type { GameStore } from './store.ts';
import { coins, creatureValue, hatchNeedSec, hatchShare, isHatched, offerFor, pickRarity, pickSpecies, tapsForLevel } from './rules.ts';

export interface GameContent {
  eggs: EggsData;
  species: SpeciesData;
  customers: CustomersData;
  upgrades: UpgradesData;
  ftue: FtueData;
}

export type DenyReason = 'coins' | 'busy' | 'full' | 'locked';

export type GameEvent =
  | { type: 'eggBought'; incubator: number; egg: string; price: number }
  | { type: 'eggTap'; incubator: number; started: boolean }
  | { type: 'hatched'; incubator: number; uid: string; species: string; rarity: RarityName }
  | { type: 'fed'; uid: string; level: number; levelUp: boolean; maxed: boolean; price: number; gain: number }
  | { type: 'customerArrived'; id: number; customer: string }
  | { type: 'customerLeft'; id: number; reason: 'sold' | 'haggle' | 'wait' }
  | { type: 'denied'; action: 'buyEgg'; reason: DenyReason }
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
  /** Free showcase places (creatures and eggs both take one). */
  freeSlots(): number;
  showcaseSlots(): number;
}

export const FLAGS = { starter: 'ftue_starter' } as const;

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
    const v: Visitor = { id: nextVisitor++, district, share: rng.range(offer.min, offer.max), mult: 1, bargains: 0 };
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
    return { id: v.id, customer: c.id, uid: cr?.uid ?? null, species: cr?.species ?? null, level: cr?.level ?? 0, offer, bargains: v.bargains };
  }

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
    const rarity = pickRarity(egg.chances, rng.next());
    const kind = pickSpecies(species, rarity, rng.next());
    const st = s();
    st.stats.hatched += 1;
    const uid = `c${st.stats.hatched.toString(36)}${rng.int(1296).toString(36)}`;
    st.creatures.push({ uid, species: kind.id, level: 1, fed: 0, hatchedAt: st.savedAt });
    const entry = (st.collection[kind.id] ??= { seen: 0, hatched: 0, sold: 0 });
    entry.seen += 1;
    entry.hatched += 1;
    Object.assign(inc, emptyIncubator());
    store.commit({ flush: true });
    events.emit({ type: 'hatched', incubator: index, uid, species: kind.id, rarity: kind.rarity });
    events.emit({ type: 'change' });
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
        }
      }
      const price = coins(creatureValue(spec, cr.level));
      store.commit();
      events.emit({ type: 'fed', uid, level: cr.level, levelUp, maxed: cr.level >= spec.maxLevel, price, gain: price - before });
      if (changed || levelUp) events.emit({ type: 'change' });
    },
    selected,
    tick(dt) {
      const st = s();
      if (frontIn > 0) {
        frontIn = Math.max(0, frontIn - dt);
        if (frontIn === 0) events.emit({ type: 'change' });
      }
      if (shopOpen()) {
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
    freeSlots,
    showcaseSlots,
  };
  return game;
}
