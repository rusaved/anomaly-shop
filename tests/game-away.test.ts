import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** FB-03 (Q-039 B): away pays offlineShare of the income of play, up to offlineMaxHours; «×2» for an ad once. */
const content = loadGameContent();
const up = content.upgrades;

function shop(income: number) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.stats.hatched = 5;
  save.stats.income = income;
  save.incubators[0]!.egg = null;
  return createGame(createStore(save, () => 0), content, createRng(3));
}

describe('FB-03 away', () => {
  it('8 hours away count as offlineMaxHours, within offlineShare of the income of play', () => {
    const game = shop(300);
    const r = game.offline(8 * 3600);
    expect(r.awaySec).toBe(up.offlineMaxHours * 3600);
    const live = 300 * up.offlineMaxHours * 60;
    expect(r.coins).toBeGreaterThanOrEqual(live * up.offlineShare.min - 1);
    expect(r.coins).toBeLessThanOrEqual(live * up.offlineShare.max + 1);
  });

  it('half an hour away pays for half an hour', () => {
    const game = shop(300);
    const r = game.offline(1800);
    expect(r.coins).toBeGreaterThanOrEqual(300 * 30 * up.offlineShare.min - 1);
    expect(r.coins).toBeLessThanOrEqual(300 * 30 * up.offlineShare.max + 1);
  });

  it('«×2» for an ad gives the same coins once more, once', () => {
    const game = shop(200);
    const r = game.offline(3600);
    const before = game.state.coins;
    expect(game.awayDouble()).toBeCloseTo(r.coins, 6);
    expect(game.state.coins).toBeCloseTo(before + r.coins, 6);
    expect(game.awayDouble()).toBe(0);
  });

  it('the seller level grows at most offlineMaxLevels away (deals with helpers and a courier), live deals keep counting', () => {
    const run = (maxLevels: number): { gained: number; deals: number } => {
      const game = createGame(createStore(shop(300).state, () => 0), { ...content, upgrades: { ...up, offlineMaxLevels: maxLevels } }, createRng(3));
      Object.assign(game.state.upgrades, { helper_sell: 1, helper_courier: 1, helper_feed: 1, showcase: 5, incubator: 3, sign: 5 });
      game.state.incubators = Array.from({ length: 4 }, () => ({ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }));
      game.state.coins = 5000;
      const level = game.reputation().level;
      const deals = game.state.stats.deals;
      game.offline(2 * 3600);
      return { gained: game.reputation().level - level, deals: game.state.stats.deals - deals };
    };
    const free = run(99);
    expect(free.deals).toBeGreaterThan(10);
    expect(free.gained).toBeGreaterThan(up.offlineMaxLevels);
    expect(run(up.offlineMaxLevels).gained).toBeLessThanOrEqual(up.offlineMaxLevels);
  });
});

describe('FB-15 (the game design review): one big sale right before leaving', () => {
  it('does not make the time away richer — the income leaves its best minute out', () => {
    const game = shop(0);
    game.state.incomeMinutes = Array.from({ length: 9 }, () => 300);
    game.state.stats.income = 300;
    // The last minute: one sale of 4 800.
    game.state.incomeMinutes = [...game.state.incomeMinutes, 5100];
    const r = game.offline(2 * 3600);
    expect(r.coins).toBeLessThanOrEqual(420 * 120 * up.offlineShare.max + 1);
  });
});
