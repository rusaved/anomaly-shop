import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M6-21 (docs/01b §3): events 13–15 — anomalous weather, the mouse, the egg parade. Only a plus, like the others. */
const base = loadGameContent();
const only = (kind: string): GameContent => ({ ...base, events: { ...base.events, events: base.events.events.map((e) => ({ ...e, fromMin: 0, weight: e.kind === kind ? 1 : 0 })) } });

function setup(kind: string) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true });
  save.stats.hatched = 5;
  save.stats.deals = 10;
  save.creatures = [
    { uid: 'a', species: 'kettle', level: 3, fed: 0, hatchedAt: 0, age: 0 },
    { uid: 'b', species: 'mug_cub', level: 2, fed: 0, hatchedAt: 0, age: 0 },
  ];
  save.showcase = ['a', 'b'];
  const game = createGame(createStore(save, () => 0), only(kind), createRng(4));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const until = (game: Game, ok: () => boolean, sec = 200): void => {
  for (let t = 0; t < sec && !ok(); t += STEP_SEC) {
    game.tick(STEP_SEC);
    for (const c of game.chats()) if (c.state === 'open') game.chatDecline(c.id);
  }
};
const price = (game: Game, uid: string) => game.view().creatures.find((c) => c.uid === uid)!;

describe('M6-21 events 13–15', () => {
  it('weather: every pet on the shelf shines (the shiny tint) at ×1.2 for a minute, then back; it ends as a gift, not missed', () => {
    const { game, seen } = setup('weather');
    const before = price(game, 'a').price;
    until(game, () => game.view().event !== null);
    expect(game.view().event?.kind).toBe('weather');
    const shiny = base.species.marks.list.find((m) => m.id === 'shiny')!;
    expect(game.view().creatures.length).toBeGreaterThan(0);
    for (const c of game.view().creatures) expect(c).toMatchObject({ mark: 'shiny', tint: shiny.tint });
    // The shelf price grows by itself as well (+5 % a minute): at least ×1.2 while it shines, down by the shine when it ends.
    const during = price(game, 'a').price;
    expect(during).toBeGreaterThanOrEqual(Math.round(before * 1.2));
    let last = during;
    until(game, () => {
      if (game.view().event) last = price(game, 'a').price;
      return game.view().event === null;
    }, 70);
    expect(price(game, 'a')).toMatchObject({ mark: '', tint: '' });
    expect(price(game, 'a').price).toBeLessThan(last / 1.15);
    expect(seen.find((e) => e.type === 'eventEnded')).toMatchObject({ kind: 'weather', outcome: 'done' });
  });

  it('mouse: a tap pays coins of its range', () => {
    const { game } = setup('mouse');
    until(game, () => game.view().event !== null);
    const coins = game.state.coins;
    game.tapEvent();
    const got = game.state.coins - coins;
    const data = base.events.events.find((e) => e.kind === 'mouse') as { coins: { min: number; max: number } };
    expect(got).toBeGreaterThanOrEqual(data.coins.min);
    expect(got).toBeLessThanOrEqual(data.coins.max);
    expect(game.view().event).toBeNull();
  });

  it('parade: a tap takes one of the rolling eggs (an open one of the list) into a free incubator', () => {
    const { game, seen } = setup('parade');
    until(game, () => game.view().event !== null);
    game.tapEvent();
    const bought = seen.find((e) => e.type === 'eggBought');
    expect(bought).toMatchObject({ price: 0, by: 'gift' });
    const list = (base.events.events.find((e) => e.kind === 'parade') as { eggs: string[] }).eggs;
    expect(list).toContain((bought as { egg: string }).egg);
    expect(game.state.incubators.some((i) => i.egg)).toBe(true);
  });
});
