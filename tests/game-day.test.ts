import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame } from '../src/sim/game.ts';
import { hatchMult } from '../src/sim/rules.ts';
import { newSave, normalize, type SaveData } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** M4-07: the anomaly of the day and the goals of the day — by the device date, kept in the save, new on a new date. */
const content = loadGameContent();
const cal = content.calendar;

function shop(save: SaveData = newSave(0)) {
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.stats.hatched = Math.max(save.stats.hatched, 5);
  save.createdAt = 12345;
  return createGame(createStore(save, () => 0), content, createRng(4));
}

describe('M4-07 the day', () => {
  it('the same date gives the same anomaly and goals; a new date gives new goals and a new egg', () => {
    const game = shop();
    const a = game.dayView('2026-10-15');
    expect(a.goals).toHaveLength(cal.tasks.perDay);
    expect(cal.daily.rarities).toContain(a.rarity);
    expect(game.dayView('2026-10-15')).toEqual(a);
    expect(game.claimDayEgg('2026-10-15')).toBe(true);
    expect(game.claimDayEgg('2026-10-15')).toBe(false);
    const days = ['2026-10-16', '2026-10-17', '2026-10-18'].map((d) => game.dayView(d));
    expect(days.every((d) => !d.eggTaken)).toBe(true);
    expect(new Set(days.map((d) => d.goals.map((g) => g.id).join())).size + new Set(days.map((d) => d.species)).size).toBeGreaterThan(2);
  });

  it('kept by the device date: a reload the same day keeps the taken egg and the progress', () => {
    const game = shop();
    game.dayView('2026-10-15');
    game.claimDayEgg('2026-10-15');
    const goal = game.dayView('2026-10-15').goals[0]!;
    const g = cal.tasks.pool.find((x) => x.id === goal.id)!;
    const stat = { deals: 'dealsAll', hatch: 'hatched', feed: 'taps', earn: 'coinsEarned', haggle: 'haggles' }[g.type] as keyof SaveData['stats'];
    game.state.stats[stat] += g.count;
    const again = shop(normalize(JSON.parse(JSON.stringify(game.state)), 0));
    const v = again.dayView('2026-10-15');
    expect(v.eggTaken).toBe(true);
    expect(v.goals[0]).toMatchObject({ id: goal.id, have: g.count, done: true, claimed: false });
    const coins = again.state.coins;
    const gems = again.state.crystals;
    expect(again.claimDayGoal('2026-10-15', goal.id)).toBe(true);
    expect(again.claimDayGoal('2026-10-15', goal.id)).toBe(false);
    expect(again.state.coins - coins + (again.state.crystals - gems)).toBeGreaterThan(0);
    // The next date: progress starts over.
    expect(again.dayView('2026-10-16').goals.every((x) => x.have === 0 && !x.claimed)).toBe(true);
  });

  it('the egg of the day hatches the species of the day, dearer, and it settles in before it can be sold', () => {
    const game = shop();
    const day = game.dayView('2026-10-15');
    game.setDay('2026-10-15');
    game.claimDayEgg('2026-10-15');
    // A ripe egg waits for a tap (the case show is the player's).
    for (let i = 0; i < 20 && !game.state.creatures.length; i++) {
      game.tick(1);
      game.tapIncubator(0);
    }
    const cr = game.state.creatures[0]!;
    expect(cr.species).toBe(day.species);
    // FB-02: ×priceMultiplier of what the egg of the day gives that rarity, never above rewardCapMin minutes of income.
    const egg = content.eggs.eggs.find((e) => e.id === cal.daily.eggId)!;
    const spec = content.species.species.find((x) => x.id === cr.species)!;
    const income = Math.max(content.eggs.income.floorPerMin, game.state.stats.income ?? 0);
    const want = Math.min(cal.daily.priceMultiplier * hatchMult(egg, spec.rarity, content.species, income), (content.eggs.income.rewardCapMin * income) / spec.basePrice);
    expect(cr.mult).toBeCloseTo(want, 6);
    expect(cr.mult).toBeGreaterThan(hatchMult(egg, spec.rarity, content.species, income) * 0.99);
    expect(cr.hold).toBeGreaterThan(0);
    expect(game.sellNow(cr.uid)).toBe(false);
    for (let i = 0; i < cal.daily.holdMinutes * 6 + 2; i++) game.tick(10);
    expect(game.state.creatures.find((x) => x.uid === cr.uid)?.hold).toBeUndefined();
    expect(game.sellNow(cr.uid)).toBe(true);
  });
});
