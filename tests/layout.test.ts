import { describe, expect, it } from 'vitest';
import { computeLayout, PANEL } from '../src/ui/layout.ts';

/** SCR-01: the three reference sizes (docs/05, section 3) and odd proportions all give a stage and a panel that fit. */
const fits = (w: number, h: number) => {
  const l = computeLayout(w, h);
  for (const r of [l.stage, l.panel, l.nav, l.sheet]) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(w);
    expect(r.y + r.h).toBeLessThanOrEqual(h);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  }
  return l;
};

describe('computeLayout', () => {
  it('375×812 portrait: shop above, panel below, stage keeps most of the height', () => {
    const l = fits(375, 812);
    expect(l.orientation).toBe('portrait');
    expect(l.stage.w).toBe(375);
    expect(l.panel.y).toBe(l.stage.h);
    expect(l.panel.h).toBeGreaterThanOrEqual(PANEL.portraitMin);
    expect(l.panel.h).toBeLessThanOrEqual(PANEL.portraitMax);
    expect(l.stage.h).toBeGreaterThan(l.height * 0.55);
    // M3-03: the tab bar under the panel; a sheet leaves the top of the shop in view.
    expect(l.nav.y).toBe(l.panel.y + l.panel.h);
    expect(l.nav.y + l.nav.h).toBe(812);
    expect(l.sheet.y).toBeGreaterThanOrEqual(l.hudHeight);
    expect(l.sheet.y + l.sheet.h).toBe(l.nav.y);
  });

  it('812×375 landscape phone: shop left, panel right with at least the minimum width', () => {
    const l = fits(812, 375);
    expect(l.orientation).toBe('landscape');
    expect(l.stage.h).toBe(375);
    expect(l.panel.x).toBe(l.stage.w);
    expect(l.panel.w).toBeGreaterThanOrEqual(PANEL.landscapeMin);
    expect(l.stage.w).toBeGreaterThan(400);
    // M3-03: the tab bar under the panel in its column; a sheet takes the panel place, the shop stays at full height.
    expect(l.nav).toMatchObject({ x: l.panel.x, w: l.panel.w, y: l.panel.h });
    expect(l.sheet).toEqual(l.panel);
  });

  it('1280×720 desktop: panel capped at its maximum, stage gets the rest', () => {
    const l = fits(1280, 720);
    expect(l.orientation).toBe('landscape');
    expect(l.panel.w).toBe(PANEL.landscapeMax);
    expect(l.stage.w).toBe(1280 - PANEL.landscapeMax);
  });

  it('any proportion fits: square, tall, wide, tiny', () => {
    for (const [w, h] of [[600, 600], [320, 1200], [2000, 500], [200, 300], [300, 200]]) fits(w!, h!);
    expect(computeLayout(600, 600).orientation).toBe('portrait');
  });

  it('safe insets grow the tab bar and the panel on the covered edge', () => {
    const plain = computeLayout(375, 812);
    const notch = computeLayout(375, 812, { top: 47, right: 0, bottom: 34, left: 0 });
    expect(notch.nav.h).toBe(plain.nav.h + 34);
    expect(notch.hudHeight).toBe(plain.hudHeight + 47);
    const side = computeLayout(812, 375, { top: 0, right: 44, bottom: 21, left: 44 });
    expect(side.panel.w).toBe(computeLayout(812, 375).panel.w + 44);
  });
});
