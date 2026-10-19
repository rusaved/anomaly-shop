import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { RARITIES, type RarityName } from '../src/content/schemas.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { careBonus, careChances, careLevel } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-02: egg care (docs/01 §3 p. 12, our improvement 1) — warmth, food and ripening shift the odds and tint the shell. */
const content = loadGameContent();
const care = content.eggs.care;
const egg = content.eggs.eggs.find((e) => e.id === 'egg_warm')!;
const RUNS = 3000;

function setup(seed = 1, coins = 0) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.flags.first_egg_warm = true;
  save.stats.hatched = 10;
  save.coins = coins;
  save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

const STATES = {
  none: { taps: 0, fed: 0, ripeSec: 0 },
  warm: { taps: care.warm.tapsPerStep * care.warm.steps, fed: 0, ripeSec: 0 },
  fed: { taps: 0, fed: care.feed.steps, ripeSec: 0 },
  ripe: { taps: 0, fed: 0, ripeSec: care.ripe.afterSec },
  all: { taps: 99, fed: care.feed.steps, ripeSec: care.ripe.afterSec },
};

describe('M3-02 egg care rules', () => {
  it('the bonus: warmth by steps of taps, food by portions, ripening after afterSec, capped at maxBonus', () => {
    expect(careBonus(STATES.none, care)).toBe(0);
    expect(careBonus({ taps: care.warm.tapsPerStep - 1, fed: 0, ripeSec: 0 }, care)).toBe(0);
    expect(careBonus(STATES.warm, care)).toBeCloseTo(care.warm.steps * care.warm.bonus, 9);
    expect(careBonus({ ...STATES.warm, taps: 999 }, care)).toBeCloseTo(care.warm.steps * care.warm.bonus, 9);
    expect(careBonus(STATES.fed, care)).toBeCloseTo(care.feed.steps * care.feed.bonus, 9);
    expect(careBonus(STATES.ripe, care)).toBeCloseTo(care.ripe.bonus, 9);
    expect(careBonus(STATES.all, care)).toBeCloseTo(care.maxBonus, 9);
  });

  it('the odds still sum to 100 and every step up gets more; zero care changes nothing', () => {
    expect(careChances(egg.chances, 0)).toEqual(egg.chances);
    const up = careChances(egg.chances, care.maxBonus);
    expect(RARITIES.reduce((s, r) => s + up[r], 0)).toBeCloseTo(100, 9);
    expect(up.common).toBeLessThan(egg.chances.common);
    expect(up.exclusive).toBeGreaterThan(egg.chances.exclusive);
  });

  it('the shell color: the egg own color without care, then one step per share of the bonus', () => {
    expect(careLevel(0, care)).toBe(0);
    expect(careLevel(care.warm.bonus, care)).toBeGreaterThanOrEqual(1);
    expect(careLevel(care.maxBonus, care)).toBe(care.shell.length - 1);
  });

  for (const [name, state] of Object.entries(STATES)) {
    it(`hatches with care «${name}»: ${RUNS} runs match the shifted odds within ±3 points`, () => {
      const want = careChances(egg.chances, careBonus(state, care), care.topShare);
      const got = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<RarityName, number>;
      const { game, seen } = setup(7);
      for (let i = 0; i < RUNS; i++) {
        const need = egg.hatchSec;
        game.state.incubators[0] = { egg: egg.id, startedAt: 0, progress: need, elapsed: need, waiting: false, careTaps: state.taps, careFed: state.fed, ripeSec: state.ripeSec };
        game.tapIncubator(0);
        const hatched = [...seen].reverse().find((x) => x.type === 'hatched');
        if (hatched?.type === 'hatched') got[hatched.rarity] += 1;
        game.state.creatures = [];
        seen.length = 0;
      }
      for (const r of RARITIES) expect(Math.abs((got[r] / RUNS) * 100 - want[r]), r).toBeLessThanOrEqual(3);
    });
  }

  it('food costs a share of the egg price, up to its portions; the shell tint shows in the view', () => {
    const { game, seen } = setup(1, 1000);
    game.state.incubators[0] = { egg: egg.id, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    const price = Math.max(1, Math.round(egg.price.coins * care.feed.priceShare));
    expect(game.view().incubators[0]).toMatchObject({ feedPrice: price, care: 0, careLevel: 0 });
    for (let i = 0; i < care.feed.steps; i++) expect(game.feedEgg(0)).toBe(true);
    expect(game.feedEgg(0)).toBe(false);
    expect(game.state.coins).toBe(1000 - price * care.feed.steps);
    expect(game.view().incubators[0]).toMatchObject({ feedPrice: null });
    expect(game.view().incubators[0]!.careLevel).toBeGreaterThan(0);
    expect(seen.filter((e) => e.type === 'eggFed')).toHaveLength(care.feed.steps);
    const poor = setup(1, 0).game;
    poor.state.incubators[0] = { egg: egg.id, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    expect(poor.feedEgg(0)).toBe(false);
  });

  it('a ready egg waits for a tap and ripens; left alone it hatches by itself after selfSec', () => {
    const { game, seen } = setup(3);
    game.state.incubators[0] = { egg: egg.id, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    for (let t = 0; t < egg.hatchSec + 0.1; t += STEP_SEC) game.tick(STEP_SEC);
    expect(seen.some((e) => e.type === 'eggReady')).toBe(true);
    expect(game.view().incubators[0]!.ready).toBe(true);
    for (let t = 0; t < care.ripe.afterSec + 0.1; t += STEP_SEC) game.tick(STEP_SEC);
    expect(game.view().incubators[0]!.care).toBeCloseTo(care.ripe.bonus, 9);
    expect(seen.some((e) => e.type === 'hatched')).toBe(false);
    for (let t = 0; t < care.ripe.selfSec - care.ripe.afterSec + 0.1; t += STEP_SEC) game.tick(STEP_SEC);
    expect(seen.some((e) => e.type === 'hatched')).toBe(true);
  });

  it('taps before ready warm the egg; a tap on a ready egg hatches it', () => {
    const { game, seen } = setup(4);
    game.state.incubators[0] = { egg: egg.id, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
    for (let i = 0; i < care.warm.tapsPerStep; i++) game.tapIncubator(0);
    expect(game.view().incubators[0]!.care).toBeCloseTo(care.warm.bonus, 9);
    game.state.incubators[0]!.progress = egg.hatchSec;
    game.state.incubators[0]!.elapsed = egg.hatchSec;
    game.tapIncubator(0);
    expect(seen.some((e) => e.type === 'hatched')).toBe(true);
    expect(game.state.incubators[0]!.egg).toBeNull();
  });
});

describe('FB-05 care moves the odds', () => {
  it('full care at least doubles VIP and exclusive of every ladder egg, the rest sums to 100', () => {
    for (const e of loadGameContent().eggs.eggs.filter((x) => x.section === 'ladder')) {
      const up = careChances(e.chances, care.maxBonus, care.topShare);
      expect(up.vip + up.exclusive, e.id).toBeGreaterThanOrEqual((e.chances.vip + e.chances.exclusive) * 1.95);
      expect(RARITIES.reduce((s, r) => s + up[r], 0)).toBeCloseTo(100, 9);
    }
    expect(care.maxBonus).toBeGreaterThan(0.3);
  });
});
