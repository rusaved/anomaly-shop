import { describe, expect, it } from 'vitest';
import { tickTapping } from './hatch-helper.ts';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-10: the warm egg opens after 5 deals (docs/01a, section 2); its odds are checked on 1 000 hatches in game-hatch.test.ts. */
const content = loadGameContent();
const warm = content.eggs.eggs.find((e) => e.id === 'egg_warm')!;

function setup(deals: number) {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_fed: true, ftue_bought: true, ftue_done: true };
  save.stats.deals = deals;
  save.stats.hatched = 3;
  save.coins = 200;
  save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(4));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M1-10 warm egg', () => {
  it('locked before 5 deals: not on sale, a purchase is refused', () => {
    const { game, seen } = setup(3);
    expect(game.eggList().map((e) => e.id)).toEqual(['egg_basic']);
    expect(game.buyEgg('egg_warm')).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'locked' });
  });

  it('the 5th deal opens it (event, «new» mark), it costs its price and hatches in 10 s', () => {
    const { game, seen } = setup(4);
    for (let t = 0; t < 6.1; t += STEP_SEC) tickTapping(game, STEP_SEC);
    expect(game.accept()).toBe(true);
    expect(seen.some((e) => e.type === 'eggUnlocked' && e.egg === 'egg_warm')).toBe(true);
    expect(game.eggList().map((e) => e.id)).toEqual(['egg_basic', 'egg_warm']);
    expect(game.eggList()[1]!.fresh).toBe(true);
    const coins = game.state.coins;
    expect(game.buyEgg('egg_warm')).toBe(true);
    expect(game.state.coins).toBe(coins - warm.price.coins);
    expect(game.eggList()[1]!.fresh).toBe(false);
    const start = seen.length;
    let t = 0;
    for (; t < 15 && !seen.slice(start).some((e) => e.type === 'hatched'); t += STEP_SEC) tickTapping(game, STEP_SEC);
    expect(Math.abs(t - warm.hatchSec)).toBeLessThan(3 * STEP_SEC);
  });

  it('odd and glowing eggs wait for their districts (M2-05), the ladder top for deals (M3), the daily egg for M4', () => {
    expect(setup(19).game.eggList().map((e) => e.id)).toEqual(['egg_basic', 'egg_warm', 'egg_autumn']);
    expect(setup(500).game.eggList().map((e) => e.id)).toEqual(['egg_basic', 'egg_warm', 'egg_autumn', 'egg_odd', 'egg_glow', 'egg_star']);
  });
});

describe('M2 playtest: the first dearer egg is a good surprise', () => {
  it('the first warm egg gives at least a rare one, later ones roll their odds', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const save = newSave(0);
      save.flags.ftue_starter = true;
      save.flags.ftue_done = true;
      save.stats.hatched = 5;
      save.stats.deals = 6;
      save.coins = 1000;
      const game = createGame(createStore(save, () => 0), content, createRng(seed));
      const seen: GameEvent[] = [];
      game.events.on((e) => seen.push(e));
      game.buyEgg('egg_warm');
      for (let t = 0; t < 11; t += STEP_SEC) tickTapping(game, STEP_SEC);
      const first = seen.find((e) => e.type === 'hatched');
      expect(first && first.type === 'hatched' ? first.rarity : 'none').not.toBe('common');
      expect(game.state.flags.first_egg_warm).toBe(true);
    }
  });
});
