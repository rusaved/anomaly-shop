import { describe, expect, it } from 'vitest';
import { computeShopLayout, type Rect } from '../src/scene/shop-layout.ts';
import { computeLayout, roomHeight, sceneTop } from '../src/ui/layout.ts';

/** M0-08: every shop piece sits inside the stage in both orientations and nothing overlaps what it should not. */
const inside = (r: Rect, s: Rect, slack = 1): boolean => r.x >= s.x - slack && r.y >= s.y - slack && r.x + r.w <= s.x + s.w + slack && r.y + r.h <= s.y + s.h + slack;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('computeShopLayout', () => {
  for (const [w, h] of [[375, 812], [812, 375], [1280, 720], [320, 568], [1920, 1080]] as const) {
    it(`${w}×${h}: pieces inside the stage, showcase above the floor, counter on the floor, queue by the door`, () => {
      const page = computeLayout(w, h);
      const l = computeShopLayout(page.stage, sceneTop(page), 0.34, 4, 18);
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

describe('W-08: a short room sideways — a dome and a place of the shelf never share a finger', () => {
  for (const [w, h] of [[815, 290], [812, 330], [880, 405]] as const) {
    for (const inc of [1, 2, 3, 4]) {
      it(`${w}×${h}, ${inc} incubators: the dome and its tap circle stay under the shelf and its places`, () => {
        const page = computeLayout(w, h);
        const l = computeShopLayout(page.stage, sceneTop(page), 0.34, 4, 18, inc, 3, 3, null, roomHeight(page));
        const shelfBottom = l.showcase.y + l.showcase.h;
        // The tap zones of src/scene/shop.ts: a dome — a circle of 1.25 r; a place — its rect, 10 % over its bottom.
        const slotTapBottom = Math.max(...l.slots.map((s) => s.y + s.h * 1.1));
        for (const i of l.incubators) {
          expect(i.y - i.r - l.outline).toBeGreaterThanOrEqual(shelfBottom);
          expect(i.y - i.r * 1.25).toBeGreaterThanOrEqual(slotTapBottom);
        }
      });
    }
  }
});


describe('T-03: a dome and a place of the shelf stay a finger apart at any number of places (one and two rows)', () => {
  // The distance from a point to a rect (0 inside it).
  const away = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
  for (const [w, h] of [[815, 290], [812, 330], [880, 405]] as const) {
    for (const places of [3, 4, 5, 6]) {
      for (const inc of [1, 2, 3, 4]) {
        it(`${w}×${h}, ${places} places, ${inc} incubators`, () => {
          const page = computeLayout(w, h);
          const l = computeShopLayout(page.stage, sceneTop(page), 0.34, 4, 18, inc, places, 3, null, roomHeight(page));
          // The tap zone of a place (src/scene/shop.ts): its rect with half a gap at the sides and 10 % over the top and bottom;
          // the «+» of a free place is the rect itself.
          const taps = l.slots.map((s) => ({ x: s.x - l.slotGap / 2, y: s.y - s.h * 0.1, w: s.w + l.slotGap, h: s.h * 1.2 }));
          for (const i of l.incubators) for (const t of taps) expect(away(i.x, i.y, t)).toBeGreaterThanOrEqual(Math.max(22, i.r * 1.25));
          // The counter stays in the room, clear of the queue at the door.
          expect(l.counter.x + l.counter.w).toBeLessThanOrEqual(l.door.x);
          for (const i of l.incubators) expect(i.r * 2.4).toBeGreaterThanOrEqual(26);
        });
      }
    }
  }
});
