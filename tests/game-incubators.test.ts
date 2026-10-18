import { describe, expect, it } from 'vitest';
import { tickTapping } from './hatch-helper.ts';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { upgradePrice } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { computeShopLayout } from '../src/scene/shop-layout.ts';
import { computeLayout, sceneTop } from '../src/ui/layout.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-01: incubators up to 4 and hatch speed up to 5 levels, all from upgrades.json. */
const content = loadGameContent();
const up = (id: string) => content.upgrades.upgrades.find((u) => u.id === id)!;

function setup() {
  const s = newSave(0);
  s.flags.ftue_starter = true;
  s.incubators[0] = { egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false };
  const store = createStore(s, () => 0);
  const game = createGame(store, content, createRng(9));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M2-01 incubators and hatch speed', () => {
  it('incubators: 1 at start + levels of upgrades.json = 4, then max', () => {
    const { game } = setup();
    const u = up('incubator');
    expect(1 + u.levels * (u.effect.type === 'slots' ? u.effect.perLevel : 0)).toBe(4);
    game.state.coins = 1e7;
    let spent = 0;
    for (let i = 0; i < u.levels; i++) {
      spent += upgradePrice(u, i);
      expect(game.buyUpgrade('incubator')).toBe(true);
    }
    expect(game.state.incubators).toHaveLength(4);
    expect(game.state.coins).toBe(1e7 - spent);
    expect(game.buyUpgrade('incubator')).toBe(false);
    expect(game.upgradeList().find((x) => x.id === 'incubator')).toMatchObject({ maxed: true, level: u.levels });
  });

  it('hatch speed: 5 levels from upgrades.json, each −10%; a basic egg hatches in half the time at the top', () => {
    const { game, seen } = setup();
    const u = up('incubator_speed');
    expect(u.levels).toBe(5);
    game.state.coins = 1e7;
    for (let i = 0; i < u.levels; i++) expect(game.buyUpgrade('incubator_speed')).toBe(true);
    expect(game.buyUpgrade('incubator_speed')).toBe(false);
    expect(seen.at(-1)).toMatchObject({ type: 'denied', reason: 'max' });
    game.buyEgg();
    let t = 0;
    while (!seen.some((e) => e.type === 'hatched') && t < 5) {
      tickTapping(game, STEP_SEC);
      t += STEP_SEC;
    }
    const egg = content.eggs.eggs.find((e) => e.id === 'egg_basic')!;
    expect(Math.abs(t - egg.hatchSec * 0.5)).toBeLessThan(2 * STEP_SEC);
  });

  it('four incubators fit the counter on phones in both orientations, each with a 44 px tap zone', () => {
    for (const [w, h] of [[375, 812], [812, 375], [320, 568], [1280, 720]] as const) {
      const page = computeLayout(w, h);
      const l = computeShopLayout(page.stage, sceneTop(page), 0.34, 4, 18, 4);
      expect(l.incubators).toHaveLength(4);
      for (const s of l.incubators) {
        expect(s.r * 1.25 * 2).toBeGreaterThanOrEqual(44);
        expect(s.x - s.r).toBeGreaterThanOrEqual(l.counterTop.x - 1);
        expect(s.x + s.r).toBeLessThanOrEqual(l.counterTop.x + l.counterTop.w + 1);
      }
      for (let i = 1; i < 4; i++) expect(l.incubators[i]!.x - l.incubators[i - 1]!.x).toBeGreaterThanOrEqual(l.incubators[i]!.r * 2);
    }
  });
});
