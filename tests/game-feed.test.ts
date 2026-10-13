import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue, tapsForLevel } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M1-04: feeding by taps (docs/01, section 3.3; docs/01a, section 3): 5 taps = a level, the price grows by species.json. */
const content = loadGameContent();

function setup(speciesId = 'kettle') {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.creatures = [
    { uid: 'a', species: speciesId, level: 1, fed: 0, hatchedAt: 0, age: 0 },
    { uid: 'b', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0, age: 0 },
  ];
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(1));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M1-04 feeding', () => {
  it('5 taps take a fresh creature to level 2, then +1 tap per 2 levels', () => {
    const { game, seen } = setup();
    for (let i = 0; i < 4; i++) game.tapCreature('a');
    expect(game.state.creatures[0]).toMatchObject({ level: 1, fed: 4 });
    game.tapCreature('a');
    expect(game.state.creatures[0]).toMatchObject({ level: 2, fed: 0 });
    expect(seen.filter((e) => e.type === 'fed' && e.levelUp)).toHaveLength(1);
    expect(tapsForLevel(1, 5)).toBe(5);
    expect(tapsForLevel(2, 5)).toBe(6);
    expect(tapsForLevel(3, 5)).toBe(6);
    expect(tapsForLevel(4, 5)).toBe(7);
    for (let i = 0; i < 6; i++) game.tapCreature('a');
    expect(game.state.creatures[0]!.level).toBe(3);
  });

  it('the price grows by growth per level from species.json and the event reports the gain', () => {
    const { game, seen } = setup('sockfish');
    const spec = content.species.species.find((s) => s.id === 'sockfish')!;
    for (let i = 0; i < 5; i++) game.tapCreature('a');
    const up = seen.find((e) => e.type === 'fed' && e.levelUp);
    expect(up).toMatchObject({ level: 2, price: coins(spec.basePrice * spec.growth) });
    expect(up && up.type === 'fed' ? up.gain : 0).toBe(coins(spec.basePrice * spec.growth) - coins(spec.basePrice));
    const view = game.view().creatures.find((c) => c.uid === 'a')!;
    expect(view.price).toBe(coins(creatureValue(spec, 2)));
    expect(view.need).toBe(6);
  });

  it('feeding stops at maxLevel (taps still select)', () => {
    const { game, seen } = setup();
    const spec = content.species.species.find((s) => s.id === 'kettle')!;
    game.state.creatures[0]!.level = spec.maxLevel;
    game.tapCreature('a');
    expect(game.state.creatures[0]).toMatchObject({ level: spec.maxLevel, fed: 0 });
    expect(seen.at(-2)).toMatchObject({ type: 'fed', maxed: true, levelUp: false, gain: 0 });
  });

  it('the tapped creature becomes the selected one; a gone selection falls back to the first creature', () => {
    const { game } = setup();
    expect(game.selected()).toBe('a');
    game.tapCreature('b');
    expect(game.selected()).toBe('b');
    expect(game.view().selected).toBe('b');
    game.state.creatures = game.state.creatures.filter((c) => c.uid !== 'b');
    expect(game.selected()).toBe('a');
    expect(game.state.stats.taps).toBe(1);
  });
});
