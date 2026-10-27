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

type H = typeof h;
/** Before S-03 (H «Ресейл 18»): the numbers of the summary's table «до». */
const BEFORE: H = { ...h, accept: { base: 0.5, perMarkup: 2.5, min: 0.03 }, leave: { base: 0.05, perMarkup: 0.4 }, minStepCoins: 1, risk: { edge: 0, leave: { edge: 1, room: 1 } } };

/**
 * 10 000 haggles of one policy: raise `times` times while the buyer stays (the half-and-half player raises twice every other chat;
 * 'words' — raises again only when the buyer said «могу ещё чуть-чуть»). S-03: after the first raise the buyer's words (room / edge) set
 * the risk of the second, as in the game. first — the first offer (100, or a cheap pet's 8–20).
 */
function simulate(policy: 1 | 2 | 'mix' | 'words', n = 10_000, seed = 7, hh: H = h, firstOf: (i: number) => number = () => 100) {
  const rng = createRng(seed);
  let sum = 0;
  let base = 0;
  let gone = 0;
  let yes = 0;
  let middle = 0;
  const second = { edge: { n: 0, gone: 0 }, room: { n: 0, gone: 0 } };
  const raise1 = { n: 0, yes: 0, gone: 0 };
  const raise2 = { n: 0, yes: 0, gone: 0 };
  for (let i = 0; i < n; i++) {
    const times = policy === 'mix' ? (i % 2 ? 2 : 1) : policy === 'words' ? 2 : policy;
    const first = firstOf(i);
    let offer = first;
    let left = false;
    let risk: 'edge' | 'room' | undefined;
    for (let k = 0; k < Math.min(times, hh.maxRaises); k++) {
      if (k === 1 && policy === 'words' && risk === 'edge') break;
      const mult = risk === 'edge' ? hh.risk.leave.edge : risk === 'room' ? hh.risk.leave.room : 1;
      const r = haggleRaise(hh, k, first, offer, rng.next(), rng.next(), mult);
      const tally = k === 0 ? raise1 : raise2;
      tally.n++;
      if (k === 1 && risk) second[risk].n++;
      if (r.result === 'gone') {
        tally.gone++;
        if (k === 1 && risk) second[risk].gone++;
        left = true;
        break;
      }
      if (r.result === 'yes') {
        yes++;
        tally.yes++;
      } else middle++;
      expect(r.offer).toBeGreaterThan(offer);
      expect(r.ask - offer).toBeGreaterThanOrEqual(hh.minStepCoins);
      offer = r.offer;
      // The words after a raise that leaves one more (the same roll order as the game: the answer, then the words).
      if (k + 1 < hh.maxRaises) risk = rng.next() < hh.risk.edge ? 'edge' : 'room';
    }
    if (left) gone++;
    sum += left ? first : offer;
    base += first;
  }
  return { gain: sum / base - 1, coins: (sum - base) / n, gone: gone / n, yes, middle, second, raise1, raise2 };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

describe('H-03 haggle', () => {
  it('S-03 (Q-072 B) 10 000 haggles: first raise «да» ≈ 26 % / gone ≈ 7 %, second ≈ 11 % / 11 %; on average ≈ +14 % with ≈ 11 % gone; a raise asks +15–30 % and at least +3 coins', () => {
    const mix = simulate('mix');
    const one = simulate(1);
    const two = simulate(2);
    const words = simulate('words');
    const was = simulate('mix', 10_000, 7, BEFORE);
    const cheap = (i: number) => 8 + (i % 13);
    const cheapNow = simulate('mix', 10_000, 7, h, cheap);
    const cheapWas = simulate('mix', 10_000, 7, BEFORE, cheap);
    // The numbers go to the milestone's summary (the table до / после).
    console.log(
      `S-03 sim 10000: mix ${pct(was.gain)} / gone ${pct(was.gone)} → ${pct(mix.gain)} / ${pct(mix.gone)} · one raise ${pct(one.gain)} / ${pct(one.gone)} · two ${pct(two.gain)} / ${pct(two.gone)} · by words ${pct(words.gain)} / ${pct(words.gone)}` +
        ` · raise 1 yes ${pct(two.raise1.yes / two.raise1.n)} gone ${pct(two.raise1.gone / two.raise1.n)} · raise 2 yes ${pct(two.raise2.yes / two.raise2.n)} gone ${pct(two.raise2.gone / two.raise2.n)}` +
        ` · cheap 8–20: ${cheapWas.coins.toFixed(2)} → ${cheapNow.coins.toFixed(2)} coins (${pct(cheapWas.gain)} → ${pct(cheapNow.gain)}), gone ${pct(cheapWas.gone)} → ${pct(cheapNow.gone)}`,
    );
    expect(two.raise1.yes / two.raise1.n).toBeGreaterThan(0.22);
    expect(two.raise1.yes / two.raise1.n).toBeLessThan(0.3);
    expect(two.raise1.gone / two.raise1.n).toBeGreaterThan(0.05);
    expect(two.raise1.gone / two.raise1.n).toBeLessThan(0.09);
    expect(two.raise2.yes / two.raise2.n).toBeGreaterThan(0.08);
    expect(two.raise2.yes / two.raise2.n).toBeLessThan(0.14);
    expect(two.raise2.gone / two.raise2.n).toBeGreaterThan(0.08);
    expect(two.raise2.gone / two.raise2.n).toBeLessThan(0.14);
    // Generous (свод п. 31: above 5–12 % is allowed), never more than a third gone.
    expect(mix.gain).toBeGreaterThanOrEqual(0.1);
    expect(mix.gain).toBeLessThanOrEqual(0.16);
    expect(mix.gone).toBeLessThanOrEqual(0.15);
    expect(two.gone).toBeLessThanOrEqual(1 / 3);
    // Reading the words pays: raising again only on «могу ещё чуть-чуть» loses fewer buyers than raising twice blind.
    expect(words.gone).toBeLessThan(two.gone);
    // A cheap pet's raise is worth more coins than before (+3 at least).
    expect(cheapNow.coins).toBeGreaterThan(cheapWas.coins);
    expect(mix.yes).toBeGreaterThan(0);
    expect(mix.middle).toBeGreaterThan(0);
    expect(h.steps[0]!.min).toBeGreaterThanOrEqual(0.15);
    expect(h.steps.at(-1)!.max).toBeLessThanOrEqual(0.3);
    expect(h.maxRaises).toBe(2);
    expect(h.minStepCoins).toBe(3);
    expect(h.thinkSec.max).toBeLessThanOrEqual(1);
  });

  it('S-03 the words are true: after «почти предел» the second raise ends with the buyer gone far more often than after «могу ещё чуть-чуть»', () => {
    const two = simulate(2, 20_000, 11);
    const edge = two.second.edge.gone / two.second.edge.n;
    const room = two.second.room.gone / two.second.room.n;
    console.log(`S-03 words: second raise gone after «edge» ${pct(edge)} (${two.second.edge.n}), after «room» ${pct(room)} (${two.second.room.n})`);
    expect(edge).toBeGreaterThan(0.25);
    expect(room).toBeLessThan(0.06);
    // On average the words change nothing: the second raise leaves as the formula says (≈ 11 %).
    expect(two.raise2.gone / two.raise2.n).toBeGreaterThan(0.08);
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

  it('S-03 in the game: after the first raise the buyer names the price with «room» or «edge» words; hard words only when no raise is left', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const save = newSave(0);
      Object.assign(save.flags, { ftue_starter: true, ftue_done: true, showcase_m3: true, haggle_tried: true });
      save.stats.hatched = 3;
      save.stats.deals = 3;
      save.creatures = [{ uid: 'a', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }];
      save.showcase = ['a'];
      const game = createGame(createStore(save, () => 0), content, createRng(seed));
      const c = waitChat(game)!;
      const ask = (id: number) => game.chats().find((x) => x.id === id)!;
      if (game.chatRaise(c.id) === 'gone') continue;
      const words = ask(c.id).lines.at(-1)!;
      expect(['room', 'edge']).toContain(words.ctx);
      expect(words.n).toBe(ask(c.id).offer);
      expect(ask(c.id).risk).toBe(words.ctx);
      seen.add(words.ctx);
      expect(game.canRaise(c.id)).toBe(true);
      if (game.chatRaise(c.id) === 'gone') continue;
      expect(['accept', 'last']).toContain(ask(c.id).lines.at(-1)!.ctx);
      expect(game.canRaise(c.id)).toBe(false);
    }
    expect(seen).toEqual(new Set(['room', 'edge']));
    // «Больше N не дам», «N, и то много» and the like — never as an offer or the words of a raise that leaves one more.
    for (const ch of content.customers.characters)
      for (const ctx of ['greet', 'offer', 'room', 'edge'] as const)
        for (const l of ch.lines[ctx]) expect(l.ru, `${ch.id}.${ctx}`).not.toMatch(/не дам|и то много|И всё|Последнее слово|и закончим|и бегу/);
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
