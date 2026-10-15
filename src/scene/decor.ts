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

/**
 * M4-05: the pickup point behind the furniture — the repair (wallpaper stripes, a skirting, floor tiles by tier), the parcel
 * shelves (more boxes each tier of furnishing), the parcel locker of passive income; drawn into its own layer under the counter.
 */
export function drawPointBack(g: Graphics, items: Record<string, number>, l: ShopLayout, c: Colors): void {
  const d = l.decor;
  const w = l.outline * 0.8;
  const stroke = { width: w, color: c.outline };
  const u = l.unit;
  g.clear();
  const repair = items.point_repair ?? 0;
  if (repair > 0) {
    // Tier 1: wallpaper stripes; 2: a skirting along the floor; 3: floor tiles.
    for (let x = l.wall.x + u * 0.6; x < l.wall.x + l.wall.w; x += u * 1.2) g.rect(x, l.wall.y, u * 0.35, l.wall.h).fill({ color: c.wallShade, alpha: 0.55 });
    if (repair >= 2) g.rect(l.wall.x, l.floor.y - u * 0.22, l.wall.w, u * 0.22).fill(c.counter).stroke(stroke);
    if (repair >= 3) for (let x = l.floor.x; x < l.floor.x + l.floor.w; x += u * 1.2) for (let y = l.floor.y + u * 0.6; y < l.floor.y + l.floor.h; y += u * 1.2) g.rect(x, y, u * 1.2, w * 0.6).fill({ color: c.floorLine, alpha: 0.6 });
  }
  const furnish = items.point_furnish ?? 0;
  const sh = d.shelves;
  if ((items.point_rent ?? 0) > 0 && sh.w > u * 1.4 && sh.h > u * 0.45) {
    // The shelves: one board per tier of the lease (1–3) where the wall is tall enough, boxes on them by the furnishing tier.
    const boards = Math.max(1, Math.min(items.point_rent ?? 0, Math.floor(sh.h / (u * 0.5))));
    const boardGap = sh.h / Math.max(1, boards);
    for (let b = 0; b < boards; b++) {
      const y = sh.y + sh.h - b * boardGap;
      g.rect(sh.x, y, sh.w, w * 1.6).fill(c.counter).stroke(stroke);
      const boxes = Math.min(Math.floor(sh.w / (u * 0.6)), furnish * 2 + 1);
      for (let i = 0; i < boxes; i++) {
        const bw = u * (0.42 + ((i * 7 + b * 3) % 3) * 0.06);
        const bh = Math.min(boardGap * 0.8, u * (0.36 + ((i * 5 + b) % 3) * 0.08));
        const x = sh.x + u * 0.12 + i * u * 0.6;
        g.rect(x, y - bh, bw, bh).fill(c.counterTop).stroke(stroke);
        g.rect(x + bw * 0.42, y - bh, bw * 0.16, bh).fill({ color: c.counter, alpha: 0.8 });
      }
    }
  }
  const passive = items.point_passive ?? 0;
  if (passive > 0) {
    const k = d.locker;
    g.roundRect(k.x, k.y, k.w, k.h, w * 2).fill(c.doorFrame).stroke(stroke);
    const rows = 2 + passive;
    for (let r = 0; r < rows; r++) for (let col = 0; col < 2; col++) g.rect(k.x + k.w * (0.1 + col * 0.42), k.y + k.h * (0.08 + (r * 0.84) / rows), k.w * 0.38, (k.h * 0.84) / rows - w).fill(c.queueSpot).stroke({ width: w * 0.5, color: c.outline });
  }
}

/** M4-05: one decoration of the guest zone at x on the floor line y (size s); a bored zone (upkeep unpaid) draws it faded. */
function guestThing(g: Graphics, id: string, x: number, y: number, s: number, c: Colors, w: number, alpha: number): void {
  const stroke = { width: w, color: c.outline, alpha };
  if (id === 'plant') {
    g.roundRect(x - s * 0.22, y - s * 0.32, s * 0.44, s * 0.32, s * 0.06).fill({ color: c.counter, alpha }).stroke(stroke);
    for (const [dx, dy] of [[-0.18, -0.6], [0.16, -0.66], [0, -0.85]] as const) g.ellipse(x + s * dx, y + s * dy, s * 0.17, s * 0.26).fill({ color: c.uiGood, alpha }).stroke(stroke);
  } else if (id === 'bench') {
    g.rect(x - s * 0.55, y - s * 0.38, s * 1.1, s * 0.14).fill({ color: c.counter, alpha }).stroke(stroke);
    g.rect(x - s * 0.48, y - s * 0.24, s * 0.1, s * 0.24).fill({ color: c.doorFrame, alpha });
    g.rect(x + s * 0.38, y - s * 0.24, s * 0.1, s * 0.24).fill({ color: c.doorFrame, alpha });
  } else if (id === 'floorlamp') {
    g.moveTo(x, y).lineTo(x, y - s * 0.9).stroke(stroke);
    g.circle(x, y - s * 0.95, s * 0.3).fill({ color: c.counterTop, alpha: 0.35 * alpha });
    g.moveTo(x - s * 0.24, y - s * 0.82).lineTo(x - s * 0.14, y - s * 1.08).lineTo(x + s * 0.14, y - s * 1.08).lineTo(x + s * 0.24, y - s * 0.82).closePath().fill({ color: c.uiAccent, alpha }).stroke(stroke);
  } else if (id === 'aquarium') {
    g.roundRect(x - s * 0.42, y - s * 0.62, s * 0.84, s * 0.56, s * 0.08).fill({ color: c.incubatorGlass, alpha }).stroke(stroke);
    g.rect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.36).fill({ color: c.queueSpot, alpha: 0.7 * alpha });
    g.ellipse(x - s * 0.1, y - s * 0.26, s * 0.1, s * 0.06).fill({ color: c.uiAccent, alpha });
    g.rect(x - s * 0.36, y - s * 0.06, s * 0.72, s * 0.06).fill({ color: c.doorFrame, alpha });
  }
}

/** Draws every bought thing (decor item → level) into g. */
export function drawDecor(g: Graphics, items: Record<string, number>, l: ShopLayout, c: Colors): void {
  const d = l.decor;
  const w = l.outline * 0.8;
  const stroke = { width: w, color: c.outline };
  g.clear();
  // M4-05: the guest zone — a rug along the floor bottom, then the decorations on it; the poster on the wall under the showcase.
  const guests = ['plant', 'bench', 'floorlamp', 'aquarium'].filter((id) => items[`guest_${id}`]);
  const zone = d.guests;
  const faded = (id: string): number => ((items[`guest_${id}`] ?? 2) === 1 ? 0.45 : 1);
  if (items.guest_rug) g.roundRect(zone.x, zone.y + zone.h * 0.62, zone.w, zone.h * 0.32, zone.h * 0.16).fill({ color: c.blush, alpha: faded('rug') }).stroke({ width: w, color: c.outline, alpha: faded('rug') });
  guests.forEach((id, i) => guestThing(g, id, zone.x + zone.h * 0.7 + i * Math.min(zone.h * 1.5, (zone.w - zone.h) / Math.max(1, guests.length - 1 || 1)), zone.y + zone.h * 0.85, zone.h, c, w, faded(id)));
  if (items.guest_poster && d.poster.h > l.unit * 0.35) {
    const p = d.poster;
    g.rect(p.x, p.y, p.w, p.h).fill({ color: c.eyeWhite, alpha: faded('poster') }).stroke({ width: w, color: c.outline, alpha: faded('poster') });
    // A cat's head: ears and a face.
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h * 0.58;
    const r = Math.min(p.w, p.h) * 0.26;
    g.poly([cx - r, cy - r * 0.4, cx - r * 0.7, cy - r * 1.35, cx - r * 0.2, cy - r * 0.8]).fill({ color: c.uiAccent, alpha: faded('poster') });
    g.poly([cx + r, cy - r * 0.4, cx + r * 0.7, cy - r * 1.35, cx + r * 0.2, cy - r * 0.8]).fill({ color: c.uiAccent, alpha: faded('poster') });
    g.circle(cx, cy, r).fill({ color: c.uiAccent, alpha: faded('poster') }).stroke({ width: w * 0.6, color: c.outline });
  }
  // M4-05: the point's sign (a parcel), brighter each lease tier; the clerk at the counter; «2» of the second point on the sign.
  const rent = items.point_rent ?? 0;
  if (rent > 0) {
    const sp = d.pointSign;
    if (rent >= 3) g.circle(sp.x, sp.y, sp.r * 1.45).fill({ color: c.counterTop, alpha: 0.5 });
    g.roundRect(sp.x - sp.r, sp.y - sp.r * 0.8, sp.r * 2, sp.r * 1.6, sp.r * 0.2).fill(rent >= 2 ? c.showcase : c.counterTop).stroke(stroke);
    g.rect(sp.x - sp.r * 0.12, sp.y - sp.r * 0.8, sp.r * 0.24, sp.r * 1.6).fill(c.counter);
    if (items.point_second) {
      g.circle(sp.x + sp.r * 1.05, sp.y - sp.r * 0.75, sp.r * 0.45).fill(c.uiGood).stroke(stroke);
      g.circle(sp.x + sp.r * 1.05, sp.y - sp.r * 0.75, sp.r * 0.16).fill(c.outline);
    }
  }
  if (items.point_clerk) {
    const k = d.clerk;
    helperBody(g, k.x, k.y, k.r, c.queueSpot, c, w);
    if ((items.point_clerk ?? 0) >= 2) g.rect(k.x - k.r * 0.5, k.y - k.r * 0.85, k.r, k.r * 0.22).fill(c.uiAccent).stroke({ width: w * 0.6, color: c.outline });
  }
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
