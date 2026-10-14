import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { STEP_SEC } from '../src/core/runtime.ts';
import { createGame, type Game, type GameContent, type GameEvent } from '../src/sim/game.ts';
import { coins, creatureValue } from '../src/sim/rules.ts';
import { newSave, type Creature } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { computeShopLayout } from '../src/scene/shop-layout.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M2-02: the showcase 3 → 8 places, prices grow on the shelf, the showcase draws its customers and they pick by type. */
const base = loadGameContent();
const spec = (id: string) => base.species.species.find((s) => s.id === id)!;
const cr = (uid: string, species: string, level = 1): Creature => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });
/** All districts open from the start (M2-05 opens them by deals; here only the choice of type is under test). */
const allOpen: GameContent = { ...base, customers: { ...base.customers, districts: base.customers.districts.map((d) => ({ ...d, unlock: { type: 'start' as const } })) } };

function setup(creatures: Creature[], content: GameContent = base, seed = 3, deals = 10) {
  const save = newSave(0);
  save.flags.ftue_starter = true;
  save.flags.ftue_done = true;
  save.creatures = creatures;
  save.stats.hatched = Math.max(1, creatures.length);
  save.stats.deals = deals;
  const store = createStore(save, () => 0);
  const game = createGame(store, content, createRng(seed));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}
const run = (game: Game, sec: number): void => {
  for (let t = 0; t < sec - 1e-9; t += STEP_SEC) game.tick(STEP_SEC);
};

describe('M2-02 showcase', () => {
  it('opens after 3 deals; 5 levels take it from 1 (Q-024 B) to 6 places', () => {
    const early = setup([], base, 1, 2);
    expect(early.game.upgradeList().map((u) => u.id)).not.toContain('showcase');
    expect(early.game.buyUpgrade('showcase')).toBe(false);
    const { game } = setup([]);
    expect(game.upgradeList().map((u) => u.id)).toContain('showcase');
    expect(game.showcaseSlots()).toBe(1);
    game.state.coins = 1e7;
    for (let i = 0; i < 5; i++) expect(game.buyUpgrade('showcase')).toBe(true);
    expect(game.buyUpgrade('showcase')).toBe(false);
    expect(game.showcaseSlots()).toBe(6);
    expect(game.view().slots).toBe(6);
    expect(game.freeSlots()).toBe(6);
  });

  it('the price grows on the shelf: +5% a minute, at most +50%; the offer follows the tag', () => {
    // Nobody writes for a while: the creature stays on the shelf and its tag grows; one character, one type, fixed shares.
    const quiet: GameContent = {
      ...base,
      market: { ...base.market, replySec: { min: 1e6, max: 1e6 } },
      customers: {
        ...base.customers,
        characters: base.customers.characters.slice(0, 1).map((c) => ({ ...c, offer: { min: 1, max: 1 } })),
        districts: base.customers.districts.slice(0, 1).map((d) => ({ ...d, customer: { ...d.customer, offer: { min: 0.8, max: 0.8 } } })),
      },
    };
    const { game } = setup([cr('a', 'cloudcat', 2)], quiet);
    const level = coins(creatureValue(spec('cloudcat'), 2));
    expect(game.view().creatures[0]!.price).toBe(level);
    run(game, 60);
    expect(game.view().creatures[0]!.price).toBe(coins(creatureValue(spec('cloudcat'), 2) * 1.05));
    run(game, 60 * 12);
    expect(game.view().creatures[0]!.price).toBe(coins(creatureValue(spec('cloudcat'), 2) * 1.5));
    const tag = game.view().creatures[0]!.price;
    game.state.chatIn.a = 0;
    run(game, 0.1);
    const chat = game.chats()[0]!;
    expect(chat.uid).toBe('a');
    expect(Math.abs(chat.offer - tag * 0.8)).toBeLessThanOrEqual(1);
    expect(chat.offer).toBeGreaterThan(level);
  });

  it('a creature on the showcase draws its customers: rare ones bring more collectors', () => {
    const count = (creatures: Creature[]) => {
      let collectors = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const { game, seen } = setup(creatures.map((c) => ({ ...c })), allOpen, seed);
        game.state.upgrades.showcase = 2;
        game.state.showcase = game.state.creatures.map((c) => c.uid);
        for (let i = 0; i < 20; i++) {
          run(game, 6.5);
          for (const c of game.chats()) if (c.state === 'open') game.chatDecline(c.id);
        }
        collectors += seen.filter((e) => e.type === 'customerArrived' && e.customer === 'collector').length;
      }
      return collectors;
    };
    const plain = count([cr('a', 'kettle'), cr('b', 'sockfish')]);
    const rare = count([cr('a', 'cloudcat'), cr('b', 'lampbug'), cr('c', 'mirrorfrog')]);
    expect(rare).toBeGreaterThan(plain * 1.3);
  });

  it('8 and 9 places fit the wall on phones and PC; the tap zone (place + gap) is 44 px, 40 on a 320 px phone', () => {
    for (const [w, h] of [[375, 812], [812, 375], [320, 568], [1280, 720]] as const) {
      const page = computeLayout(w, h);
      for (const n of [3, 4, 5, 8, 9]) {
        const l = computeShopLayout(page.stage, page.hudHeight, 0.34, 4, 18, 4, n);
        expect(l.slots).toHaveLength(n);
        for (const s of l.slots) {
          expect(Math.min(s.w + l.slotGap, s.h * 1.2)).toBeGreaterThanOrEqual(w <= 320 ? 40 : 44);
          expect(s.x + s.w).toBeLessThanOrEqual(l.showcase.x + l.showcase.w + 1);
          expect(s.y + s.h).toBeLessThanOrEqual(l.showcase.y + l.showcase.h + 1);
        }
        expect(l.showcase.x + l.showcase.w).toBeLessThanOrEqual(l.door.x);
        expect(l.showcase.y + l.showcase.h).toBeLessThanOrEqual(l.floor.y);
      }
    }
  });
});
