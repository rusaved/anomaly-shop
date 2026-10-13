import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-06: the deal in three moves (Q-004): accept, haggle, wait, with the chances of customers.json. */
const content = loadGameContent();
const thrifty = content.customers.districts[0]!.customer;

function setup(seed = 11) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.stats.hatched = 2;
  save.creatures = [
    { uid: 'a', species: 'kettle', level: 2, fed: 0, hatchedAt: 0 },
    { uid: 'b', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0 },
  ];
  const store = createStore(save, () => 0);
  const flushes: boolean[] = [];
  store.onCommit((_, f) => flushes.push(f));
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen, flushes };
}

function run(game: Game, sec: number): void {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
}

describe('M1-06 deal', () => {
  it('accept: coins come in, the creature goes, stats and collection count it, the save is flushed', () => {
    const { game, seen, flushes } = setup();
    run(game, 6.1);
    const offer = game.deal()!.offer;
    expect(game.accept()).toBe(true);
    expect(game.state.coins).toBe(offer);
    expect(seen.find((e) => e.type === 'sold')).toBeDefined();
    expect(game.state.creatures.map((c) => c.uid)).toEqual(['b']);
    expect(game.state.stats).toMatchObject({ deals: 1, coinsEarned: offer });
    expect(game.state.collection.kettle?.sold).toBe(1);
    expect(game.view().queue).toHaveLength(0);
    expect(seen.find((e) => e.type === 'sold')).toMatchObject({ uid: 'a', price: offer, haggled: false });
    expect(seen.find((e) => e.type === 'customerLeft')).toMatchObject({ reason: 'sold' });
    expect(flushes.at(-1)).toBe(true);
  });

  it('haggle: a success raises the offer by 10–30%; a failure sends the customer away and keeps the creature', () => {
    let ups = 0;
    let lefts = 0;
    for (let seed = 1; seed <= 1500; seed++) {
      const { game, seen } = setup(seed);
      run(game, 6.1);
      const before = game.deal()!;
      game.haggle();
      const h = seen.find((e) => e.type === 'haggled');
      if (h?.type !== 'haggled') throw new Error('no haggle event');
      if (h.result === 'up') {
        ups++;
        expect(h.bonus).toBeGreaterThanOrEqual(content.customers.bargainBonus.min);
        expect(h.bonus).toBeLessThanOrEqual(content.customers.bargainBonus.max);
        expect(game.deal()!.offer).toBeGreaterThan(before.offer);
        expect(game.deal()!.offer).toBeLessThanOrEqual(Math.ceil(before.offer * 1.3) + 1);
      } else {
        lefts++;
        expect(game.view().queue).toHaveLength(0);
        expect(game.state.creatures).toHaveLength(2);
        expect(game.state.coins).toBe(0);
        expect(seen.find((e) => e.type === 'customerLeft')).toMatchObject({ reason: 'haggle' });
      }
    }
    // The thrifty one walks away in about 25% of haggles (customers.json, leaveOnBargain).
    expect(Math.abs(lefts / 1500 - thrifty.leaveOnBargain)).toBeLessThan(0.04);
    expect(ups + lefts).toBe(1500);
  });

  it(`haggling stops after bargainMax (${content.customers.bargainMax}) successes: «last price»`, () => {
    for (let seed = 1; seed < 200; seed++) {
      const { game, seen } = setup(seed);
      run(game, 6.1);
      for (let i = 0; i < content.customers.bargainMax; i++) game.haggle();
      if (game.view().queue.length === 0) continue;
      expect(game.deal()!.canHaggle).toBe(false);
      expect(game.haggle()).toBe(false);
      expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'lastPrice' });
      return;
    }
    throw new Error('no seed kept the customer through all haggles');
  });

  it('wait: the front customer leaves with no coins, the next one steps up after waitNextSec', () => {
    const { game } = setup();
    run(game, 12.1);
    expect(game.view().queue).toHaveLength(2);
    expect(game.wait()).toBe(true);
    expect(game.view().queue).toHaveLength(1);
    expect(game.deal()).toBeNull();
    run(game, content.customers.waitNextSec - 0.1);
    expect(game.deal()).toBeNull();
    run(game, 0.2);
    expect(game.deal()).not.toBeNull();
    expect(game.state.coins).toBe(0);
  });

  it('wait with nobody behind: a new customer comes after waitNextSec', () => {
    const { game } = setup();
    run(game, 6.1);
    game.wait();
    run(game, content.customers.waitNextSec + 0.1);
    expect(game.view().queue).toHaveLength(1);
  });

  it('nothing to sell or nobody at the counter: the moves are refused with a reason', () => {
    const { game, seen } = setup();
    expect(game.accept()).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', action: 'sell', reason: 'noDeal' });
    run(game, 6.1);
    game.state.creatures = [];
    expect(game.accept()).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', action: 'sell', reason: 'noCreature' });
    expect(game.haggle()).toBe(false);
  });
});
