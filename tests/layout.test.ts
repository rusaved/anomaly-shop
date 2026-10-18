import { describe, expect, it } from 'vitest';
import { computeLayout, PANEL } from '../src/ui/layout.ts';

/** SCR-01, UB-01, MU-02: the reference sizes (docs/05, section 3) and odd proportions all give a stage, a home panel, a tab screen and a tab bar that fit. */
const fits = (w: number, h: number) => {
  const l = computeLayout(w, h);
  for (const r of [l.stage, l.panel, l.nav, l.screen]) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(w);
    expect(r.y + r.h).toBeLessThanOrEqual(h);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  }
  // UB-01: one tab bar at the bottom, the whole width, in every orientation.
  expect(l.nav).toMatchObject({ x: 0, w, y: h - l.nav.h });
  // A tab screen fills everything between the top bar and the tab bar.
  expect(l.screen).toMatchObject({ x: 0, y: l.hudHeight, w, h: h - l.nav.h - l.hudHeight });
  return l;
};

describe('computeLayout', () => {
  it('375×650 portrait (the zone of 07): the shop above the tab bar, the top bar 48 over it, the tab bar 56', () => {
    const l = fits(375, 650);
    expect(l.orientation).toBe('portrait');
    expect(l.hudHeight).toBe(PANEL.hudHeight);
    expect(l.nav.h).toBe(PANEL.navHeight);
    expect(l.stage).toMatchObject({ x: 0, y: 0, w: 375, h: 650 - PANEL.navHeight });
    // MU-03 (s1-shop-scene): the room takes ~43 %, the «Витрина» strip lies under it with 16 px margins.
    expect(l.panel.y).toBeGreaterThanOrEqual(PANEL.roomMin);
    expect(l.panel.y + l.panel.h).toBe(l.nav.y);
    expect(l.shelf).not.toBeNull();
    expect(l.shelf!.x).toBe(PANEL.pad);
    expect(l.shelf!.w).toBe(375 - PANEL.pad * 2);
    expect(l.shelf!.y).toBeGreaterThan(l.panel.y);
  });

  it('812×375 landscape phone (l1): the room left 45 %, the eggs right, both under the top bar; the tab bar 48', () => {
    const l = fits(812, 375);
    expect(l.orientation).toBe('landscape');
    expect(l.nav.h).toBe(PANEL.navHeightShort);
    expect(l.stage.y).toBe(l.hudHeight);
    expect(l.stage.w).toBe(Math.round(812 * PANEL.landscapeShare));
    expect(l.panel.x).toBe(l.stage.w);
    expect(l.panel.y + l.panel.h).toBe(l.nav.y);
    expect(l.shelf).toBeNull();
  });

  it('1280×720 desktop: the same landscape model, the tab bar is not a side column', () => {
    const l = fits(1280, 720);
    expect(l.orientation).toBe('landscape');
    expect(l.panel.w).toBe(1280 - l.stage.w);
    expect(l.nav.w).toBe(1280);
  });

  it('any proportion fits: square, tall, wide, tiny', () => {
    for (const [w, h] of [[600, 600], [320, 1200], [320, 568], [2000, 500], [200, 300], [300, 200]]) fits(w!, h!);
    expect(computeLayout(600, 600).orientation).toBe('portrait');
  });

  it('safe insets grow the tab bar, the top bar and keep the shelf off the covered edge', () => {
    const plain = computeLayout(375, 812);
    const notch = computeLayout(375, 812, { top: 47, right: 0, bottom: 34, left: 0 });
    expect(notch.nav.h).toBe(plain.nav.h + 34);
    expect(notch.hudHeight).toBe(plain.hudHeight + 47);
    const side = computeLayout(375, 650, { top: 0, right: 20, bottom: 0, left: 20 });
    expect(side.shelf!.x).toBe(PANEL.pad + 20);
  });
});
