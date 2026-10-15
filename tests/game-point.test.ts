import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-05, Q-019: the pickup point — a ladder of steps with tiers seen in the shop, passive income (away too), the guest zone (bonus and upkeep). */
const content = loadGameContent();
const steps = content.upgrades.upgrades.filter((u) => u.group === 'point');

function shop(opts: { upgrades?: Record<string, number>; coins?: number; level?: number } = {}) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.coins = opts.coins ?? 100_000;
  save.upgrades = opts.upgrades ?? {};
  save.stats.deals = 40;
  save.stats.xp = opts.level === undefined ? 400 : 0;
  const game = createGame(createStore(save, () => 0), content, createRng(5));
  const seen: GameEvent[] = [];
  game.events.on((e) => seen.push(e));
  return { game, seen };
}

describe('M4-05 pickup point', () => {
  it('a ladder: lease → repair → furnishing → clerk → second point → passive income, each opens with the step before; tiers 1–3', () => {
    expect(steps.map((u) => u.id)).toEqual(['point_rent', 'point_repair', 'point_furnish', 'point_clerk', 'point_second', 'point_passive']);
    steps.slice(1).forEach((u, i) => expect(u.unlock).toEqual({ type: 'upgrade', id: steps[i]!.id }));
    for (const u of steps) expect(u.decor).toBe(u.id);
    const { game } = shop();
    const ids = () => game.upgradeList().map((u) => u.id);
    expect(ids()).toContain('point_rent');
    expect(ids()).not.toContain('point_repair');
    expect(game.buyUpgrade('point_rent')).toBe(true);
    expect(ids()).toContain('point_repair');
  });

  it('every bought tier is seen in the shop (decor level = tier)', () => {
    const { game } = shop({ upgrades: { point_rent: 2, point_repair: 3, point_furnish: 1 } });
    expect(game.view().decor).toMatchObject({ point_rent: 2, point_repair: 3, point_furnish: 1 });
  });

  it('passive income pays a minute by itself, and away too (offline counts the points)', () => {
    const rate = steps.find((u) => u.id === 'point_passive')!.effect;
    const per = rate.type === 'passive' ? rate.perLevel : 0;
    const { game } = shop({ upgrades: { point_passive: 2 }, coins: 0 });
    game.tick(60);
    expect(game.state.coins).toBeGreaterThanOrEqual(per * 2 - 1e-6);
    const before = game.state.coins;
    const away = game.offline(600);
    expect(away.coins).toBeGreaterThanOrEqual(per * 2 * 10 * content.upgrades.offlineRate - 1);
    expect(game.state.coins).toBeGreaterThan(before);
  });

  it('the guest zone: opens with the lease; a decoration raises the offers, costs its upkeep; unpaid — the bonus waits; a full theme adds more', () => {
    const { game, seen } = shop({ upgrades: { point_rent: 1 } });
    expect(game.guestZone().open).toBe(true);
    const cozy = content.decor.items.filter((x) => x.theme === 'cozy');
    for (const x of cozy) expect(game.buyGuest(x.id)).toBe(true);
    const z = game.guestZone();
    const set = content.decor.sets.find((x) => x.theme === 'cozy')!.bonus;
    expect(z.bonus).toBeCloseTo(cozy.reduce((n, x) => n + x.bargain, 0) + set, 6);
    expect(z.upkeep).toBe(cozy.reduce((n, x) => n + x.upkeep, 0));
    const coins = game.state.coins;
    game.tick(60);
    expect(coins - game.state.coins).toBeGreaterThanOrEqual(z.upkeep - 1);
    game.state.coins = 0;
    game.tick(60);
    expect(game.guestZone().unpaid).toBe(true);
    expect(game.guestZone().bonus).toBe(0);
    expect(seen.some((e) => e.type === 'guestUnpaid')).toBe(true);
    expect(game.view().decor[`guest_${cozy[0]!.id}`]).toBe(1);
    game.state.coins = 1000;
    game.tick(60);
    expect(game.guestZone().unpaid).toBe(false);
    expect(game.removeGuest(cozy[0]!.id)).toBe(true);
    expect(game.guestZone().upkeep).toBe(z.upkeep - cozy[0]!.upkeep);
  });

  it('closed before the lease; a move to a new city clears the zone', () => {
    const { game } = shop();
    expect(game.guestZone().open).toBe(false);
    expect(game.buyGuest('rug')).toBe(false);
    const ready = shop({ upgrades: { point_rent: 1 } }).game;
    ready.buyGuest('rug');
    ready.state.stats.coinsEarned = content.upgrades.prestige.thresholdCoinsEarned;
    expect(ready.rebirth()).toBe(true);
    expect(ready.state.guest.items).toEqual([]);
  });
});
