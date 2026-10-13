// What: the game itself (docs/01, sections 2–4): player commands (buyEgg, tapIncubator, ...) and the fixed-step tick over the store.
// Called by: src/main.ts (one game per page, tick from the runtime), src/test-api, scripts/balance-model.ts and tests (headless).
// Keep: commands change store.state and commit; flush on hatch, deal, purchase; content and rng come in, so Node runs it without a bundler.

import type { CustomersData, EggsData, FtueData, RarityName, SpeciesData, UpgradesData } from '../content/schemas.ts';
import { createEmitter, type Emitter } from '../core/events.ts';
import type { Rng } from '../core/rng.ts';
import { emptyIncubator, type SaveData } from './state.ts';
import type { GameStore } from './store.ts';
import { hatchNeedSec, hatchShare, isHatched, pickRarity, pickSpecies } from './rules.ts';

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
  level: number;
}

export interface GameView {
  incubators: IncubatorView[];
  creatures: CreatureView[];
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
  tick(dt: number): void;
  view(): GameView;
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
  const upgradeLevel = (id: string): number => s().upgrades[id] ?? 0;
  const speedEffect = (): number => {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'hatchTime');
    return u && u.effect.type === 'hatchTime' ? upgradeLevel(u.id) * u.effect.perLevel : 0;
  };
  const needFor = (eggId: string): number => {
    const egg = eggData(eggId);
    return egg ? hatchNeedSec(egg, speedEffect()) : 0;
  };

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
    tick(dt) {
      const st = s();
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
        creatures: s().creatures.map((x) => ({ uid: x.uid, species: x.species, level: x.level })),
      };
    },
    freeSlots,
    showcaseSlots,
  };
  return game;
}
