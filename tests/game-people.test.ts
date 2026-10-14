import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-18: different customers — a name from a pool of 20 ru/en, an outfit color, an accessory; never two equal names in the queue. */
const content = loadGameContent();

describe('M2-18 different customers', () => {
  it('20 names ru/en, outfits and accessories in customers.json; a feminine type name for every type', () => {
    const p = content.customers.people;
    expect(p.names.length).toBeGreaterThanOrEqual(20);
    expect(new Set(p.names.map((n) => n.ru)).size).toBe(p.names.length);
    expect(p.names.some((n) => n.f) && p.names.some((n) => !n.f)).toBe(true);
    expect(p.outfits.length).toBeGreaterThanOrEqual(4);
    expect(p.accessories.length).toBeGreaterThanOrEqual(4);
    for (const d of content.customers.districts) expect(d.customer.nameF?.ru).toBeTruthy();
  });

  it('a full queue never has two equal names; faces vary across customers', () => {
    for (const seed of [1, 2, 3, 4]) {
      const save = newSave(0);
      save.flags.ftue_starter = true;
      save.flags.ftue_done = true;
      save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
      save.stats.hatched = 2;
      save.stats.deals = 150;
      save.upgrades = { bell: 1 };
      const game = createGame(createStore(save, () => 0), content, createRng(seed));
      const faces = new Set<string>();
      for (let i = 0; i < 80; i++) {
        for (let t = 0; t < 7; t += STEP_SEC) game.tick(STEP_SEC);
        const q = game.view().queue.filter((x) => x.person >= 0);
        expect(new Set(q.map((x) => x.person)).size).toBe(q.length);
        for (const x of q) faces.add(`${x.person}:${x.outfit}:${x.accessory}`);
        const d = game.deal();
        if (d) {
          expect(d.person).toBe(game.view().queue[0]!.person);
          game.wait();
        }
      }
      expect(faces.size).toBeGreaterThan(15);
    }
  });
});
