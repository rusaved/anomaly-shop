import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { eggOdds } from '../src/sim/rules.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-04: the egg screen — sections, odds of every species, ×3 / ×5, «my eggs», the free egg by timer. */
const content = loadGameContent();

function setup(coins = 0, deals = 0) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.stats.hatched = 3;
  save.stats.deals = deals;
  save.coins = coins;
  save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(5));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M3-04 egg screen', () => {
  it('odds on the card: every species with its rarity share split evenly, summing to 100, the same as eggs.json', () => {
    for (const egg of content.eggs.eggs.filter((e) => !e.special)) {
      const odds = eggOdds(egg.chances, content.species);
      expect(odds.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(100, 9);
      for (const o of odds) {
        const same = content.species.species.filter((s) => s.rarity === o.rarity).length;
        expect(o.chance * same).toBeCloseTo(egg.chances[o.rarity], 9);
      }
    }
  });

  it('sections: the 8-step ladder (locked ones too), the free egg, seasonal; reward eggs only in «my eggs»', () => {
    const shop = setup(0).game.eggShop();
    expect(shop.eggs.filter((e) => e.section === 'ladder')).toHaveLength(8);
    expect(shop.eggs.filter((e) => e.section === 'ladder' && e.open).map((e) => e.id)).toEqual(['egg_basic']);
    expect(shop.eggs.some((e) => e.section === 'free' && e.freeIn === 0)).toBe(true);
    expect(shop.eggs.some((e) => e.section === 'reward')).toBe(false);
  });

  it('×5: one into the free incubator, four wait in «my eggs» and go in as incubators free up', () => {
    const { game, seen } = setup(100);
    expect(game.buyEggs('egg_basic', 5)).toBe(true);
    expect(game.state.coins).toBe(50);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    expect(game.state.myEggs).toEqual({ egg_basic: 4 });
    expect(seen.find((e) => e.type === 'eggsStored')).toMatchObject({ count: 4 });
    // Hatch the first: the next one goes into the incubator by itself.
    for (let t = 0; t < 4; t += STEP_SEC) game.tick(STEP_SEC);
    game.tapIncubator(0);
    game.tick(STEP_SEC);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    expect(game.state.myEggs).toEqual({ egg_basic: 3 });
  });

  it('×3 needs the coins for all three; a locked egg is refused', () => {
    const { game, seen } = setup(25);
    expect(game.buyEggs('egg_basic', 3)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'coins' });
    expect(game.buyEggs('egg_warm', 1)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'locked' });
    expect(game.state.coins).toBe(25);
  });

  it('the free egg: take it, then it comes back after freeEverySec; my eggs and timers survive a reload', () => {
    const gift = content.eggs.eggs.find((e) => e.section === 'free')!;
    const { game, seen } = setup(0);
    game.state.incubators[0]!.egg = 'egg_basic';
    expect(game.claimFree(gift.id)).toBe(true);
    expect(seen.some((e) => e.type === 'freeEgg')).toBe(true);
    expect(game.state.myEggs[gift.id]).toBe(1);
    expect(game.claimFree(gift.id)).toBe(false);
    expect(game.eggShop().eggs.find((e) => e.id === gift.id)!.freeIn).toBeCloseTo(gift.freeEverySec!, 6);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.myEggs).toEqual({ [gift.id]: 1 });
    expect(back.freeIn[gift.id]).toBeCloseTo(gift.freeEverySec!, 6);
    game.state.incubators[0]!.egg = null;
    game.tick(STEP_SEC);
    expect(game.state.incubators[0]!.egg).toBe(gift.id);
    for (let t = 0; t < gift.freeEverySec! + 1; t += 1) game.tick(1);
    expect(game.eggShop().eggs.find((e) => e.id === gift.id)!.freeIn).toBe(0);
    expect(game.claimFree(gift.id)).toBe(true);
  });

  it('gifts go into «my eggs» (subscriptions, codes)', () => {
    const { game } = setup(0);
    game.state.incubators[0]!.egg = 'egg_basic';
    game.giveEggs('egg_gold', 2);
    expect(game.eggShop().my).toEqual([{ id: 'egg_gold', count: 2 }]);
  });
});
