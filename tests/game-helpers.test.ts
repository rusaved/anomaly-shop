import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-03: helpers work without taps (feeder, seller, courier); the shop works on while the player is away. */
const content = loadGameContent();
const cr = (uid: string, species = 'kettle', level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

/** Random events off: they only run live (never while away) and would tilt the live/away comparison. */
const calm = { ...content, events: { ...content.events, events: content.events.events.map((e) => ({ ...e, weight: 0 })) } };

function setup(opts: { creatures?: Creature[]; helpers?: string[]; deals?: number; seed?: number } = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = opts.creatures ?? [];
  save.stats.hatched = 5;
  save.stats.deals = opts.deals ?? 40;
  save.crystals = 100;
  save.coins = 1e6;
  const store = createStore(save, () => 0);
  const game = createGame(store, calm, createRng(opts.seed ?? 4));
  for (const id of opts.helpers ?? []) expect(game.buyUpgrade(id)).toBe(true);
  game.state.coins = 0;
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-03 helpers', () => {
  it('helpers open by deals (10, 20, 30); the courier costs crystals', () => {
    expect(setup({ deals: 9 }).game.upgradeList().map((u) => u.id)).not.toContain('helper_feed');
    expect(setup({ deals: 10 }).game.upgradeList().map((u) => u.id)).toContain('helper_feed');
    expect(setup({ deals: 19 }).game.upgradeList().map((u) => u.id)).not.toContain('helper_sell');
    expect(setup({ deals: 30 }).game.upgradeList().map((u) => u.id)).toEqual(expect.arrayContaining(['helper_feed', 'helper_sell', 'helper_courier']));
    const { game } = setup({ deals: 30 });
    game.state.crystals = 24;
    game.state.coins = 1e6;
    expect(game.buyUpgrade('helper_courier')).toBe(false);
    game.state.crystals = 25;
    expect(game.buyUpgrade('helper_courier')).toBe(true);
    expect(game.state.crystals).toBe(0);
    expect(game.state.coins).toBe(1e6);
  });

  it('the feeder feeds the hungriest creature, one tap a second, no taps of the player', () => {
    const { game, seen } = setup({ creatures: [cr('hi', 'kettle', 4), cr('lo', 'kettle', 1)], helpers: ['helper_feed'] });
    run(game, 5.01);
    const fed = seen.filter((e) => e.type === 'fed');
    expect(fed).toHaveLength(5);
    expect(fed.every((e) => e.type === 'fed' && e.uid === 'lo' && e.by === 'helper')).toBe(true);
    expect(game.state.creatures.find((c) => c.uid === 'lo')!.level).toBe(2);
    expect(game.state.stats.taps).toBe(0);
    expect(game.state.flags.ftue_fed).toBeUndefined();
  });

  it('the seller sells to a customer kept waiting at the counter (after delaySec), at the offer', () => {
    const { game, seen } = setup({ creatures: [cr('a', 'cloudcat', 2)], helpers: ['helper_sell'] });
    run(game, 6.5);
    const offer = game.deal()!.offer;
    const delay = content.upgrades.upgrades.find((u) => u.id === 'helper_sell')!.effect;
    expect(delay.type === 'autoSell' && delay.delaySec).toBeGreaterThan(1);
    run(game, (delay.type === 'autoSell' ? delay.delaySec : 0) - 0.6);
    expect(seen.some((e) => e.type === 'sold')).toBe(false);
    run(game, 0.2);
    const sold = seen.find((e) => e.type === 'sold');
    expect(sold).toMatchObject({ by: 'helper', uid: 'a', price: offer });
    expect(game.state.coins).toBe(offer);
  });

  it('a haggle restarts the seller wait: the player keeps the deal in hand', () => {
    const { game, seen } = setup({ creatures: [cr('a', 'cloudcat', 2)], helpers: ['helper_sell'], seed: 11 });
    run(game, 6.5);
    run(game, 4);
    game.haggle();
    run(game, 4);
    expect(seen.some((e) => e.type === 'sold' && e.by === 'helper')).toBe(false);
  });

  it('the courier buys a basic egg into a free incubator and showcase place', () => {
    const { game, seen } = setup({ helpers: ['helper_courier'] });
    game.state.coins = 50;
    run(game, 0.1);
    expect(seen.find((e) => e.type === 'eggBought')).toMatchObject({ by: 'helper', egg: 'egg_basic' });
    expect(game.state.coins).toBe(40);
  });

  it('away: the shop works at offlineRate for at most offlineMaxHours; helpers earn, eggs hatch', () => {
    const { game, seen } = setup({ creatures: [cr('a'), cr('b')], helpers: ['helper_feed', 'helper_sell', 'helper_courier'] });
    game.state.coins = 100;
    const t0 = performance.now();
    const r = game.offline(30 * 3600);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.awaySec).toBe(content.upgrades.offlineMaxHours * 3600);
    expect(r.workedSec).toBe(r.awaySec * content.upgrades.offlineRate);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.sold).toBeGreaterThan(10);
    expect(r.hatched).toBeGreaterThan(10);
    // Quiet: no game events while catching up, one change at the end.
    expect(seen.filter((e) => e.type !== 'change')).toHaveLength(0);
  });

  it('away without helpers: eggs hatch, no coins; time going back counts as zero', () => {
    const { game } = setup();
    game.state.coins = 10;
    game.buyEgg();
    const r = game.offline(600);
    expect(r).toMatchObject({ coins: 0, sold: 0, hatched: 1 });
    expect(game.offline(-5000)).toMatchObject({ awaySec: 0, workedSec: 0, coins: 0 });
  });
});

describe('M2-04 offline pace', () => {
  it('away time pays half the helpers pace of live play: 20 min away ≈ 10 min of helpers alone', () => {
    const helpers = ['helper_feed', 'helper_sell', 'helper_courier'];
    let live = 0;
    let away = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = setup({ creatures: [cr('a'), cr('b')], helpers, seed });
      a.game.state.coins = 100;
      run(a.game, 600);
      live += a.game.state.coins - 100;
      const b = setup({ creatures: [cr('a'), cr('b')], helpers, seed: seed + 100 });
      b.game.state.coins = 100;
      away += b.game.offline(1200).coins;
    }
    // 20 minutes away at offlineRate of the live pace ≈ 20 × rate minutes of helpers alone (rate 0.5 → 10 min).
    const want = 2 * content.upgrades.offlineRate;
    expect(away / live).toBeGreaterThan(want * 0.8);
    expect(away / live).toBeLessThan(want * 1.25);
  });
});
