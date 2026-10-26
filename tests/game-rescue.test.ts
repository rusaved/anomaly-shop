import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** No dead end: a shop with no creatures, no eggs and too few coins for an egg gets a free one (found by sim:balance, M1-11). */
const content = loadGameContent();

describe('rescue egg', () => {
  it('an empty shop with 8 coins gets a free basic egg, once', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_fed: true, ftue_bought: true, ftue_done: true };
    save.stats = { deals: 3, coinsEarned: 30, hatched: 3, taps: 40, levelUps: 0, haggles: 0 };
    save.coins = 8;
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    const seen: GameEvent[] = [];
    game.events.on((e) => seen.push(e));
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    expect(game.state.coins).toBe(8);
    game.tick(1 / 60);
    expect(seen.filter((e) => e.type === 'rescueEgg')).toHaveLength(1);
  });

  it('no gift while there are coins for an egg, or a creature to sell and a coin left', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_done: true };
    save.stats.hatched = 2;
    save.coins = 10;
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBeNull();
    game.state.coins = 5;
    game.state.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBeNull();
  });

  it('P-03 (Q-057 Б): past the first minute 0 coins with no egg anywhere brings the free egg at once, even with pets; then once in rescueGapSec', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_fed: true, ftue_bought: true, ftue_done: true };
    save.stats = { deals: 3, coinsEarned: 30, hatched: 3, taps: 40, levelUps: 0, haggles: 0 };
    save.coins = 0;
    save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    const seen: GameEvent[] = [];
    game.events.on((e) => seen.push(e));
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    expect(seen.filter((e) => e.type === 'rescueEgg')).toHaveLength(1);
    // The egg hatched, the coins still 0: no second gift before the gap is over.
    game.state.incubators[0]!.egg = null;
    for (let t = 0; t < content.eggs.rescueGapSec - 1; t += 0.5) game.tick(0.5);
    expect(seen.filter((e) => e.type === 'rescueEgg')).toHaveLength(1);
    for (let t = 0; t < 2; t += 0.5) game.tick(0.5);
    expect(seen.filter((e) => e.type === 'rescueEgg')).toHaveLength(2);
  });

  it('P-03: not in the first minute — the lessons keep their own way (a pet to sell)', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_fed: true };
    save.stats.hatched = 1;
    save.coins = 0;
    save.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBeNull();
  });
});
