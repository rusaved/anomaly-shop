import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';
import { createGame, type GameEvent } from '../src/sim/game.ts';
import { newSave } from '../src/sim/state.ts';
import { createStore } from '../src/sim/store.ts';
import { loadGameContent } from '../scripts/load-game-content.ts';

/** FB-04 (Q-031 B): generosity for activity — goals of the day pay 2–3 minutes of income, a bonus for coming back once a day, gifts ≤ 10 minutes. */
const content = loadGameContent();

function shop(income: number) {
  const save = newSave(0);
  Object.assign(save.flags, { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true });
  save.stats.hatched = 5;
  save.stats.income = income;
  return createGame(createStore(save, () => 0), content, createRng(5));
}

describe('FB-04 generosity', () => {
  it('a goal of the day pays 2–3 minutes of income (coins goals), and grows with the shop', () => {
    for (const g of content.calendar.tasks.pool) {
      if (g.reward.crystals) continue;
      expect(g.reward.incomeMin, g.id).toBeGreaterThanOrEqual(2);
      expect(g.reward.incomeMin, g.id).toBeLessThanOrEqual(3);
    }
    const small = shop(100).rewardFor(content.calendar.tasks.pool[0]!.reward).coins!;
    const big = shop(5000).rewardFor(content.calendar.tasks.pool[0]!.reward).coins!;
    expect(big).toBeGreaterThan(small * 40);
  });

  it('a claimed goal pays what the card showed', () => {
    const game = shop(400);
    const day = '2026-10-19';
    const goal = game.dayView(day).goals[0]!;
    game.state.daily.claimed = [];
    const stat = { deals: 'dealsAll', hatch: 'hatched', feed: 'taps', earn: 'coinsEarned', haggle: 'haggles' } as const;
    const g = content.calendar.tasks.pool.find((x) => x.id === goal.id)!;
    (game.state.stats as Record<string, number>)[stat[g.type]] = (game.state.daily.base[stat[g.type]] ?? 0) + g.count;
    const shown = game.dayView(day).goals[0]!.reward;
    const before = { coins: game.state.coins, crystals: game.state.crystals };
    expect(game.claimDayGoal(day, goal.id)).toBe(true);
    expect(game.state.coins - before.coins).toBe(shown.coins ?? 0);
    expect(game.state.crystals - before.crystals).toBe(shown.crystals ?? 0);
  });

  it('the bonus for coming back comes once a new day, not on the first day', () => {
    const game = shop(300);
    const gifts: string[] = [];
    game.events.on((e: GameEvent) => {
      if (e.type === 'gift') gifts.push(e.from);
    });
    game.setDay('2026-10-19');
    expect(gifts).toEqual([]);
    game.setDay('2026-10-19');
    const coins = game.state.coins;
    game.setDay('2026-10-20');
    expect(gifts).toEqual(['return']);
    expect(game.state.coins - coins).toBe(Math.round(300 * (content.calendar.returnBonus?.incomeMin ?? 0)));
    game.setDay('2026-10-20');
    expect(gifts).toEqual(['return']);
  });

  it('the 7 days: coins of a gift never above 10 minutes of income', () => {
    for (const d of content.gifts.daily) {
      if (d.reward.incomeMin !== undefined) expect(d.reward.incomeMin, `day ${d.day}`).toBeLessThanOrEqual(10);
      expect(d.reward.coins ?? 0, `day ${d.day}`).toBe(0);
    }
  });
});
