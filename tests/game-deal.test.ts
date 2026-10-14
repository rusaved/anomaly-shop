import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/** UB-05 (was M1-06): the deal in one path — the shelf («My sales») → a buyer writes → «Sell for N» / «No» / «Counter price». */
const content = loadGameContent();

function setup(seed = 11, deals = 1) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.showcase_m3 = true;
  save.stats.hatched = 2;
  save.stats.deals = deals;
  save.creatures = [
    { uid: 'a', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 },
    { uid: 'b', species: 'cloudcat', level: 1, fed: 0, hatchedAt: 0, age: 0 },
  ];
  save.showcase = ['a'];
  const store = createStore(save, () => 0);
  const flushes: boolean[] = [];
  store.onCommit((_, f) => flushes.push(f));
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen, flushes };
}

function run(game: Game, sec: number): void {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
}

describe('UB-05 one path of selling', () => {
  it('the shelf starts with 1 place (Q-024 B); eggs in incubators take none', () => {
    const game = createGame(createStore(newSave(0), () => 0), content, createRng(1));
    expect(game.showcaseSlots()).toBe(1);
    expect(game.state.incubators[0]!.egg).not.toBeNull();
    expect(game.freeSlots()).toBe(1);
  });

  it('a buyer writing takes the creature off the shelf (Q-025): its place is free, it is neither on sale nor in the inventory', () => {
    const { game } = setup();
    const chat = waitChat(game)!;
    expect(chat.uid).toBe('a');
    expect(game.state.showcase).toEqual([]);
    expect(game.freeSlots()).toBe(1);
    expect(game.view().talking.map((c) => c.uid)).toEqual(['a']);
    expect(game.view().inventory.map((c) => c.uid)).toEqual(['b']);
    // The free place takes the next one, the held one is not listed twice.
    expect(game.list('b')).toBe(true);
    expect(game.list('a')).toBe(false);
    expect(game.sellNow('a')).toBe(false);
  });

  it('«Sell for N»: coins come in, the creature goes, stats and collection count it, the buyer leaves happy, the save is flushed', () => {
    const { game, seen, flushes } = setup();
    const chat = waitChat(game)!;
    expect(game.chatSell(chat.id)).toBe(true);
    expect(game.state.coins).toBe(chat.offer);
    expect(game.state.creatures.map((c) => c.uid)).toEqual(['b']);
    expect(game.state.stats).toMatchObject({ deals: 2, coinsEarned: chat.offer });
    expect(game.state.collection.kettle?.sold).toBe(1);
    expect(game.view().queue).toHaveLength(0);
    expect(seen.find((e) => e.type === 'sold')).toMatchObject({ uid: 'a', price: chat.offer, haggled: false, by: 'player', customerId: chat.id });
    expect(seen.find((e) => e.type === 'customerLeft')).toMatchObject({ id: chat.id, reason: 'sold' });
    expect(flushes.at(-1)).toBe(true);
  });

  it('«No, thanks»: no coins, the creature goes back on the shelf (or to the inventory when the shelf is full meanwhile)', () => {
    const { game, seen } = setup();
    const chat = waitChat(game)!;
    expect(game.chatDecline(chat.id)).toBe(true);
    expect(game.state.coins).toBe(0);
    expect(game.state.showcase).toEqual(['a']);
    expect(seen.find((e) => e.type === 'customerLeft')).toMatchObject({ id: chat.id, reason: 'wait' });
    const again = waitChat(game)!;
    game.list('b');
    expect(game.state.showcase).toEqual(['b']);
    game.chatDecline(again.id);
    expect(game.view().inventory.map((c) => c.uid)).toEqual(['a']);
  });

  it('no counter price in the very first deal (UB-06, customers.json chat.firstCounter); from the second one — once per chat', () => {
    const first = setup(11, 0);
    const c1 = waitChat(first.game)!;
    expect(first.game.canCounter(c1.id)).toBe(false);
    expect(first.game.chatCounter(c1.id)).toBe(false);
    const later = setup(11, 1);
    const c2 = waitChat(later.game)!;
    expect(later.game.canCounter(c2.id)).toBe(true);
    expect(later.game.chatCounter(c2.id)).toBe(true);
    expect(later.game.canCounter(c2.id)).toBe(false);
  });

  it('«Sell now» needs no buyer: the low end of the range, a deal like any other', () => {
    const { game, seen } = setup();
    const low = game.view().creatures[0]!.low;
    expect(game.sellNow('a')).toBe(true);
    expect(game.state.coins).toBe(low);
    expect(seen.find((e) => e.type === 'sold')).toMatchObject({ uid: 'a', price: low, by: 'now', customerId: 0 });
  });

  it('a creature sold some other way closes its chat: the buyer says goodbye', () => {
    const { game } = setup();
    const chat = waitChat(game)!;
    game.state.creatures = game.state.creatures.filter((c) => c.uid !== 'a');
    run(game, 0.1);
    expect(game.chats().find((c) => c.id === chat.id)!.state).toBe('gone');
    expect(game.view().queue).toHaveLength(0);
  });
});
