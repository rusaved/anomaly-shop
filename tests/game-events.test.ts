import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, GOLDEN, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-15: random events — one at a time, every 60–120 s after the first minute, 8–20 s each, only a plus. */
const base = loadGameContent();
const only = (kind: string): GameContent => ({ ...base, events: { ...base.events, events: base.events.events.map((e) => ({ ...e, fromMin: 0, weight: e.kind === kind ? 1 : 0 })) } });
const cr = (uid: string, species = 'kettle', level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });

function setup(content: GameContent = base, opts: { ftueDone?: boolean; creatures?: Creature[]; coins?: number; seed?: number; deals?: number } = {}) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  if (opts.ftueDone !== false) save.flags.ftue_done = true;
  save.creatures = opts.creatures ?? [cr('a'), cr('b', 'cloudcat', 2)];
  save.stats.hatched = 5;
  save.stats.deals = opts.deals ?? 10;
  save.stats.coinsEarned = 400;
  save.coins = opts.coins ?? 0;
  const game = createGame(createStore(save, () => 0), content, createRng(opts.seed ?? 8));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number, each?: () => void): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) {
    game.tick(STEP_SEC);
    each?.();
  }
};
const started = (seen: GameEvent[]) => seen.filter((e) => e.type === 'eventStarted');
/** UB-05: buyers are let go (the creature goes back on the shelf), so the shelf events (golden, sneeze) stay possible. */
const letGo = (game: Game): void => {
  for (const c of game.chats()) if (c.state === 'open' && c.customer !== GOLDEN) game.chatDecline(c.id);
};
/** Runs until an event is on (at most 130 s: the first comes 60–120 s after the first minute). */
const untilEvent = (game: Game): void => {
  for (let t = 0; t < 130 && !game.view().event; t += STEP_SEC) {
    game.tick(STEP_SEC);
    letGo(game);
  }
  expect(game.view().event).not.toBeNull();
};

describe('M2-15 random events', () => {
  it('none in the first minute (FTUE): the timer waits for the tutorial to end', () => {
    const { game, seen } = setup(base, { ftueDone: false });
    run(game, 300);
    expect(started(seen)).toHaveLength(0);
  });

  it('every 60–120 s, one at a time, each lasting 8–20 s', () => {
    for (const seed of [1, 2, 3]) {
      const { game, seen } = setup(base, { seed, creatures: [cr('a'), cr('b'), cr('c')] });
      let t = 0;
      let onAt = -1;
      const spans: number[] = [];
      const gaps: number[] = [];
      let lastEnd = 0;
      run(game, 30 * 60, () => {
        t += STEP_SEC;
        letGo(game);
        const ev = game.view().event;
        if (ev && onAt < 0) {
          onAt = t;
          gaps.push(t - lastEnd);
        }
        if (!ev && onAt >= 0) {
          spans.push(t - onAt);
          onAt = -1;
          lastEnd = t;
        }
      });
      expect(started(seen).length).toBeGreaterThanOrEqual(13);
      expect(started(seen).length).toBeLessThanOrEqual(30);
      for (const g of gaps.slice(1)) expect(g).toBeGreaterThanOrEqual(60 - 0.1);
      for (const g of gaps) expect(g).toBeLessThanOrEqual(120 + 0.1);
      // 8–20 s each; M6-21: the anomalous weather lasts its minute (01b §3, «на минуту»).
      const longest = Math.max(...base.events.events.map((e) => e.durationSec));
      expect(longest).toBe(60);
      for (const s of spans) expect(s).toBeLessThanOrEqual(longest + 0.1);
      // One at a time: every start comes after the previous end.
      const marks = seen.filter((e) => e.type === 'eventStarted' || e.type === 'eventEnded').map((e) => e.type);
      for (let i = 1; i < marks.length; i++) expect(marks[i]).not.toBe(marks[i - 1]);
    }
  });

  it('missing an event takes nothing: coins, creatures and eggs stay as they were', () => {
    for (const kind of ['golden', 'sneeze', 'doorEgg', 'merchant']) {
      const { game, seen } = setup(only(kind), { coins: 77 });
      const before = JSON.stringify({ c: game.state.coins, cr: game.state.creatures.map((c) => c.uid), inc: game.state.incubators });
      run(game, 140, () => {
        // Ordinary buyers are let go (the creature goes back on the shelf): only the event is under test.
        for (const c of game.chats()) if (c.state === 'open' && c.customer !== GOLDEN) game.chatDecline(c.id);
      });
      expect(seen.some((e) => e.type === 'eventEnded' && e.outcome === 'missed')).toBe(true);
      expect(JSON.stringify({ c: game.state.coins, cr: game.state.creatures.map((c) => c.uid), inc: game.state.incubators })).toBe(before);
    }
  });

  it('golden buyer (UB-05: writes like everyone): about the dearest creature on the shelf, ×2 of the tag, no counter price; the deal ends the event', () => {
    const { game, seen } = setup(only('golden'), { creatures: [cr('a', 'cloudcat', 2)] });
    for (let t = 0; t < 130 && !game.view().event; t += STEP_SEC) {
      game.tick(STEP_SEC);
      for (const c of game.chats()) if (c.state === 'open' && c.customer !== GOLDEN) game.chatDecline(c.id);
    }
    const chat = game.chats().find((c) => c.state === 'open' && c.customer === GOLDEN)!;
    expect(chat.uid).toBe('a');
    expect(game.view().queue[0]).toMatchObject({ id: chat.id, customer: GOLDEN });
    // The tag includes shelf growth since the start; the golden buyer pays twice the tag.
    const tag = game.view().talking[0]!.price;
    expect(tag).toBeGreaterThanOrEqual(coins(creatureValue(base.species.species.find((s) => s.id === 'cloudcat')!, 2)));
    expect(Math.abs(chat.offer - tag * 2)).toBeLessThanOrEqual(1);
    expect(game.canCounter(chat.id)).toBe(false);
    expect(game.chatSell(chat.id)).toBe(true);
    expect(seen).toContainEqual(expect.objectContaining({ type: 'eventEnded', kind: 'golden', outcome: 'done' }));
  });

  it('sneeze: 5–8 coins to tap, each worth 1–3 or a share of the average deal', () => {
    const { game, seen } = setup(only('sneeze'));
    untilEvent(game);
    const ev = game.view().event!;
    expect(ev.kind).toBe('sneeze');
    expect(ev.coins.length).toBeGreaterThanOrEqual(5);
    expect(ev.coins.length).toBeLessThanOrEqual(8);
    for (const c of ev.coins) game.tapEventCoin(c.id);
    const got = seen.filter((e) => e.type === 'eventCoin').map((e) => (e.type === 'eventCoin' ? e.value : 0));
    expect(got).toHaveLength(ev.coins.length);
    for (const v of got) expect(v).toBeGreaterThanOrEqual(1);
    expect(game.state.coins).toBe(got.reduce((a, b) => a + b, 0));
    expect(game.view().event).toBeNull();
  });

  it('egg at the door: a free egg in a free incubator; no free incubator — the egg price in coins', () => {
    const a = setup(only('doorEgg'));
    untilEvent(a.game);
    a.game.tapEvent();
    expect(a.game.state.incubators.some((i) => i.egg)).toBe(true);
    expect(a.seen).toContainEqual(expect.objectContaining({ type: 'eggBought', price: 0, by: 'gift' }));
    const b = setup(only('doorEgg'), { creatures: [cr('a'), cr('b'), cr('c')] });
    untilEvent(b.game);
    // UB-05: eggs take no shelf place, only an incubator.
    b.game.state.incubators[0]!.egg = 'egg_basic';
    b.game.tapEvent();
    expect(b.game.state.coins).toBeGreaterThan(0);
    expect(b.seen.some((e) => e.type === 'eventGift')).toBe(true);
  });

  it('merchant: the best open egg at half price or the mystery egg at the basic price', () => {
    const { game, seen } = setup(only('merchant'), { coins: 100, deals: 9 });
    untilEvent(game);
    game.tapEvent();
    expect(seen.some((e) => e.type === 'merchantOpen')).toBe(true);
    const offer = game.merchantOffer()!;
    expect(offer.discount).toMatchObject({ egg: 'egg_warm', price: 50 });
    expect(offer.mystery).toMatchObject({ egg: 'egg_warm', price: 10 });
    expect(game.merchantBuy('discount')).toBe(true);
    expect(game.state.coins).toBe(50);
    expect(game.merchantOffer()).toBeNull();
  });
});
