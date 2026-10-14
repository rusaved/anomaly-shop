import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-16: easter eggs — a reply to every tap on the sign, the door, the lamp; secrets at 10 and 50 (sign), 10 (door), 7 in a row (lamp). */
const content = loadGameContent();

function setup(save = newSave(0)) {
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  const game = createGame(createStore(save, () => 0), content, createRng(2));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const secrets = (seen: GameEvent[]) => seen.filter((e) => e.type === 'secret') as Array<Extract<GameEvent, { type: 'secret' }>>;

describe('M2-16 easter eggs', () => {
  it('every tap gets a reply (the first one too)', () => {
    const { game, seen } = setup();
    for (const target of ['sign', 'door', 'lamp'] as const) game.tapThing(target);
    expect(seen.filter((e) => e.type === 'thingTapped').map((e) => (e.type === 'thingTapped' ? e.target : ''))).toEqual(['sign', 'door', 'lamp']);
  });

  it('sign: a secret at 10 and at 50 taps, coins once', () => {
    const { game, seen } = setup();
    for (let i = 0; i < 9; i++) game.tapThing('sign');
    expect(secrets(seen)).toHaveLength(0);
    game.tapThing('sign');
    expect(secrets(seen)).toEqual([expect.objectContaining({ id: 'sign', show: 'hop', coins: 3, repeat: false })]);
    for (let i = 0; i < 40; i++) game.tapThing('sign');
    expect(secrets(seen).map((e) => e.show)).toEqual(['hop', 'glow']);
    expect(game.state.coins).toBe(13);
  });

  it('door: a knock back at 10 taps; the counter lives in the save', () => {
    const { game, seen } = setup();
    for (let i = 0; i < 6; i++) game.tapThing('door');
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.secrets.door).toBe(6);
    const again = setup(back);
    for (let i = 0; i < 4; i++) again.game.tapThing('door');
    expect(secrets(again.seen)).toEqual([expect.objectContaining({ id: 'door', show: 'knock' })]);
    expect(secrets(seen)).toHaveLength(0);
  });

  it('lamp: 7 taps in a row (each within streakSec) start a disco; a pause breaks the streak', () => {
    const { game, seen } = setup();
    for (let i = 0; i < 6; i++) game.tapThing('lamp');
    for (let t = 0; t < content.secrets.streakSec + 0.2; t += STEP_SEC) game.tick(STEP_SEC);
    game.tapThing('lamp');
    expect(secrets(seen)).toHaveLength(0);
    for (let i = 0; i < 6; i++) {
      game.tick(0.3);
      game.tapThing('lamp');
    }
    expect(secrets(seen)).toEqual([expect.objectContaining({ id: 'lamp', show: 'disco', coins: 5 })]);
    for (let i = 0; i < 7; i++) game.tapThing('lamp');
    expect(secrets(seen)).toHaveLength(2);
    expect(secrets(seen)[1]).toMatchObject({ show: 'disco', coins: 0, repeat: true });
  });
});
