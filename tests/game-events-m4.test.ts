import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { pickWeighted } from '../src/sim/rules.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-21 (docs/01b §3): events 5–12 — 12 in events.json; one about a species comes only with it on the shelf; the pick follows the weights. */
const base = loadGameContent();
// The creatures stay on the shelf while a buyer writes (Q-025 B): the events about a species keep their chance in a long run.
const content = { ...base, customers: { ...base.customers, chat: { ...base.customers.chat, holdOnShelf: false } } };

function shop(onShelf: string[], seed = 4) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.creatures = onShelf.map((sp, i) => ({ uid: `s${i}`, species: sp, level: 3, fed: 0, hatchedAt: 0, age: 0 }));
  save.showcase = save.creatures.map((c) => c.uid);
  save.upgrades = { showcase: 5, point_rent: 3 };
  save.coins = 0;
  const game = createGame(createStore(save, () => 0), content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M4-21 events', () => {
  it('twelve events in the data; the ones about a species need it on the shelf', () => {
    expect(content.events.events).toHaveLength(12);
    const { game } = shop(['sockfish']);
    game.tick(60 * 5);
    const without = game.eventsPossible();
    expect(without).not.toEqual(expect.arrayContaining(['kettle']));
    expect(without).not.toContain('blink');
    expect(without).not.toContain('cat_walk');
    const all = shop(['kettle', 'lampbug', 'cloudcat']).game;
    all.tick(60 * 5);
    expect(all.eventsPossible()).toEqual(expect.arrayContaining(['kettle', 'blink', 'cat_walk', 'inspector', 'photo', 'pie']));
  });

  it('the pick follows the weights: uniform rolls over the twelve events give each its share (±1 point)', () => {
    const events = content.events.events;
    const total = events.reduce((n, e) => n + e.weight, 0);
    const n = 10_000;
    const count = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const e = pickWeighted(events, (i + 0.5) / n)!;
      count.set(e.id, (count.get(e.id) ?? 0) + 1);
    }
    for (const e of events) expect(Math.abs((count.get(e.id) ?? 0) / n - e.weight / total), e.id).toBeLessThan(0.01);
    // And in play: every one of the twelve comes in a long session with all three species on the shelf.
    const { game, seen } = shop(['kettle', 'lampbug', 'cloudcat']);
    for (let i = 0; i < 600; i++) game.tick(130);
    const ids = new Set(seen.filter((e) => e.type === 'eventStarted').map((e) => (e as { id: string }).id));
    expect([...ids].sort()).toEqual(events.map((e) => e.id).sort());
  });

  it('a tap pays: the inspector by the shelf, the pie, the cat (coins or a crystal); the kettle feeds the neighbours', () => {
    const { game, seen } = shop(['kettle', 'lampbug', 'cloudcat']);
    const paid: number[] = [];
    let fedSeen = false;
    for (let i = 0; i < 400 && paid.length < 6; i++) {
      game.tick(130);
      const ev = game.view().event;
      if (ev && ['inspector', 'photo', 'pie', 'blink', 'catWalk'].includes(ev.kind)) {
        const before = game.state.coins + game.state.crystals * 1000;
        game.tapEvent();
        paid.push(game.state.coins + game.state.crystals * 1000 - before);
      }
      if (seen.some((e) => e.type === 'eventStarted' && e.kind === 'kettle') && seen.some((e) => e.type === 'fed')) fedSeen = true;
    }
    expect(paid.length).toBeGreaterThanOrEqual(4);
    for (const p of paid) expect(p).toBeGreaterThan(0);
    expect(fedSeen).toBe(true);
  });
});
