// What: the bought things of the shop drawn in the A style (M2-07, M2-12; docs/01b, section 1.4): sign, register, ladder items, helpers.
// Called by: src/scene/shop.ts (redraws the static layer when the bought set or the layout changes).
// Keep: shapes only, no state; positions from ShopLayout.decor; every color from style.json; level shows as stars or coins.

import type { Graphics } from 'pixi.js';
import type { StyleData } from '../content/schemas.ts';
import type { ShopLayout } from './shop-layout.ts';

type Colors = StyleData['colors'];

function star(g: Graphics, x: number, y: number, size: number, color: string): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 5;
    const d = i % 2 === 0 ? size : size * 0.45;
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.poly(pts).fill(color);
}

function helperBody(g: Graphics, x: number, y: number, r: number, body: string, c: Colors, w: number): void {
  g.ellipse(x, y + r * 0.95, r * 0.8, r * 0.22).fill({ color: c.outline, alpha: 0.18 });
  g.roundRect(x - r * 0.7, y - r * 0.6, r * 1.4, r * 1.5, r * 0.6).fill(body).stroke({ width: w, color: c.outline });
  for (const dx of [-0.25, 0.25]) g.circle(x + r * dx, y - r * 0.1, r * 0.1).fill(c.outline);
  g.moveTo(x - r * 0.15, y + r * 0.12).quadraticCurveTo(x, y + r * 0.25, x + r * 0.15, y + r * 0.12).stroke({ width: w * 0.6, color: c.outline, cap: 'round' });
}

/** Draws every bought thing (decor item → level) into g. */
export function drawDecor(g: Graphics, items: Record<string, number>, l: ShopLayout, c: Colors): void {
  const d = l.decor;
  const w = l.outline * 0.8;
  const stroke = { width: w, color: c.outline };
  g.clear();
  if (items.mat) {
    const m = d.mat;
    g.roundRect(m.x, m.y, m.w, m.h, m.h / 2).fill(c.blush).stroke(stroke);
    for (let i = 1; i < 4; i++) g.rect(m.x + (m.w * i) / 4 - w * 0.4, m.y + m.h * 0.2, w * 0.8, m.h * 0.6).fill({ color: c.eyeWhite, alpha: 0.6 });
  }
  if (items.register) {
    const r = d.register;
    g.roundRect(r.x, r.y + r.h * 0.25, r.w, r.h * 0.75, r.h * 0.12).fill(c.incubator).stroke(stroke);
    g.roundRect(r.x + r.w * 0.12, r.y, r.w * 0.76, r.h * 0.38, r.h * 0.08).fill(c.incubatorGlass).stroke({ width: w * 0.8, color: c.outline });
    for (let i = 0; i < 3; i++) g.circle(r.x + r.w * (0.25 + i * 0.25), r.y + r.h * 0.65, r.h * 0.08).fill(c.counterTop);
    const coins = Math.min(5, items.register);
    for (let i = 0; i < coins; i++) g.ellipse(r.x + r.w * 0.5, r.y - r.h * (0.06 + i * 0.1), r.w * 0.18, r.h * 0.07).fill(c.uiAccent).stroke({ width: w * 0.5, color: c.outline });
  }
  if (items.bowl) {
    const b = d.bowl;
    g.ellipse(b.x, b.y - b.r * 0.15, b.r * 0.85, b.r * 0.3).fill(c.eggSpots).stroke({ width: w * 0.7, color: c.outline });
    for (const dx of [-0.35, 0, 0.35]) g.circle(b.x + b.r * dx, b.y - b.r * 0.32, b.r * 0.16).fill(c.counterTop).stroke({ width: w * 0.5, color: c.outline });
    g.moveTo(b.x - b.r, b.y - b.r * 0.15).quadraticCurveTo(b.x, b.y + b.r * 1.05, b.x + b.r, b.y - b.r * 0.15).closePath().fill(c.rarityRare).stroke(stroke);
  }
  if (items.stool) {
    const s = d.stool;
    for (const dx of [-0.55, 0.55]) g.roundRect(s.x + s.r * dx - w, s.y - s.r * 0.2, w * 2, s.r * 1.1, w).fill(c.floorLine).stroke({ width: w * 0.6, color: c.outline });
    g.ellipse(s.x, s.y - s.r * 0.25, s.r, s.r * 0.35).fill(c.counter).stroke(stroke);
    g.ellipse(s.x, s.y - s.r * 0.32, s.r * 0.7, s.r * 0.18).fill({ color: c.counterTop, alpha: 0.8 });
  }
  if (items.radio) {
    const r = d.radio;
    g.moveTo(r.x + r.w * 0.75, r.y + r.h * 0.1).lineTo(r.x + r.w * 0.95, r.y - r.h * 0.55).stroke({ width: w * 0.8, color: c.outline, cap: 'round' });
    g.roundRect(r.x, r.y, r.w, r.h, r.h * 0.25).fill(c.rarityEpic).stroke(stroke);
    g.circle(r.x + r.w * 0.3, r.y + r.h * 0.52, r.h * 0.28).fill(c.uiPanelAlt).stroke({ width: w * 0.6, color: c.outline });
    for (let i = 0; i < 3; i++) g.rect(r.x + r.w * 0.58, r.y + r.h * (0.28 + i * 0.18), r.w * 0.3, w * 0.7).fill(c.outline);
  }
  if (items.clock) {
    const k = d.clock;
    g.moveTo(k.x, k.y + k.r * 0.9).lineTo(k.x, k.y + k.r * 1.6).stroke({ width: w * 0.6, color: c.outline });
    g.circle(k.x, k.y + k.r * 1.65, k.r * 0.16).fill(c.uiAccent).stroke({ width: w * 0.5, color: c.outline });
    g.poly([k.x - k.r * 1.05, k.y - k.r * 0.45, k.x, k.y - k.r * 1.25, k.x + k.r * 1.05, k.y - k.r * 0.45]).fill(c.floorLine).stroke({ width: w, color: c.outline, join: 'round' });
    g.roundRect(k.x - k.r * 0.8, k.y - k.r * 0.55, k.r * 1.6, k.r * 1.45, k.r * 0.2).fill(c.counter).stroke(stroke);
    g.circle(k.x, k.y + k.r * 0.2, k.r * 0.5).fill(c.eyeWhite).stroke({ width: w * 0.7, color: c.outline });
    g.moveTo(k.x, k.y + k.r * 0.2).lineTo(k.x, k.y - k.r * 0.15).stroke({ width: w * 0.6, color: c.outline, cap: 'round' });
    g.moveTo(k.x, k.y + k.r * 0.2).lineTo(k.x + k.r * 0.25, k.y + k.r * 0.28).stroke({ width: w * 0.6, color: c.outline, cap: 'round' });
    g.circle(k.x, k.y - k.r * 0.72, k.r * 0.16).fill(c.uiPanelAlt);
  }
  if (items.board) {
    const b = d.board;
    g.roundRect(b.x, b.y, b.w, b.h, b.h * 0.12).fill(c.counter).stroke(stroke);
    g.roundRect(b.x + b.w * 0.14, b.y + b.h * 0.16, b.w * 0.5, b.h * 0.62, b.h * 0.05).fill(c.eyeWhite).stroke({ width: w * 0.5, color: c.outline });
    g.circle(b.x + b.w * 0.39, b.y + b.h * 0.2, b.h * 0.07).fill(c.blush);
    for (let i = 0; i < 3; i++) g.rect(b.x + b.w * 0.2, b.y + b.h * (0.36 + i * 0.13), b.w * 0.36, w * 0.5).fill(c.uiMuted);
    star(g, b.x + b.w * 0.8, b.y + b.h * 0.45, b.h * 0.18, c.uiAccent);
  }
  if (items.feeder) {
    const f = d.feeder;
    helperBody(g, f.x, f.y, f.r, c.uiGood, c, w);
    // A spoon held up.
    g.moveTo(f.x + f.r * 0.6, f.y + f.r * 0.2).lineTo(f.x + f.r * 1.1, f.y - f.r * 0.6).stroke({ width: w, color: c.outline, cap: 'round' });
    g.ellipse(f.x + f.r * 1.15, f.y - f.r * 0.72, f.r * 0.2, f.r * 0.13).fill(c.incubatorGlass).stroke({ width: w * 0.6, color: c.outline });
  }
  if (items.seller) {
    const s = d.seller;
    helperBody(g, s.x, s.y, s.r, c.rarityRare, c, w);
    // A bow tie.
    g.poly([s.x - s.r * 0.3, s.y + s.r * 0.38, s.x, s.y + s.r * 0.48, s.x - s.r * 0.3, s.y + s.r * 0.58]).fill(c.blush);
    g.poly([s.x + s.r * 0.3, s.y + s.r * 0.38, s.x, s.y + s.r * 0.48, s.x + s.r * 0.3, s.y + s.r * 0.58]).fill(c.blush);
  }
  if (items.courier) {
    const k = d.courier;
    // A little bird with a bag, perched on the door.
    g.ellipse(k.x, k.y, k.r, k.r * 0.8).fill(c.uiAccent).stroke(stroke);
    g.poly([k.x + k.r * 0.9, k.y - k.r * 0.1, k.x + k.r * 1.4, k.y + k.r * 0.05, k.x + k.r * 0.9, k.y + k.r * 0.2]).fill(c.counterTop).stroke({ width: w * 0.6, color: c.outline, join: 'round' });
    g.circle(k.x + k.r * 0.4, k.y - k.r * 0.2, k.r * 0.13).fill(c.outline);
    g.roundRect(k.x - k.r * 0.7, k.y + k.r * 0.2, k.r * 0.8, k.r * 0.6, k.r * 0.15).fill(c.egg).stroke({ width: w * 0.6, color: c.outline });
  }
}

/** The shop sign around its hook point (0,0 = top middle) so it can swing: a board, stars by level, a glow; the badge egg is apart (it hops). */
export function drawSign(g: Graphics, badge: Graphics, w: number, h: number, level: number, glow: boolean, c: Colors, outline: number): void {
  const lw = outline * 0.8;
  const stroke = { width: lw, color: c.outline };
  g.clear();
  badge.clear();
  if (glow) g.roundRect(-w / 2 - lw * 3, -lw, w + lw * 6, h + lw * 6, h * 0.4).fill({ color: c.counterTop, alpha: 0.55 });
  g.moveTo(-w * 0.3, lw * 2).lineTo(-w * 0.3, -lw).stroke(stroke);
  g.moveTo(w * 0.3, lw * 2).lineTo(w * 0.3, -lw).stroke(stroke);
  g.roundRect(-w / 2, lw * 2, w, h, h * 0.3).fill(level > 0 ? c.counterTop : c.showcaseSlot).stroke(stroke);
  for (let i = 0; i < Math.min(5, level); i++) star(g, -w / 2 + w * (0.42 + (i * 0.48) / 4), lw * 2 + h * 0.5, h * 0.17, c.uiAccent);
  // An egg with a spot: the shop's mark, no words on pictures.
  const er = h * 0.32;
  badge.ellipse(0, 0, er * 0.78, er).fill(c.egg).stroke({ width: lw * 0.7, color: c.outline });
  badge.circle(-er * 0.08, -er * 0.18, er * 0.22).fill(c.eggSpots);
  badge.position.set(-w / 2 + w * (level > 0 ? 0.22 : 0.5), lw * 2 + h * 0.5);
}

/** The hanging lamp (0,0 = the bulb): a cord up to the ceiling, a shade, the bulb warm or cold. */
export function drawLamp(g: Graphics, r: number, cord: number, warm: boolean, c: Colors, outline: number): void {
  const lw = outline * 0.8;
  g.clear();
  g.moveTo(0, -r * 0.6).lineTo(0, -r * 0.6 - cord).stroke({ width: lw * 0.7, color: c.outline });
  g.circle(0, r * 0.15, r * 0.95).fill({ color: warm ? c.counterTop : c.incubatorGlass, alpha: 0.25 });
  g.circle(0, r * 0.2, r * 0.42).fill(warm ? c.counterTop : c.incubatorGlass).stroke({ width: lw * 0.6, color: c.outline });
  g.moveTo(-r * 0.75, r * 0.05).quadraticCurveTo(-r * 0.6, -r * 0.7, 0, -r * 0.7).quadraticCurveTo(r * 0.6, -r * 0.7, r * 0.75, r * 0.05).closePath().fill(c.uiAccent).stroke({ width: lw, color: c.outline, join: 'round' });
}

/** The bell by the door, drawn around its hook (0,0) so it can swing. */
export function drawBell(g: Graphics, r: number, c: Colors, outline: number): void {
  const w = outline * 0.8;
  g.clear();
  g.moveTo(0, -r * 1.2).lineTo(0, -r * 0.7).stroke({ width: w, color: c.outline });
  g.moveTo(-r * 0.75, r * 0.45).quadraticCurveTo(-r * 0.7, -r * 0.75, 0, -r * 0.75).quadraticCurveTo(r * 0.7, -r * 0.75, r * 0.75, r * 0.45).closePath().fill(c.rarityLegendary).stroke({ width: w, color: c.outline, join: 'round' });
  g.circle(0, r * 0.55, r * 0.2).fill(c.counter).stroke({ width: w * 0.6, color: c.outline });
}
