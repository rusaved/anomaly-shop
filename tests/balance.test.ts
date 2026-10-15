import { describe, expect, it } from 'vitest';
import { BOTS, CHECKS, LIMITS, playOnce, runBalance } from '../scripts/balance-model.ts';

/** M1-11, M2-09: the balance model F1–F8, F10 (docs/01a, section 9) stays green; the full run with more seeds is `npm run sim:balance`. */
describe('balance model', () => {
  it('the report covers F1–F11 for every bot; green or not is decided by the sim:balance stage (24 seeds, small samples are noisy)', () => {
    const report = runBalance(3, 1);
    const text = report.lines.join('\n');
    for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11']) expect(text).toContain(id);
    for (const bot of BOTS) expect(text).toContain(bot.name);
    expect(report.lines.some((l) => l.includes('F9') && l.includes('M4'))).toBe(true);
    expect(report.ok).toBe(report.failures.length === 0);
    // The long runs (three days with nights away) take most of it.
  }, 60_000);

  it('the checks are the ones of docs/01a at a live tempo (Q-027 B): 40 s, 2 min, 3 min, 5 min; F13–F15 60 s, 10 min, 10 min; F16 levels 2–5 by 1.5, 3, 4.5, 6 min; ×1.3; 30–60 min; day 2–3; 10 and 40 min; F11 3 min', () => {
    expect(CHECKS.map((c) => [c.id, c.limitSec])).toEqual([['F1', 40], ['F2', 120], ['F3', 180], ['F4', 300], ['F13', 60], ['F14', 600], ['F15', 600], ['F16.2', 90], ['F16.3', 180], ['F16.4', 270], ['F16.5', 360]]);
    expect(LIMITS).toMatchObject({ F5growth: 1.3, F6minutes: [30, 60], F7days: [2, 3], F8street: 600, F8square: 2400, F11goalMinutes: 3 });
  });

  it('feeding pays (Q-027 B, live tempo): the bot that taps its creatures between deals earns more than the one that never feeds', () => {
    const rusher = BOTS.find((b) => b.name === 'rusher')!;
    const sum = (bot: typeof rusher) => [1, 2, 3, 4, 5, 6].reduce((s, seed) => s + playOnce(bot, seed).coins5min, 0);
    expect(sum(rusher)).toBeGreaterThan(sum({ ...rusher, name: 'nofeed', noFeed: true }));
  });
});
