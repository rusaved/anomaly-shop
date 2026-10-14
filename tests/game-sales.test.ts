import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-07: «My sales» — the showcase of the shop is the sale slots; taking off returns the creature to the inventory. */
const content = loadGameContent();
const cr = (uid: string, species = 'kettle') => ({ uid, species, level: 1, fed: 0, hatchedAt: 0, age: 0 });

function setup(creatures = ['a', 'b'], flags: Record<string, boolean> = {}) {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, ...flags };
  save.stats.hatched = 5;
  save.creatures = creatures.map((u) => cr(u));
  save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  return createGame(createStore(save, () => 0), content, createRng(3));
}

describe('M3-07 my sales', () => {
  it('a save from before M3: every creature starts on sale', () => {
    const game = setup(['a', 'b']);
    expect(game.state.showcase).toEqual(['a', 'b']);
    expect(game.view().creatures.map((c) => c.uid)).toEqual(['a', 'b']);
    expect(game.view().inventory).toEqual([]);
  });

  it('take off: the creature goes to the inventory (not sold, not gone), its slot is free; list puts it back', () => {
    const game = setup(['a', 'b']);
    expect(game.unlist('a')).toBe(true);
    expect(game.state.creatures.map((c) => c.uid)).toEqual(['a', 'b']);
    expect(game.view().creatures.map((c) => c.uid)).toEqual(['b']);
    expect(game.view().inventory.map((c) => c.uid)).toEqual(['a']);
    expect(game.freeSlots()).toBe(game.showcaseSlots() - 1);
    expect(game.unlist('a')).toBe(false);
    expect(game.list('a')).toBe(true);
    expect(game.view().creatures.map((c) => c.uid)).toEqual(['b', 'a']);
  });

  it('the slots survive a reload; a full showcase refuses one more', () => {
    const game = setup(['a', 'b', 'c', 'd']);
    const slots = game.showcaseSlots();
    expect(game.state.showcase).toHaveLength(Math.min(4, slots));
    game.unlist('a');
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.showcase).toEqual(game.state.showcase);
    const again = createGame(createStore(back, () => 0), content, createRng(4));
    expect(again.view().inventory.map((c) => c.uid)).toContain('a');
    for (const u of ['a', 'b', 'c', 'd']) again.list(u);
    expect(again.state.showcase.length).toBeLessThanOrEqual(slots);
  });

  it('a hatch with a full showcase waits in the inventory; the counter sells only from the showcase', () => {
    const game = setup([], { showcase_m3: true });
    const slots = game.showcaseSlots();
    game.state.creatures = Array.from({ length: slots }, (_, i) => cr(`s${i}`));
    game.state.showcase = game.state.creatures.map((c) => c.uid);
    game.state.creatures.push(cr('kept', 'cloudcat'));
    expect(game.view().inventory.map((c) => c.uid)).toEqual(['kept']);
    expect(game.view().creatures.some((c) => c.uid === 'kept')).toBe(false);
  });
});
