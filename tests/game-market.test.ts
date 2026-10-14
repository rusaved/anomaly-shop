import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-09: the market — lots from seller-characters, a 60–90 s refresh, «don't wait», the verdict below / at / above the market. */
const content = loadGameContent();
const m = content.market;

function setup(coins = 0, seed = 1) {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
  save.stats.hatched = 5;
  save.stats.deals = 30;
  save.coins = coins;
  save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  return createGame(createStore(save, () => 0), content, createRng(seed));
}

describe('M3-09 market', () => {
  it('lots come at once, then the sellers bring new ones every 60–90 s; «don\'t wait» refreshes now', () => {
    const game = setup();
    game.tick(STEP_SEC);
    const first = game.market();
    expect(first.lots).toHaveLength(m.lots);
    expect(first.refreshIn).toBeGreaterThanOrEqual(m.refreshSec.min - 1);
    expect(first.refreshIn).toBeLessThanOrEqual(m.refreshSec.max);
    for (let t = 0; t < m.refreshSec.max + 1; t += 1) game.tick(1);
    expect(game.market().lots[0]!.id).not.toBe(first.lots[0]!.id);
    const before = game.market().lots[0]!.id;
    game.refreshMarket();
    expect(game.market().lots[0]!.id).not.toBe(before);
  });

  it('the share of good deals follows market.json goodShare; prices stay within price.min…max of the value', () => {
    const game = setup(0, 7);
    let below = 0;
    let all = 0;
    for (let i = 0; i < 300; i++) {
      game.refreshMarket();
      for (const l of game.market().lots) {
        all += 1;
        if (l.verdict === 'below') below += 1;
        // Whole coins: one coin of rounding either way.
        expect(l.price).toBeGreaterThanOrEqual(Math.floor(l.value * m.price.min) - 1);
        expect(l.price).toBeLessThanOrEqual(Math.ceil(l.value * m.price.max) + 1);
        expect(content.customers.characters.some((c) => c.id === l.character)).toBe(true);
      }
    }
    expect(Math.abs(below / all - m.goodShare)).toBeLessThan(0.05);
  });

  it('buying a lot: coins go, the creature goes on sale (or into the inventory), the lot is sold; the market survives a reload', () => {
    const game = setup(100000);
    game.tick(STEP_SEC);
    const lot = game.market().lots[0]!;
    const coins = game.state.coins;
    expect(game.buyLot(lot.id)).toBe(true);
    expect(game.state.coins).toBe(coins - lot.price);
    expect(game.state.creatures.some((c) => c.species === lot.species && c.level === lot.level)).toBe(true);
    expect(game.market().lots[0]!.sold).toBe(true);
    expect(game.buyLot(lot.id)).toBe(false);
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.market.lots.map((l) => l.id)).toEqual(game.state.market.lots.map((l) => l.id));
    expect(setup(0).buyLot(lot.id)).toBe(false);
  });
});
