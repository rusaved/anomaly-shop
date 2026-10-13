import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-01: egg purchase, incubator, timer; taps speed it up (docs/01a, section 2). */
const content = loadGameContent();

function setup(coins = 0) {
  const save = newSave(0);
  save.coins = coins;
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(42));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, store, seen };
}

/** Steps the sim until a hatch; returns the game seconds it took (null if none within limit). */
function secondsToHatch(game: ReturnType<typeof setup>['game'], seen: GameEvent[], limit = 10): number | null {
  for (let t = 0; t < limit; t += STEP_SEC) {
    game.tick(STEP_SEC);
    if (seen.some((e) => e.type === 'hatched')) return t + STEP_SEC;
  }
  return null;
}

describe('M1-01 egg', () => {
  it('a fresh shop starts with the starter egg in the incubator, waiting for the first tap', () => {
    const { game, seen } = setup();
    expect(game.state.incubators[0]).toMatchObject({ egg: 'egg_basic', waiting: true });
    expect(secondsToHatch(game, seen, 5)).toBeNull();
    game.tapIncubator(0);
    expect(game.state.incubators[0]!.waiting).toBe(false);
    expect(seen.find((e) => e.type === 'eggTap')).toMatchObject({ started: true });
  });

  it('a basic egg hatches in 3 s without taps', () => {
    const { game, seen } = setup(10);
    game.state.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    expect(game.buyEgg()).toBe(true);
    expect(game.state.coins).toBe(0);
    const t = secondsToHatch(game, seen)!;
    expect(t).toBeGreaterThan(3 - 2 * STEP_SEC);
    expect(t).toBeLessThan(3 + 2 * STEP_SEC);
  });

  it('taps cut the time (−0.5 s each) down to 1 s, never below', () => {
    for (const [taps, expected] of [[2, 2], [4, 1], [10, 1]] as const) {
      const { game, seen } = setup(10);
      game.state.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
      game.buyEgg();
      for (let i = 0; i < taps; i++) game.tapIncubator(0);
      const t = secondsToHatch(game, seen)!;
      expect(Math.abs(t - expected)).toBeLessThan(2 * STEP_SEC);
    }
  });

  it('buying needs coins, a free incubator and a free showcase place; the reason is reported', () => {
    const { game, seen } = setup(5);
    expect(game.canBuyEgg()).toMatchObject({ ok: false, reason: 'busy' });
    game.state.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    expect(game.canBuyEgg()).toMatchObject({ ok: false, reason: 'coins' });
    game.state.coins = 100;
    game.state.creatures = [1, 2, 3].map((n) => ({ uid: `x${n}`, species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }));
    expect(game.buyEgg()).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'full' });
    expect(game.state.coins).toBe(100);
  });

  it('tapping an empty incubator buys a basic egg; the hatch adds a creature and flushes the save', () => {
    const { game, store, seen } = setup(10);
    game.state.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    const flushes: boolean[] = [];
    store.onCommit((_, flush) => flushes.push(flush));
    game.tapIncubator(0);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    secondsToHatch(game, seen);
    expect(game.state.creatures).toHaveLength(1);
    expect(game.state.stats.hatched).toBe(1);
    expect(game.state.incubators[0]!.egg).toBeNull();
    expect(flushes.at(-1)).toBe(true);
  });

  it('the egg timer survives a save round trip', async () => {
    const { serialize, parseSave, normalize } = await import('../src/sim/state.ts');
    const { game } = setup();
    game.tapIncubator(0);
    game.tick(1);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.incubators[0]).toMatchObject({ egg: 'egg_basic', waiting: false, elapsed: 1 });
    expect(back.incubators[0]!.progress).toBeCloseTo(1.5, 5);
  });
});
