import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-10: the seller chat — a shared hobby gives 5–15% off once; «I'll take it for…» works within the seller's give. */
const content = loadGameContent();

function setup(character: string, price = 100, coins = 1000, seed = 1) {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
  save.stats.hatched = 5;
  save.coins = coins;
  save.market = { lots: [{ id: 1, species: 'cloudcat', level: 3, price, person: 0, character, hobby: 'fishing', sold: false, hobbyDone: false, bargained: false }], refreshIn: 999 };
  return createGame(createStore(save, () => 0), content, createRng(seed));
}

describe('M3-10 seller chat', () => {
  it('«How are you?» + the hobby: a discount within market.json hobbyDiscount, once per lot', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const game = setup('chatty', 1000, 0, seed);
      const off = game.lotHobby(1);
      const { min, max } = content.market.hobbyDiscount;
      expect(off).toBeGreaterThanOrEqual(min);
      expect(off).toBeLessThanOrEqual(max);
      expect(game.market().lots[0]!.price).toBe(Math.round(1000 * (1 - off)));
      expect(game.lotHobby(1)).toBe(0);
    }
  });

  it('«Discount? I\'ll take it for…»: within the give of the character the lot is bought at that price; below it — no, and once only', () => {
    const rich = content.customers.characters.find((c) => c.id === 'rich')!;
    const ok = setup('rich');
    const want = Math.ceil(100 * (1 - rich.give));
    expect(ok.lotBargain(1, want)).toBe('yes');
    expect(ok.state.coins).toBe(1000 - want);
    expect(ok.market().lots[0]!.sold).toBe(true);
    const greedy = content.customers.characters.find((c) => c.id === 'greedy')!;
    const no = setup('greedy');
    expect(no.lotBargain(1, Math.floor(100 * (1 - greedy.give)) - 2)).toBe('no');
    expect(no.state.coins).toBe(1000);
    expect(no.lotBargain(1, 100)).toBe('done');
    expect(no.buyLot(1)).toBe(true);
  });

  it('not enough coins: the bargain can be tried again', () => {
    const poor = setup('rich', 100, 10);
    expect(poor.lotBargain(1, 95)).toBe('coins');
    poor.state.coins = 1000;
    expect(poor.lotBargain(1, 95)).toBe('yes');
  });
});
