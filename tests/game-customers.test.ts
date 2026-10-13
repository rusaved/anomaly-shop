import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue, offerFor } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-05: the customer queue (docs/01a, section 4): one customer every 6 s, at most 3, the thrifty type, an offer. */
const content = loadGameContent();

function setup(withCreature = true, seed = 7) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  if (withCreature) {
    save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    save.stats.hatched = 1;
    // A player past the first sale: the first-minute rules (sooner, generous first customer) are tested below.
    save.stats.deals = 1;
  }
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

function run(game: Game, sec: number): void {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
}

describe('M1-05 customers', () => {
  it('nobody comes to a shop that has never had a creature', () => {
    const { game } = setup(false);
    run(game, 30);
    expect(game.view().queue).toHaveLength(0);
  });

  it('a customer every 6 s, the queue stops at 3', () => {
    const { game, seen } = setup();
    run(game, 5.9);
    expect(game.view().queue).toHaveLength(0);
    run(game, 0.2);
    expect(game.view().queue).toHaveLength(1);
    run(game, 6);
    expect(game.view().queue).toHaveLength(2);
    run(game, 6);
    expect(game.view().queue).toHaveLength(3);
    run(game, 30);
    expect(game.view().queue).toHaveLength(3);
    expect(seen.filter((e) => e.type === 'customerArrived')).toHaveLength(3);
  });

  it('M1 customers are thrifty and offer 70–85% of the appraisal for the selected creature', () => {
    const kettle = content.species.species.find((s) => s.id === 'kettle')!;
    const thrifty = content.customers.districts[0]!.customer;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { game } = setup(true, seed);
      run(game, 6.1);
      const deal = game.view().deal!;
      expect(deal.customer).toBe('thrifty');
      expect(deal.uid).toBe('a');
      expect(deal.offer).toBeGreaterThanOrEqual(Math.floor(creatureValue(kettle, 1) * thrifty.offer.min));
      expect(deal.offer).toBeLessThanOrEqual(Math.ceil(creatureValue(kettle, 1) * thrifty.offer.max));
    }
  });

  it('the offer follows the creature: feeding to a new level raises it', () => {
    const { game } = setup();
    run(game, 6.1);
    const before = game.view().deal!.offer;
    for (let i = 0; i < 5; i++) game.tapCreature('a');
    expect(game.view().deal!.offer).toBeGreaterThan(before);
  });

  it('a customer without a creature to buy waits with no offer', () => {
    const { game } = setup();
    run(game, 6.1);
    game.state.creatures = [];
    expect(game.view().deal).toMatchObject({ uid: null, offer: 0 });
  });

  it('first minute: before the first deal the first customer comes after firstCustomerSec and offers enough for an egg', () => {
    const { game } = setup();
    game.state.stats.deals = 0;
    const fresh = createGame(createStore(game.state, () => 0), content, createRng(3));
    run(fresh, content.ftue.firstCustomerSec - 0.1);
    expect(fresh.view().queue).toHaveLength(0);
    run(fresh, 0.2);
    expect(fresh.view().queue).toHaveLength(1);
    expect(fresh.deal()!.offer).toBeGreaterThanOrEqual(content.eggs.eggs[0]!.price.coins);
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
