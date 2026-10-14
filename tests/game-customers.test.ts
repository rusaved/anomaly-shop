import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue, offerFor, priceZone } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/** UB-05 (was M1-05): buyers only write — one chat per creature on the shelf after replySec, at most queueSize at once, the type's offer. */
const content = loadGameContent();
const cr = (uid: string, level = 1): Creature => ({ uid, species: 'kettle', level, fed: 0, hatchedAt: 0, age: 0 });

function setup(creatures: Creature[] = [cr('a')], seed = 7) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.showcase_m3 = true;
  save.creatures = creatures;
  save.showcase = creatures.map((c) => c.uid);
  save.upgrades = { showcase: 4 };
  save.stats.hatched = creatures.length;
  // A player past the first sale: the first-minute rules (sooner, generous first buyer) are tested below.
  save.stats.deals = 1;
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

function run(game: Game, sec: number): void {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
}

const open = (game: Game) => game.chats().filter((c) => c.state === 'open');
const marketDelay = content.market.slider.delay[priceZone(1, content.market.slider)]!;

describe('UB-05 buyers', () => {
  it('nobody writes to a shop with an empty shelf', () => {
    const { game } = setup([]);
    run(game, 60);
    expect(game.chats()).toHaveLength(0);
    expect(game.view().queue).toHaveLength(0);
  });

  it('a buyer writes about a creature at the market price within replySec × the zone delay, and stands in the scene queue', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game, seen } = setup([cr('a')], seed);
      run(game, content.market.replySec.min * marketDelay - 0.1);
      expect(open(game)).toHaveLength(0);
      run(game, (content.market.replySec.max - content.market.replySec.min) * marketDelay + 0.2);
      expect(open(game)).toHaveLength(1);
      expect(game.view().queue.map((q) => q.id)).toEqual([open(game)[0]!.id]);
      expect(seen.filter((e) => e.type === 'customerArrived')).toHaveLength(1);
    }
  });

  it(`at most queueSize (${content.customers.queueSize}) buyers write at once; the rest wait on the shelf`, () => {
    const { game } = setup(['a', 'b', 'c', 'd', 'e'].map((u) => cr(u)));
    run(game, 60);
    expect(open(game)).toHaveLength(content.customers.queueSize);
    expect(game.view().queue).toHaveLength(content.customers.queueSize);
    expect(game.view().creatures).toHaveLength(5 - content.customers.queueSize);
  });

  it('the yard type offers its share of the appraisal, bent by the character', () => {
    const kettle = content.species.species.find((s) => s.id === 'kettle')!;
    const thrifty = content.customers.districts[0]!.customer;
    const chars = content.customers.characters;
    const w = chars.reduce((sum, c) => sum + c.weight, 0);
    const mean = chars.reduce((sum, c) => sum + c.weight * ((c.offer.min + c.offer.max) / 2), 0) / w;
    const lo = Math.min(...chars.map((c) => c.offer.min)) / mean;
    const hi = Math.max(...chars.map((c) => c.offer.max)) / mean;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { game } = setup([cr('a')], seed);
      const chat = waitChat(game)!;
      expect(chat.customer).toBe('thrifty');
      expect(chat.uid).toBe('a');
      expect(chat.offer).toBeGreaterThanOrEqual(Math.floor(creatureValue(kettle, 1) * thrifty.offer.min * lo) - 1);
      expect(chat.offer).toBeLessThanOrEqual(Math.ceil(creatureValue(kettle, 1) * thrifty.offer.max * hi) + 1);
    }
  });

  it('a higher asking price on the slider brings a higher offer (and a later buyer)', () => {
    const a = setup([cr('a', 3)], 4);
    const b = setup([cr('a', 3)], 4);
    b.game.setAsk('a', 1.4);
    const ca = waitChat(a.game)!;
    const cb = waitChat(b.game)!;
    expect(cb.offer).toBeGreaterThan(ca.offer);
  });

  it('first minute: before the first deal the first buyer writes after firstCustomerSec and offers enough for an egg', () => {
    const { game } = setup();
    game.state.stats.deals = 0;
    const fresh = createGame(createStore(game.state, () => 0), content, createRng(3));
    run(fresh, content.ftue.firstCustomerSec - 0.1);
    expect(open(fresh)).toHaveLength(0);
    run(fresh, 0.2);
    expect(open(fresh)).toHaveLength(1);
    expect(open(fresh)[0]!.offer).toBeGreaterThanOrEqual(content.eggs.eggs[0]!.price.coins);
  });

  it('offerFor: collector likes rarity, the rich pay for level, the register adds to every deal', () => {
    const cat = content.species.species.find((s) => s.id === 'cloudcat')!;
    const base = creatureValue(cat, 3);
    expect(offerFor(cat, 3, { share: 1, mult: 1 })).toBe(coins(base));
    expect(offerFor(cat, 3, { share: 1, mult: 1, rarityBonus: 0.2 })).toBe(coins(base * 1.2));
    expect(offerFor(cat, 3, { share: 1, mult: 1, levelBonusPerLevel: 0.1 })).toBe(coins(base * 1.2));
    expect(offerFor(cat, 3, { share: 0.8, mult: 1.25, cashBonus: 0.03 })).toBe(coins(base * 0.8 * 1.25 * 1.03));
  });
});
