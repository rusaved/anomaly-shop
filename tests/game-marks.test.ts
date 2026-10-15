import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { newSave, normalize, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-25: marks — «Shiny» ×1.5, «Sleepy» eats twice slower but ×1.2, «Singing» better offers; ~10% at hatching; kept in the save. */
const content = loadGameContent();
const marks = content.species.marks;

function shop(creatures: Creature[] = []) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.stats.hatched = 5;
  save.creatures = creatures;
  return createGame(createStore(save, () => 0), content, createRng(11));
}
const kettle = (uid: string, mark?: string): Creature => ({ uid, species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0, ...(mark ? { mark } : {}) });
const viewOf = (game: ReturnType<typeof shop>, uid: string) => [...game.view().creatures, ...game.view().inventory].find((c) => c.uid === uid)!;

describe('M4-25 marks', () => {
  it('price and feeding by the mark; the card and the scene get its word and tint', () => {
    const game = shop([kettle('a'), kettle('s', 'shiny'), kettle('z', 'sleepy')]);
    const plain = viewOf(game, 'a');
    const shiny = viewOf(game, 's');
    const sleepy = viewOf(game, 'z');
    const m = (id: string) => marks.list.find((x) => x.id === id)!;
    expect(shiny.price / plain.price).toBeCloseTo(m('shiny').priceMult, 1);
    expect(sleepy.price / plain.price).toBeCloseTo(m('sleepy').priceMult, 1);
    expect(sleepy.need).toBe(Math.ceil(plain.need * m('sleepy').feedMult));
    expect(shiny).toMatchObject({ mark: 'shiny', tint: m('shiny').tint });
    expect(plain).toMatchObject({ mark: '', tint: '' });
  });

  it('about one in ten hatches gets a mark, never the first two; the mark survives a reload', () => {
    const save = newSave(0);
    Object.assign(save.flags, { ftue_starter: true, ftue_bought: true });
    const game = createGame(createStore(save, () => 0), content, createRng(5));
    const got: Array<string | undefined> = [];
    game.events.on((e) => {
      if (e.type === 'hatched') got.push(game.state.creatures.find((c) => c.uid === e.uid)?.mark);
    });
    for (let i = 0; i < 600; i++) {
      game.state.incubators[0] = { ...game.state.incubators[0]!, egg: 'egg_basic', progress: 999, elapsed: 999, waiting: false };
      game.tapIncubator(0);
      if (game.state.creatures.length > 50) game.state.creatures = game.state.creatures.slice(-5);
    }
    expect(got.length).toBeGreaterThan(550);
    expect(got.slice(0, 2)).toEqual([undefined, undefined]);
    const share = got.filter(Boolean).length / got.length;
    expect(share).toBeGreaterThan(marks.chance * 0.6);
    expect(share).toBeLessThan(marks.chance * 1.4);
    expect(new Set(got.filter(Boolean))).toEqual(new Set(marks.list.map((m) => m.id)));
    const back = normalize(JSON.parse(JSON.stringify({ ...game.state, creatures: [kettle('k', 'singing')] })), 0);
    expect(back.creatures[0]?.mark).toBe('singing');
  });
});
