import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-01: the collection by rarity — «N/M», statuses not yet / in the shop / sold, a full row gives crystals once and a price bonus. */
const content = loadGameContent();
const byRarity = (r: string) => content.species.species.filter((s) => s.rarity === r).map((s) => s.id);

function shop(collection: Record<string, { seen: number; hatched: number; sold: number }>, creatures: string[] = []) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.collection = collection;
  save.creatures = creatures.map((sp, i) => ({ uid: `k${i}`, species: sp, level: 1, fed: 0, hatchedAt: 0, age: 0 }));
  save.coins = 1e6;
  const game = createGame(createStore(save, () => 0), content, createRng(11));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M4-01 collection', () => {
  it('statuses: never had — not yet; have now — in the shop; had and sold — sold; «N of M» counts the ones had', () => {
    const [a, b, c] = byRarity('common').concat(byRarity('good'));
    const { game } = shop({ [b!]: { seen: 1, hatched: 1, sold: 1 } }, [a!]);
    const view = game.collection();
    const status = (id: string) => view.rows.flatMap((r) => r.species).find((x) => x.id === id)?.status;
    expect(status(a!)).toBe('shop');
    expect(status(b!)).toBe('sold');
    expect(status(c!)).toBe('none');
    expect(view.have).toBe(2);
    expect(view.all).toBe(content.species.species.length);
    expect(view.rows.map((r) => r.rarity)).toEqual(['common', 'good', 'valuable', 'premium', 'vip', 'exclusive']);
  });

  it('the last species of a row: crystals once, the row bonus raises the price of that rarity for good', () => {
    const row = byRarity('common');
    const have = Object.fromEntries(row.slice(1).map((id) => [id, { seen: 1, hatched: 1, sold: 1 }]));
    const { game, seen } = shop(have, [row[0]!]);
    const price = () => { const v = game.view(); return [...v.creatures, ...v.inventory, ...v.talking].find((x) => x.uid === 'k0')?.price ?? 0; };
    const before = price();
    expect(before).toBeGreaterThan(0);
    // The missing one arrives from the market (a lot of that species).
    game.state.market.lots = [{ id: 99, species: row[0]!, level: 1, price: 1, person: 0, character: content.customers.characters[0]!.id, hobby: '', sold: false, hobbyDone: false, bargained: false }];
    game.state.collection[row[0]!] = { seen: 0, hatched: 0, sold: 0 };
    const crystals = game.state.crystals;
    expect(game.buyLot(99)).toBe(true);
    expect(seen.filter((e) => e.type === 'rowDone')).toEqual([{ type: 'rowDone', rarity: 'common', crystals: content.collection.rowCrystals.common, bonus: content.collection.rowBonus.common }]);
    expect(game.state.crystals).toBe(crystals + content.collection.rowCrystals.common);
    expect(game.collection().rows[0]!.done).toBe(true);
    const after = price();
    expect(after).toBeGreaterThan(before);
  });
});
