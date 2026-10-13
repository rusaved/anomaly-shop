import { describe, expect, it } from 'vitest';
import { BOTS, CHECKS, playOnce, runBalance } from '../scripts/balance-model.ts';

/** M1-11: the balance model F1–F4 (docs/01a, section 9) stays green; the full run with more seeds is `npm run sim:balance`. */
describe('M1-11 balance model', () => {
  it('F1–F4 hold on the slowest 10% of runs for every bot', () => {
    const report = runBalance(8);
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('the checks are the ones of docs/01a: 40 s, 2 min, 3 min, 5 min', () => {
    expect(CHECKS.map((c) => [c.id, c.limitSec])).toEqual([['F1', 40], ['F2', 120], ['F3', 180], ['F4', 300]]);
  });

  it('feeding pays: the bot that feeds to level 2 earns more than the one that sells at once', () => {
    const casual = BOTS.find((b) => b.name === 'casual')!;
    const rusher = BOTS.find((b) => b.name === 'rusher')!;
    const sum = (bot: typeof casual) => [1, 2, 3, 4, 5].reduce((s, seed) => s + playOnce(bot, seed).coins5min, 0);
    expect(sum(casual)).toBeGreaterThan(sum(rusher));
  });
});
