import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { priceRange } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-05: the result of a hatch — the price range and «Sell now» at its low end; a tapped egg says so in the event. */
const content = loadGameContent();

function setup() {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.stats.hatched = 3;
  save.incubators = [{ egg: 'egg_basic', startedAt: 0, progress: 3, elapsed: 3, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(2));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M3-05 hatch result', () => {
  it('the range: low and high as shares of the appraisal (market.json range)', () => {
    expect(priceRange(100, content.market.range)).toEqual({ low: Math.round(100 * content.market.range.low), high: Math.round(100 * content.market.range.high) });
    expect(priceRange(1, content.market.range).low).toBeGreaterThanOrEqual(1);
  });

  it('a tapped egg hatches «by tap» with its egg id; «sell now» pays the low end and counts as a deal', () => {
    const { game, seen } = setup();
    game.tapIncubator(0);
    const h = seen.find((e) => e.type === 'hatched');
    expect(h).toMatchObject({ by: 'tap', egg: 'egg_basic' });
    const cr = game.view().creatures[0]!;
    expect(cr.low).toBeLessThan(cr.price);
    expect(cr.high).toBeGreaterThan(cr.price);
    const coins = game.state.coins;
    expect(game.sellNow(cr.uid)).toBe(true);
    expect(game.state.coins).toBe(coins + cr.low);
    expect(game.state.creatures).toHaveLength(0);
    expect(game.state.stats.deals).toBe(1);
    expect(seen.find((e) => e.type === 'soldNow')).toMatchObject({ price: cr.low });
    expect(game.sellNow(cr.uid)).toBe(false);
  });
});
