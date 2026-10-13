import { describe, expect, it } from 'vitest';
import { computeShopLayout, type Rect } from '../src/scene/shop-layout.ts';
import { computeLayout } from '../src/ui/layout.ts';

/** M0-08: every shop piece sits inside the stage in both orientations and nothing overlaps what it should not. */
const inside = (r: Rect, s: Rect, slack = 1): boolean => r.x >= s.x - slack && r.y >= s.y - slack && r.x + r.w <= s.x + s.w + slack && r.y + r.h <= s.y + s.h + slack;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('computeShopLayout', () => {
  for (const [w, h] of [[375, 812], [812, 375], [1280, 720], [320, 568], [1920, 1080]] as const) {
    it(`${w}×${h}: pieces inside the stage, showcase above the floor, counter on the floor, queue by the door`, () => {
      const page = computeLayout(w, h);
      const l = computeShopLayout(page.stage, page.hudHeight, 0.34, 4, 18);
      const stage = page.stage;
      for (const r of [l.wall, l.floor, l.counter, l.counterTop, l.showcase, l.door, ...l.slots]) expect(inside(r, stage)).toBe(true);
      for (const s of l.queue) expect(inside({ x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 }, stage, 2)).toBe(true);
      expect(l.showcase.y).toBeGreaterThanOrEqual(stage.y + Math.min(page.hudHeight, stage.h * 0.3) - 1);
      expect(l.showcase.y + l.showcase.h).toBeLessThanOrEqual(l.floor.y);
      expect(l.counter.y).toBeGreaterThanOrEqual(l.floor.y);
      expect(overlap(l.showcase, l.door)).toBe(false);
      expect(overlap(l.counter, l.door)).toBe(false);
      for (const s of l.queue) expect(overlap({ x: s.x - s.r, y: s.y - s.r * 0.55, w: s.r * 2, h: s.r * 1.1 }, l.counterTop)).toBe(false);
      for (const s of l.queue) expect(overlap({ x: s.x - s.r, y: s.y - s.r * 0.55, w: s.r * 2, h: s.r * 1.1 }, l.counter)).toBe(false);
      expect(l.door.y + l.door.h).toBeCloseTo(l.floor.y, 5);
      for (const s of l.slots) expect(inside(s, l.showcase)).toBe(true);
      expect(l.incubator.y).toBeLessThan(l.counterTop.y);
      expect(l.unit).toBeGreaterThanOrEqual(18);
    });
  }
});
