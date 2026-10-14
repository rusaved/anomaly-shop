import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { workPay, workPrice } from '../src/sim/rules.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-12: «Side job» — coins per tap grow by incomeGrowth per level, the level price by ×2.3 (work.json). */
const content = loadGameContent();
const w = content.work;

describe('M3-12 side job', () => {
  it('income and level price follow work.json: ×incomeGrowth and ×2.3 per level', () => {
    expect(workPay(1, w)).toBe(w.coinsPerTap);
    expect(workPrice(1, w)).toBe(w.price1);
    for (let lv = 2; lv <= 6; lv++) {
      expect(workPay(lv, w)).toBe(Math.round(w.coinsPerTap * w.incomeGrowth ** (lv - 1)));
      expect(workPrice(lv, w) / workPrice(lv - 1, w)).toBeCloseTo(w.priceGrowth, 1);
    }
  });

  it('a tap pays, a level up costs and raises the pay; the level survives a reload; the top level stops', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    expect(game.workTap()).toBe(w.coinsPerTap);
    expect(game.state.coins).toBe(w.coinsPerTap);
    expect(game.workUp()).toBe(false);
    game.state.coins = 10_000;
    expect(game.workUp()).toBe(true);
    expect(game.state.coins).toBe(10_000 - w.price1);
    expect(game.workView()).toMatchObject({ level: 2, pay: workPay(2, w) });
    expect(normalize(parseSave(serialize(game.state)), 0).work).toBe(2);
    game.state.work = w.levels;
    expect(game.workView().price).toBeNull();
    expect(game.workUp()).toBe(false);
  });
});
