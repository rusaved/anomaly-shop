import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave, normalize, parseSave, serialize } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M3-08: «Chats» — a buyer writes about a creature on sale (8–15 s at the market price), answers by buttons, outcomes by character. */
const content = loadGameContent();

function setup(seed = 1, askShare?: number) {
  const save = newSave(0);
  save.flags = { ftue_starter: true, ftue_done: true, showcase_m3: true };
  save.stats.hatched = 5;
  save.creatures = [{ uid: 'a', species: 'cloudcat', level: 3, fed: 0, hatchedAt: 0, age: 0, ...(askShare ? { askShare } : {}) }];
  save.showcase = ['a'];
  save.incubators = [{ egg: null, startedAt: 0, progress: 0, elapsed: 0, waiting: false }];
  const game = createGame(createStore(save, () => 0), content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const until = (game: ReturnType<typeof setup>['game'], seen: GameEvent[], sec: number): number | null => {
  for (let t = 0; t < sec; t += STEP_SEC) {
    game.tick(STEP_SEC);
    if (seen.some((e) => e.type === 'chatNew')) return t;
  }
  return null;
};
/** A chat with a chosen character (the roll picks one; tests set it to check its outcome). */
function chatWith(character: string, seed = 1) {
  const { game, seen } = setup(seed);
  until(game, seen, 40);
  const chat = game.state.chats[0]!;
  const ch = content.customers.characters.find((c) => c.id === character)!;
  chat.character = character;
  const ask = game.view().creatures[0]!.ask;
  chat.offer = Math.max(1, Math.round(ask * ch.offer.min));
  return { game, seen, chat, ch, ask };
}

describe('M3-08 chats', () => {
  it('a buyer writes after 8–15 s at the market price, with a greeting and an offer; cheap is sooner, dear later', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game, seen } = setup(seed);
      const t = until(game, seen, 40)!;
      expect(t).toBeGreaterThanOrEqual(content.market.replySec.min * Math.min(...content.market.slider.delay.slice(2, 4)) - 0.1);
      expect(t).toBeLessThanOrEqual(content.market.replySec.max * Math.max(...content.market.slider.delay.slice(2, 4)) + 0.1);
      const chat = game.chats()[0]!;
      expect(chat.lines.map((l) => l.ctx)).toEqual(['greet', 'offer']);
      expect(chat.unread).toBe(true);
    }
    const cheap = setup(1, content.market.slider.min);
    const dear = setup(1, content.market.slider.max);
    expect(until(cheap.game, cheap.seen, 90)!).toBeLessThan(until(dear.game, dear.seen, 90)!);
  });

  it('«Sell for N»: the creature goes at the offer, a deal like any other; the chat thanks and closes', () => {
    const { game, seen } = setup(2);
    until(game, seen, 40);
    const chat = game.chats()[0]!;
    const coins = game.state.coins;
    expect(game.chatSell(chat.id)).toBe(true);
    expect(game.state.coins).toBe(coins + chat.offer);
    expect(game.state.creatures).toHaveLength(0);
    expect(game.state.stats.deals).toBe(1);
    expect(game.chats()[0]!.state).toBe('sold');
    expect(game.chats()[0]!.lines.at(-1)!.ctx).toBe('thanks');
    expect(game.chatSell(chat.id)).toBe(false);
  });

  it('counter price by character: the big spender agrees, the penny-pincher and the prankster name a last price', () => {
    const rich = chatWith('rich');
    rich.chat.offer = Math.max(1, Math.round(rich.ask / (1 + rich.ch.give)) + 1);
    expect(rich.game.chatCounter(rich.chat.id)).toBe(true);
    expect(rich.chat.lines.at(-1)!.ctx).toBe('accept');
    expect(rich.chat.offer).toBe(rich.ask);
    for (const who of ['greedy', 'troll']) {
      const x = chatWith(who);
      const before = x.chat.offer;
      expect(x.game.chatCounter(x.chat.id)).toBe(true);
      expect(x.chat.lines.at(-1)!.ctx).toBe('last');
      expect(x.chat.offer).toBeGreaterThanOrEqual(before);
      expect(x.chat.offer).toBeLessThan(x.ask);
      expect(x.game.chatCounter(x.chat.id)).toBe(false);
    }
  });

  it('«No, thanks»: the buyer leaves, another writes later; taking the creature off closes its chat; chats survive a reload', () => {
    const { game, seen } = setup(3);
    until(game, seen, 40);
    const first = game.chats()[0]!;
    expect(game.chatDecline(first.id)).toBe(true);
    seen.length = 0;
    expect(until(game, seen, 60)).not.toBeNull();
    const second = game.chats()[0]!;
    expect(second.id).not.toBe(first.id);
    game.unlist('a');
    game.tick(STEP_SEC);
    expect(game.chats().find((c) => c.id === second.id)!.state).toBe('gone');
    const back = normalize(parseSave(serialize(game.state)), 0);
    expect(back.chats.map((c) => c.id)).toEqual(game.state.chats.map((c) => c.id));
  });

  it('chat lines are short: 8 words at most in ru and en', () => {
    for (const ch of content.customers.characters)
      for (const pool of Object.values(ch.lines)) for (const l of pool) for (const lang of ['ru', 'en'] as const) expect(l[lang].split(/\s+/).length, l[lang]).toBeLessThanOrEqual(8);
  });
});
