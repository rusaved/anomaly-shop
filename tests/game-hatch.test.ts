import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { RARITIES } from '../src/content/schemas.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { pickRarity, pickSpecies } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-02: the species comes from the egg's rarity table (docs/01a, section 2); 1 000 hatches within ±3 points. */
const content = loadGameContent();
const RUNS = 1000;

function hatchMany(eggId: string, seed: number): Record<string, number> {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const counts: Record<string, number> = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  game.events.on((e: GameEvent) => {
    if (e.type === 'hatched') counts[e.rarity] = (counts[e.rarity] ?? 0) + 1;
  });
  for (let i = 0; i < RUNS; i++) {
    game.state.creatures = [];
    Object.assign(game.state.incubators[0]!, { egg: eggId, waiting: false, progress: 100, elapsed: 100 });
    game.tick(1 / 60);
  }
  return counts;
}

describe('M1-02 hatch', () => {
  for (const eggId of ['egg_basic', 'egg_warm']) {
    it(`${eggId}: rarity shares of ${RUNS} hatches match eggs.json within ±3 points`, () => {
      const egg = content.eggs.eggs.find((e) => e.id === eggId)!;
      for (const seed of [1, 2024, 777]) {
        const counts = hatchMany(eggId, seed);
        expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(RUNS);
        for (const r of RARITIES) expect(Math.abs((counts[r]! / RUNS) * 100 - egg.chances[r])).toBeLessThanOrEqual(3);
      }
    });
  }

  it('pickRarity follows the table edges; a zero chance never comes up', () => {
    const chances = { common: 85, rare: 13, epic: 2, legendary: 0 };
    expect(pickRarity(chances, 0)).toBe('common');
    expect(pickRarity(chances, 0.8499)).toBe('common');
    expect(pickRarity(chances, 0.85)).toBe('rare');
    expect(pickRarity(chances, 0.9799)).toBe('rare');
    expect(pickRarity(chances, 0.98)).toBe('epic');
    expect(pickRarity(chances, 0.999999)).toBe('epic');
    const rng = createRng(5);
    for (let i = 0; i < 2000; i++) expect(pickRarity(chances, rng.next())).not.toBe('legendary');
  });

  it('pickSpecies gives every species of the rarity a turn and only that rarity', () => {
    const seen = new Set<string>();
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const s = pickSpecies(content.species, 'rare', rng.next());
      expect(s.rarity).toBe('rare');
      seen.add(s.id);
    }
    expect(seen.size).toBe(content.species.species.filter((s) => s.rarity === 'rare').length);
  });

  it('a hatch writes the collection (seen, hatched) and gives every creature its own uid', () => {
    const save = newSave(0);
    const store = createStore(save, () => 0);
    const game = createGame(store, content, createRng(3));
    for (let i = 0; i < 3; i++) {
      Object.assign(game.state.incubators[0]!, { egg: 'egg_basic', waiting: false, progress: 100, elapsed: 100 });
      game.tick(1 / 60);
    }
    const uids = game.state.creatures.map((c) => c.uid);
    expect(new Set(uids).size).toBe(3);
    const hatched = Object.values(game.state.collection).reduce((s, e) => s + e.hatched, 0);
    expect(hatched).toBe(3);
  });
});
