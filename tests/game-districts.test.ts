import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-05: districts open by deals (street 20, square 100) and bring their customer type; arrival shares follow customers.json. */
const content = loadGameContent();
const cr = (uid: string, species = 'kettle', level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

function setup(deals: number, creatures: Creature[] = [], seed = 2) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = creatures;
  save.stats.hatched = 5;
  save.stats.deals = deals;
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};
const arrivals = (deals: number, n = 600) => {
  const { game, seen } = setup(deals);
  // Coins enough for an egg: no rescue egg, so the showcase stays empty and draws nobody.
  game.state.coins = 1e6;
  while (seen.filter((e) => e.type === 'customerArrived' && e.customer !== 'golden').length < n) {
    run(game, 1);
    if (game.deal()) game.wait();
  }
  const counts: Record<string, number> = {};
  // Event customers (the golden one, M2-15) are not district arrivals.
  for (const e of seen) if (e.type === 'customerArrived' && e.customer !== 'golden') counts[e.customer] = (counts[e.customer] ?? 0) + 1;
  return counts;
};

describe('M2-05 districts and customer types', () => {
  it('only the yard (thrifty) before 20 deals', () => {
    expect(Object.keys(arrivals(19, 60))).toEqual(['thrifty']);
  });

  it('the 20th deal opens the street (collector) and the odd egg; the 100th — the square (rich) and the glowing egg', () => {
    for (const [deals, district, customer, egg] of [[19, 'street', 'collector', 'egg_odd'], [99, 'square', 'rich', 'egg_glow']] as const) {
      const { game, seen } = setup(deals, [cr('a', 'cloudcat', 3)]);
      expect(game.eggList().map((e) => e.id)).not.toContain(egg);
      run(game, 7);
      expect(game.accept()).toBe(true);
      expect(seen).toContainEqual({ type: 'districtOpened', district, customer });
      expect(seen).toContainEqual({ type: 'eggUnlocked', egg });
      expect(game.eggList().map((e) => e.id)).toContain(egg);
      expect(game.state.flags[`egg_new_${egg}`]).toBe(true);
    }
  });

  it('arrival shares follow the district weights of customers.json (empty showcase)', () => {
    const counts = arrivals(150);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const w = Object.fromEntries(content.customers.districts.map((d) => [d.customer.id, d.weight]));
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    for (const [id, weight] of Object.entries(w)) expect(Math.abs((counts[id] ?? 0) / total - weight / sum)).toBeLessThan(0.05);
  });

  it('each type pays its way: the collector adds for rarity, the rich for level', () => {
    const offerBy = (type: string, creature: Creature) => {
      for (let seed = 1; seed < 200; seed++) {
        const { game } = setup(150, [creature], seed);
        run(game, 7);
        const d = game.deal();
        if (d?.customer === type) return d.share;
      }
      return 0;
    };
    const collector = content.customers.districts.find((d) => d.customer.id === 'collector')!.customer;
    const rich = content.customers.districts.find((d) => d.customer.id === 'rich')!.customer;
    expect(offerBy('collector', cr('r', 'cloudcat'))).toBeGreaterThanOrEqual(collector.offer.min * (1 + collector.rarityBonus!) - 0.01);
    expect(offerBy('rich', cr('x', 'kettle', 5))).toBeGreaterThanOrEqual(rich.offer.min * (1 + rich.levelBonusPerLevel! * 4) - 0.01);
  });
});
