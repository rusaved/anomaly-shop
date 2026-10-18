import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { upgradePrice } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';
import { waitChat } from './chat-helper.ts';

/** M2-07: the sign brings buyers sooner (UB-05: they write), the register adds to every deal; both open by deals and show in the shop scene. */
// The register's math alone: no zone agreement (MU-12 slider.agree) rolling the offer up to the tag.
const loaded = loadGameContent();
const content = { ...loaded, market: { ...loaded.market, slider: { ...loaded.market.slider, agree: undefined } } };
const up = (id: string) => content.upgrades.upgrades.find((u) => u.id === id)!;
const cr = (uid: string): Creature => ({ uid, species: 'cloudcat', level: 2, fed: 0, hatchedAt: 0, age: 0 });

function setup(deals: number, levels: Record<string, number> = {}, seed = 5) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = [cr('a')];
  save.stats.hatched = 3;
  save.stats.deals = deals;
  save.upgrades = { ...levels };
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M2-07 sign and register', () => {
  it('open by seller level (UB-08): the sign at 3 (6 deals), the register at 5 (15 deals); 5 levels each, prices from upgrades.json', () => {
    expect(setup(5).game.upgradeList().map((u) => u.id)).not.toContain('sign');
    expect(setup(6).game.upgradeList().map((u) => u.id)).toContain('sign');
    expect(setup(14).game.upgradeList().map((u) => u.id)).not.toContain('cash');
    const { game } = setup(15);
    expect(game.upgradeList().map((u) => u.id)).toContain('cash');
    for (const id of ['sign', 'cash']) {
      const u = up(id);
      expect(u.levels).toBe(5);
      expect(upgradePrice(u, 0)).toBe(u.price1);
      expect(upgradePrice(u, 4)).toBe(u.priceMax);
    }
  });

  it('the sign: buyers write −12% sooner per level (UB-05: the time to the first chat)', () => {
    const firstChat = (levels: Record<string, number>) => {
      const { game, seen } = setup(30, levels);
      let t = 0;
      while (!seen.some((e) => e.type === 'chatNew') && t < 60) {
        game.tick(STEP_SEC);
        t += STEP_SEC;
      }
      return t;
    };
    const plain = firstChat({});
    expect(Math.abs(firstChat({ sign: 1 }) - plain * 0.88)).toBeLessThan(0.1);
    expect(Math.abs(firstChat({ sign: 5 }) - plain * 0.4)).toBeLessThan(0.1);
  });

  it('the register: +3% to every deal per level', () => {
    const a = waitChat(setup(30, {}, 9).game)!;
    const b = waitChat(setup(30, { cash: 3 }, 9).game)!;
    expect(b.customer).toBe(a.customer);
    expect(Math.abs(b.offer / a.offer - 1.09)).toBeLessThan(0.02);
  });

  it('bought ones show in the shop: decor sign and register with their level', () => {
    const { game } = setup(30, { sign: 2, cash: 1 });
    expect(game.view().decor).toMatchObject({ sign: 2, register: 1 });
    expect(setup(30).game.view().decor).toEqual({});
  });
});
