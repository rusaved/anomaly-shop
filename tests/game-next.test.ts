import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-13: the «Next» card always shows exactly one goal not reached yet: the one with the largest share done. */
const content = loadGameContent();

function setup(deals: number, coins: number, upgrades: Record<string, number> = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.stats.hatched = 3;
  save.stats.deals = deals;
  save.stats.levelUps = 1;
  save.stats.haggles = 1;
  save.coins = coins;
  save.upgrades = upgrades;
  return createGame(createStore(save, () => 0), content, createRng(1));
}

describe('M2-13 next goal', () => {
  it('a shop position with the most done; reaching it moves on to the next one', () => {
    const game = setup(2, 30);
    const g = game.nextGoal();
    expect(g).toMatchObject({ kind: 'upgrade', id: 'incubator_speed', have: 30, need: 40, unit: 'coins' });
    game.state.coins = 45;
    const next = game.nextGoal();
    expect(next.id).not.toBe('incubator_speed');
    expect(next.have).toBeLessThan(next.need);
  });

  it('deals goals: the warm egg after 5 deals, the street after 20', () => {
    expect(setup(4, 0).nextGoal()).toMatchObject({ kind: 'egg', id: 'egg_warm', have: 4, need: 5, unit: 'deals' });
    const late = setup(19, 0);
    expect(late.nextGoal()).toMatchObject({ kind: 'district', id: 'street', have: 19, need: 20, unit: 'deals' });
  });

  it('crystal goals count crystals', () => {
    const game = setup(40, 0);
    game.state.crystals = 24;
    expect(game.nextGoal()).toMatchObject({ kind: 'upgrade', id: 'helper_courier', have: 24, need: 25, unit: 'crystals' });
  });

  it('always exactly one goal: everything bought → the new town (rebirth threshold)', () => {
    const all = Object.fromEntries(content.upgrades.upgrades.map((u) => [u.id, u.levels]));
    const game = setup(500, 10, all);
    expect(game.nextGoal()).toMatchObject({ kind: 'rebirth', unit: 'coins', need: content.upgrades.prestige.thresholdCoinsEarned });
    for (let coins = 0; coins < 20000; coins += 997) {
      const g = setup(30, coins).nextGoal();
      expect(g.have).toBeLessThan(g.need);
    }
  });
});
