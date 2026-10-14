import { describe, expect, it } from 'vitest';
import { tickTapping } from './hatch-helper.ts';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { nicePrice, upgradePrice } from '../src/sim/rules.ts';
import { newSave, normalize, parseSave, serialize, type SaveData } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-08: the upgrade shop with 2 positions (second incubator, hatch speed): a purchase changes play and is saved. */
const content = loadGameContent();
const up = (id: string) => content.upgrades.upgrades.find((u) => u.id === id)!;

function setup(save?: SaveData) {
  const s = save ?? newSave(0);
  s.flags.ftue_starter = true;
  s.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
  const store = createStore(s, () => 0);
  const game = createGame(store, content, createRng(5));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

function hatchTime(game: Game, seen: GameEvent[]): number {
  const start = seen.length;
  for (let t = 0; t < 10; t += STEP_SEC) {
    tickTapping(game, STEP_SEC);
    if (seen.slice(start).some((e) => e.type === 'hatched')) return t + STEP_SEC;
  }
  return Infinity;
}

describe('M1-08 upgrades', () => {
  it('the shop shows exactly the 2 M1 positions in order', () => {
    const { game } = setup();
    expect(game.upgradeList().map((u) => u.id)).toEqual(['incubator', 'incubator_speed']);
  });

  it('prices: a geometric row from price1 to priceMax, two significant digits', () => {
    // M2 playtest: softer rows (×2.3 a level, incubators ×5.5).
    expect([0, 1, 2].map((k) => upgradePrice(up('incubator'), k))).toEqual([50, 270, 1500]);
    expect([0, 1, 2, 3, 4].map((k) => upgradePrice(up('incubator_speed'), k))).toEqual([40, 92, 210, 480, 1100]);
    expect(nicePrice(117.7)).toBe(120);
    expect(nicePrice(7.4)).toBe(7);
  });

  it('second incubator: two eggs hatch side by side', () => {
    const { game, seen } = setup();
    game.state.coins = 50 + 20;
    expect(game.buyUpgrade('incubator')).toBe(true);
    expect(game.state.coins).toBe(20);
    expect(game.state.incubators).toHaveLength(2);
    expect(game.buyEgg()).toBe(true);
    expect(game.buyEgg()).toBe(true);
    expect(game.state.incubators.every((i) => i.egg === 'egg_basic')).toBe(true);
    for (let t = 0; t < 3.1; t += STEP_SEC) tickTapping(game, STEP_SEC);
    expect(seen.filter((e) => e.type === 'hatched')).toHaveLength(2);
  });

  it('hatch speed: −10% per level (3 s → 2.7 s)', () => {
    const { game, seen } = setup();
    game.state.coins = 40 + 10;
    expect(game.buyUpgrade('incubator_speed')).toBe(true);
    game.buyEgg();
    expect(Math.abs(hatchTime(game, seen) - 2.7)).toBeLessThan(2 * STEP_SEC);
  });

  it('refused without coins and at the top level; nothing changes', () => {
    const { game, seen } = setup();
    game.state.coins = 49;
    expect(game.buyUpgrade('incubator')).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'coins' });
    game.state.coins = 1e6;
    for (let i = 0; i < 3; i++) expect(game.buyUpgrade('incubator')).toBe(true);
    expect(game.buyUpgrade('incubator')).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'max' });
    expect(game.state.incubators).toHaveLength(4);
    expect(game.buyUpgrade('showcase')).toBe(false);
  });

  it('a purchase is saved: after a reload the incubator and the speed stay', () => {
    const { game } = setup();
    game.state.coins = 90;
    game.buyUpgrade('incubator');
    game.buyUpgrade('incubator_speed');
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.upgrades).toEqual({ incubator: 1, incubator_speed: 1 });
    back.incubators = back.incubators.slice(0, 1);
    const again = setup(back);
    expect(again.game.state.incubators).toHaveLength(2);
    again.game.state.coins = 10;
    again.game.buyEgg();
    expect(Math.abs(hatchTime(again.game, again.seen) - 2.7)).toBeLessThan(2 * STEP_SEC);
  });
});
