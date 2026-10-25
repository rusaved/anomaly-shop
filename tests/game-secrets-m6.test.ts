import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M6-20 (docs/01b §2): window, clock and flower with their secrets, the tickle, the milestone label's hello. */
const content = loadGameContent();

function shop() {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.creatures.push({ uid: 'a', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 }, { uid: 'b', species: 'button_bug', level: 2, fed: 0, hatchedAt: 0, age: 0 });
  const game = createGame(createStore(save, () => 0), content, createRng(3));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  const wait = (sec: number) => {
    for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
  };
  return { game, seen, wait };
}

describe('M6-20 new things and small secrets', () => {
  it('window: a cloud on every tap, the winged teapot at 15 (coins once); flower: a leaf, the bloom at 30 marks «Gardener»', () => {
    const { game, seen } = shop();
    for (let i = 0; i < 15; i++) game.tapThing('pane');
    expect(seen.filter((e) => e.type === 'thingTapped' && e.target === 'pane').every((e) => e.type === 'thingTapped' && e.first === 'cloud')).toBe(true);
    expect(seen.find((e) => e.type === 'secret' && e.show === 'teapot')).toMatchObject({ coins: 5, repeat: false });
    for (let i = 0; i < 30; i++) game.tapThing('flower');
    expect(seen.find((e) => e.type === 'secret' && e.show === 'bloom')).toBeDefined();
    expect(game.state.flags.seen_secret_flower_bloom).toBe(true);
    expect(game.state.secrets.flower).toBe(30);
  });

  it('the milestone label says hello on the 7th tap, once with a coin; the clock answers «tick» and has no counter secret', () => {
    const { game, seen } = shop();
    const coins = game.state.coins;
    for (let i = 0; i < 7; i++) game.tapThing('label');
    expect(seen.find((e) => e.type === 'secret' && e.show === 'hello')).toMatchObject({ coins: 1 });
    expect(game.state.coins).toBe(coins + 1);
    for (let i = 0; i < 50; i++) game.tapThing('clock');
    expect(seen.filter((e) => e.type === 'secret' && e.target === 'clock')).toHaveLength(0);
    expect(seen.some((e) => e.type === 'thingTapped' && e.target === 'clock' && e.first === 'tick')).toBe(true);
  });

  it('a tickle: 10 taps on one pet within 3 s laugh and give a coin; slow taps do not; the run starts again', () => {
    const { game, seen, wait } = shop();
    const coins = game.state.coins;
    for (let i = 0; i < 9; i++) {
      game.tapCreature('a');
      wait(0.5);
    }
    expect(seen.filter((e) => e.type === 'tickle')).toHaveLength(0);
    for (let i = 0; i < 10; i++) {
      game.tapCreature('b');
      wait(0.2);
    }
    expect(seen.filter((e) => e.type === 'tickle')).toEqual([{ type: 'tickle', uid: 'b', coins: content.secrets.tickle.coins }]);
    expect(game.state.coins).toBe(coins + content.secrets.tickle.coins);
    for (let i = 0; i < 9; i++) game.tapCreature('b');
    expect(seen.filter((e) => e.type === 'tickle')).toHaveLength(1);
    // The next tickle within cooldownSec laughs but pays nothing (the game design review: no coin farm).
    game.tapCreature('b');
    expect(seen.filter((e) => e.type === 'tickle').at(-1)).toEqual({ type: 'tickle', uid: 'b', coins: 0 });
    expect(game.state.coins).toBe(coins + content.secrets.tickle.coins);
    wait(content.secrets.tickle.cooldownSec);
    for (let i = 0; i < 10; i++) game.tapCreature('b');
    expect(seen.filter((e) => e.type === 'tickle').at(-1)).toMatchObject({ coins: content.secrets.tickle.coins });
  });

  it('the clock strikes noon and midnight only: every pet gets food (a level for a pet one tap short)', () => {
    const { game, seen } = shop();
    expect(game.chime(15)).toBe(false);
    const fedBefore = game.state.creatures.map((c) => c.fed + c.level * 100);
    expect(game.chime(12)).toBe(true);
    expect(seen.find((e) => e.type === 'chime')).toEqual({ type: 'chime', hour: 12, fed: 1 });
    const fedAfter = game.state.creatures.map((c) => c.fed + c.level * 100);
    fedAfter.forEach((v, i) => expect(v).toBeGreaterThan(fedBefore[i]!));
    expect(game.chime(0)).toBe(true);
  });
});
