// What: primitive art in the A style (flat cute vector, thick outline; Q-001): eggs now, creatures and customers as they arrive.
// Called by: src/scene/shop.ts (each piece drawn into its own Graphics, centred at 0,0, then moved by its container).
// Keep: shapes only, no state; every color from content/style.json; sizes scale from the radius r.

import type { Graphics } from 'pixi.js';
import type { StyleData } from '../content/schemas.ts';

type Colors = StyleData['colors'];

/** An egg centred at 0,0 (height 1.44 r); cracks grow with the hatch share. */
export function drawEgg(g: Graphics, r: number, c: Colors, outline: number, share: number): void {
  const rx = r * 0.56;
  const ry = r * 0.72;
  g.clear();
  g.ellipse(0, 0, rx, ry).fill(c.egg).stroke({ width: outline, color: c.outline });
  g.circle(-rx * 0.3, -ry * 0.25, r * 0.12).fill(c.eggSpots);
  g.circle(rx * 0.4, ry * 0.25, r * 0.1).fill(c.eggSpots);
  g.circle(-rx * 0.15, ry * 0.45, r * 0.07).fill(c.eggSpots);
  // Shine.
  g.ellipse(-rx * 0.45, -ry * 0.5, rx * 0.16, ry * 0.12).fill({ color: c.incubatorGlass, alpha: 0.9 });
  if (share > 0.45) {
    const w = Math.max(1.5, outline * 0.6);
    g.moveTo(-rx * 0.6, -ry * 0.05).lineTo(-rx * 0.25, ry * 0.12).lineTo(0, -ry * 0.08).lineTo(rx * 0.2, ry * 0.1).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
  }
  if (share > 0.75) {
    const w = Math.max(1.5, outline * 0.6);
    g.moveTo(rx * 0.2, ry * 0.1).lineTo(rx * 0.5, -ry * 0.12).lineTo(rx * 0.75, ry * 0.02).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
    g.moveTo(-rx * 0.1, -ry * 0.5).lineTo(rx * 0.05, -ry * 0.3).lineTo(-rx * 0.05, -ry * 0.15).stroke({ width: w, color: c.outline, cap: 'round', join: 'round' });
  }
}

/** Progress ring around an incubator dome: a faint track and the done part from 12 o'clock clockwise. */
export function drawRing(g: Graphics, x: number, y: number, r: number, share: number, c: Colors, width: number): void {
  g.circle(x, y, r).stroke({ width, color: c.outline, alpha: 0.18 });
  if (share <= 0) return;
  const a0 = -Math.PI / 2;
  const a1 = a0 + Math.PI * 2 * Math.min(1, share);
  g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r)
    .arc(x, y, r, a0, a1)
    .stroke({ width, color: c.uiGood, cap: 'round' });
}
