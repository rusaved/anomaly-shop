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

  it('no gift while there is a creature to sell or coins for an egg', () => {
    const save = newSave(0);
    save.flags = { ftue_starter: true, ftue_done: true };
    save.stats.hatched = 2;
    save.coins = 10;
    const game = createGame(createStore(save, () => 0), content, createRng(1));
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBeNull();
    game.state.coins = 0;
    game.state.creatures = [{ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }];
    game.tick(1 / 60);
    expect(game.state.incubators[0]!.egg).toBeNull();
  });
});
