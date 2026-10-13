import { describe, expect, it } from 'vitest';
import { createCounter } from '../src/ui/counter.ts';

/** M1-07: the HUD counter glides without jumps (criterion «HUD обновляется без рывков»). */
describe('M1-07 HUD counter', () => {
  it('rolls up monotonically in small steps and lands exactly on the target', () => {
    const c = createCounter(0);
    c.set(120, 0.5, 0.3);
    const seen: number[] = [];
    for (let i = 0; i < 120; i++) {
      c.step(1 / 60);
      seen.push(c.shown());
    }
    expect(seen.at(-1)).toBe(120);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
      // No frame jumps more than 10% of the change (60 fps).
      expect(seen[i]! - seen[i - 1]!).toBeLessThanOrEqual(12);
    }
    // Waits for the coins to fly in first.
    expect(seen[15]).toBe(0);
  });

  it('a new target mid-roll continues from the value on screen (no snap back)', () => {
    const c = createCounter(10);
    c.set(110, 0.5);
    for (let i = 0; i < 10; i++) c.step(1 / 60);
    const mid = c.shown();
    c.set(100, 0.5);
    c.step(1 / 60);
    expect(Math.abs(c.shown() - mid)).toBeLessThan(10);
    for (let i = 0; i < 60; i++) c.step(1 / 60);
    expect(c.shown()).toBe(100);
  });

  it('spending rolls down; snap() is instant (load, language)', () => {
    const c = createCounter(50);
    c.set(40, 0.3);
    for (let i = 0; i < 30; i++) c.step(1 / 60);
    expect(c.shown()).toBe(40);
    c.snap(7);
    expect(c.shown()).toBe(7);
    expect(c.step(1 / 60)).toBe(false);
  });
});
