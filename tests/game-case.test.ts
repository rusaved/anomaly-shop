import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** UB-03: the hatch as a case — the first egg opens with one tap; a tapped egg's creature waits for the player's choice in the inventory. */
const content = loadGameContent();

describe('UB-03 hatch as a case', () => {
  it('the starter egg opens with one tap (ftue.json firstEggOneTap): hatched by tap at once, common', () => {
    const game = createGame(createStore(newSave(0), () => 0), content, createRng(5));
    const seen: GameEvent[] = [];
    game.events.on((e) => seen.push(e));
    expect(game.state.incubators[0]!.waiting).toBe(true);
    game.tapIncubator(0);
    expect(seen.find((e) => e.type === 'hatched')).toMatchObject({ by: 'tap', rarity: content.ftue.firstRarity });
    expect(game.state.incubators[0]!.egg).toBeNull();
  });

  it('the creature of a tapped egg is in the inventory, not on the shelf, until the player picks «To the shop»', () => {
    const game = createGame(createStore(newSave(0), () => 0), content, createRng(5));
    game.tapIncubator(0);
    const uid = game.state.creatures[0]!.uid;
    expect(game.view().creatures).toEqual([]);
    expect(game.view().inventory.map((c) => c.uid)).toEqual([uid]);
    expect(game.list(uid)).toBe(true);
    expect(game.view().creatures.map((c) => c.uid)).toEqual([uid]);
  });

  it('a second egg needs its time: one tap only warms it', () => {
    const save = newSave(0);
    save.flags.ftue_starter = true;
    save.stats.hatched = 1;
    save.incubators = [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
    const game = createGame(createStore(save, () => 0), content, createRng(5));
    game.tapIncubator(0);
    expect(game.state.incubators[0]!.egg).toBe('egg_basic');
    expect(game.state.stats.hatched).toBe(1);
  });
});
