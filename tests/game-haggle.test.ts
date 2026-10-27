import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { haggleRaise } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/**
 * H-03 (Q-069 п. 2 Б): «Поднять цену» in chats. The buyer agrees to more (+15–30 % over the first offer), meets half way or leaves (the pet
 * stays with the player); at most two raises; generous on average (the summary of rules p. 31): +5–12 % over selling at once, at most a
 * third of the buyers leave. A buyer who left counts as the next buyer paying the first offer (the pet stays, only this buyer is lost).
 */
const content = loadGameContent();
const h = content.haggle!;

/** 10 000 haggles of one policy: raise `times` times while the buyer stays (the half-and-half player raises twice every other chat). */
function simulate(policy: 1 | 2 | 'mix', n = 10_000, seed = 7) {
  const rng = createRng(seed);
  let sum = 0;
  let gone = 0;
  let yes = 0;
  let middle = 0;
  for (let i = 0; i < n; i++) {
    const times = policy === 'mix' ? (i % 2 ? 2 : 1) : policy;
    const first = 100;
    let offer = first;
    let left = false;
    for (let k = 0; k < Math.min(times, h.maxRaises); k++) {
      const r = haggleRaise(h, k, first, offer, rng.next(), rng.next());
      if (r.result === 'gone') {
        left = true;
        break;
      }
      if (r.result === 'yes') yes++;
      else middle++;
      expect(r.offer).toBeGreaterThan(offer);
      expect(r.offer).toBeLessThanOrEqual(Math.round(first * 1.3));
      offer = r.offer;
    }
    if (left) gone++;
    sum += left ? first : offer;
  }
  return { gain: sum / (n * 100) - 1, gone: gone / n, yes, middle };
}

describe('H-03 haggle', () => {
  it('10 000 haggles: on average +5–12 % over selling at once, at most a third of the buyers leave; each raise asks +15–30 % over the first offer', () => {
    const mix = simulate('mix');
    const one = simulate(1);
    const two = simulate(2);
    // The numbers go to the milestone's summary.
    console.log(`H-03 sim 10000: mix gain ${(mix.gain * 100).toFixed(1)}% gone ${(mix.gone * 100).toFixed(1)}% · one raise ${(one.gain * 100).toFixed(1)}% / ${(one.gone * 100).toFixed(1)}% · two raises ${(two.gain * 100).toFixed(1)}% / ${(two.gone * 100).toFixed(1)}%`);
    expect(mix.gain).toBeGreaterThanOrEqual(0.05);
    expect(mix.gain).toBeLessThanOrEqual(0.12);
    expect(mix.gone).toBeLessThanOrEqual(1 / 3);
    expect(two.gone).toBeLessThanOrEqual(1 / 3);
    expect(one.gain).toBeGreaterThanOrEqual(0.05);
    expect(mix.yes).toBeGreaterThan(0);
    expect(mix.middle).toBeGreaterThan(0);
    expect(h.steps[0]!.min).toBeGreaterThanOrEqual(0.15);
    expect(h.steps.at(-1)!.max).toBeLessThanOrEqual(0.3);
    expect(h.maxRaises).toBe(2);
    expect(h.thinkSec.max).toBeLessThanOrEqual(1);
  });

  it('the chance to agree falls with the markup', () => {
    const at = (rollStep: number, k: number) => {
      let y = 0;
      for (let i = 0; i < 1000; i++) if (haggleRaise(h, k, 100, 100, rollStep, i / 1000).result === 'yes') y++;
      return y;
    };
    expect(at(0, 0)).toBeGreaterThan(at(1, 0));
    expect(at(1, 0)).toBeGreaterThanOrEqual(at(0, 1));
  });

  function shop(deals: number) {
    const save = newSave(0);
    save.flags.ftue_starter = true;
    save.flags.ftue_done = true;
    save.flags.showcase_m3 = true;
    save.stats.hatched = 3;
    save.stats.deals = deals;
    save.creatures = [{ uid: 'a', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }];
    save.showcase = ['a'];
    const store = createStore(save, () => 0);
    return { game: createGame(store, content, createRng(5)), store };
  }

  it('from the second deal, two raises at most; the first deal has no haggle', () => {
    const first = shop(0);
    const c0 = waitChat(first.game)!;
    expect(first.game.canRaise(c0.id)).toBe(false);
    expect(first.game.chatRaise(c0.id)).toBeNull();
    for (let seed = 0; seed < 40; seed++) {
      const { game } = shop(1);
      const c = waitChat(game)!;
      expect(game.canRaise(c.id)).toBe(true);
      const offer = c.offer;
      const r1 = game.chatRaise(c.id);
      const after = game.chats().find((x) => x.id === c.id)!;
      if (r1 === 'gone') {
        expect(after.state).toBe('gone');
        continue;
      }
      expect(after.offer).toBeGreaterThan(offer);
      const r2 = game.chatRaise(c.id);
      expect(r2).not.toBeNull();
      if (r2 !== 'gone') {
        expect(game.canRaise(c.id)).toBe(false);
        expect(game.chatRaise(c.id)).toBeNull();
        expect(game.chatSell(c.id)).toBe(true);
      }
      return;
    }
  });

  it('a buyer who leaves takes nothing: the pet stays with the player and another buyer writes later', () => {
    for (let seed = 1; seed < 400; seed++) {
      const save = newSave(0);
      save.flags.ftue_starter = true;
      save.flags.ftue_done = true;
      save.flags.showcase_m3 = true;
      save.stats.hatched = 3;
      save.stats.deals = 3;
      save.creatures = [{ uid: 'a', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }];
      save.showcase = ['a'];
      const store = createStore(save, () => 0);
      const game = createGame(store, content, createRng(seed));
      const c = waitChat(game)!;
      let r = game.chatRaise(c.id);
      if (r !== 'gone') r = game.chatRaise(c.id);
      if (r !== 'gone') continue;
      expect(game.chats().find((x) => x.id === c.id)!.state).toBe('gone');
      expect(store.state.creatures.some((x) => x.uid === 'a')).toBe(true);
      expect(store.state.coins).toBe(save.coins);
      const next = waitChat(game, 600);
      expect(next && next.id !== c.id).toBe(true);
      return;
    }
    throw new Error('no buyer left in 400 seeds');
  });
});
