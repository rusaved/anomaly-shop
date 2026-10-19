import { describe, expect, it } from 'vitest';
import { tickTapping } from './hatch-helper.ts';
import { createRng } from '../src/core/rng.ts';
import { RARITIES } from '../src/content/schemas.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { hatchMult, incomeOf, rarityMean } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** FB-02: rewards in proportion — the jackpots of an egg in its own price, free rewards within minutes of the player's income. */
const content = loadGameContent();
const { eggs, species, calendar } = content;

describe('FB-02 rewards', () => {
  it('every egg: VIP 10–15× and exclusive 10–15× of its price, chances ≤ 2 % and ≤ 1 %, rarer is dearer', () => {
    for (const egg of eggs.eggs) {
      expect(egg.value, egg.id).toBeDefined();
      const v = egg.value!;
      expect(v.vip).toBeGreaterThanOrEqual(10);
      expect(v.exclusive).toBeLessThanOrEqual(15);
      expect(v.vip).toBeLessThanOrEqual(v.exclusive);
      for (let i = 1; i < RARITIES.length; i++) expect(v[RARITIES[i]!], `${egg.id} ${RARITIES[i]}`).toBeGreaterThanOrEqual(v[RARITIES[i - 1]!]);
      expect(egg.chances.vip, egg.id).toBeLessThanOrEqual(2);
      expect(egg.chances.exclusive, egg.id).toBeLessThanOrEqual(1);
    }
  });

  it('the anomaly of the day is ×1.5–2 of its rarity', () => {
    expect(calendar.daily.priceMultiplier).toBeGreaterThanOrEqual(1.5);
    expect(calendar.daily.priceMultiplier).toBeLessThanOrEqual(2);
  });

  it('a creature of an egg is worth value[rarity] × the egg price, species keep their spread', () => {
    const warm = eggs.eggs.find((e) => e.id === 'egg_warm')!;
    for (const r of RARITIES) expect(rarityMean(species, r) * hatchMult(warm, r, species, 0)).toBeCloseTo(warm.price.coins * warm.value![r], 6);
  });

  it('income: the mean of the last minutes, a spike at most 3 medians — a big sale moves it little', () => {
    expect(incomeOf([])).toBe(0);
    expect(incomeOf([300, 300, 300, 300])).toBe(300);
    expect(incomeOf([300, 300, 300, 300, 300, 300, 300, 300, 300, 5100])).toBe(360);
    expect(incomeOf([200, 400])).toBe(300);
  });

  it('a free egg (the gift egg, gold, the egg of the day) never hatches above rewardCapMin minutes of income', () => {
    for (const eggId of ['egg_gold', 'egg_gift', 'egg_daily']) {
      const save = newSave(0);
      save.flags.ftue_starter = true;
      save.flags.ftue_done = true;
      save.daily.day = '2026-10-19';
      const game = createGame(createStore(save, () => 0), content, createRng(7));
      const values: number[] = [];
      game.events.on((e: GameEvent) => {
        if (e.type === 'hatched') values.push(game.view().inventory.concat(game.view().creatures).find((c) => c.uid === e.uid)?.price ?? 0);
      });
      for (let i = 0; i < 400; i++) {
        game.state.creatures = [];
        game.state.showcase = [];
        game.state.stats.income = 200;
        Object.assign(game.state.incubators[0]!, { egg: eggId, waiting: false, progress: 1000, elapsed: 1000 });
        tickTapping(game, 1 / 60);
      }
      expect(values.length, eggId).toBeGreaterThan(300);
      // The cap is on the level-1 price before the shop's bonuses (marks, upgrades): a little headroom.
      expect(Math.max(...values), eggId).toBeLessThanOrEqual(200 * eggs.income.rewardCapMin * 1.6);
    }
  });
});

describe('FB-15 a gift ladder egg is a free reward too', () => {
  it('the warm egg of a code hatches at most rewardCapMin minutes of income; a bought one is not capped', () => {
    let gift = 0;
    for (let i = 0; i < 200; i++) {
      const save = newSave(0);
      Object.assign(save.flags, { ftue_starter: true, ftue_done: true, first_egg_warm: true });
      save.stats.hatched = 5;
      save.stats.income = 100;
      save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
      const game = createGame(createStore(save, () => 0), content, createRng(100 + i));
      expect(game.redeemCode('SUNHEARTH')).toBe('ok');
      expect(game.state.incubators[0]!.free).toBe(true);
      Object.assign(game.state.incubators[0]!, { progress: 1000, elapsed: 1000 });
      tickTapping(game, 1 / 60);
      const c = game.state.creatures[0]!;
      const spec = content.species.species.find((x) => x.id === c.species)!;
      gift = Math.max(gift, spec.basePrice * (c.mult ?? 1));
    }
    expect(gift).toBeLessThanOrEqual(100 * eggs.income.rewardCapMin + 1e-6);
  });
});
