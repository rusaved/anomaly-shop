// What: the pictures of the upgrades on the «Магазин» cards and the side job bowl (MU, the round of fixes, items 4 and 6): the things of the shop in the A style.
// Called by: src/scene/portraits.ts (drawn once into an image, like a pet).
// Keep: shapes only, colors from style.json; a bought thing is the scene's own decor (drawDecor) with a soft shadow; no round orange disc — that is the coin.

import { Container, Graphics } from 'pixi.js';
import type { StyleData } from '../content/schemas.ts';
import { drawEgg, drawRing } from './art.ts';
import { drawBell, drawDecor, drawSign } from './decor.ts';
import type { ShopLayout } from './shop-layout.ts';

type Colors = StyleData['colors'];

/** One thing of the scene's decor at 0,0 in a box of radius R: a layout that holds only the places drawDecor reads. */
function decorThing(g: Graphics, items: Record<string, number>, R: number, c: Colors, outline: number): void {
  const spot = (r: number, dy = 0) => ({ x: 0, y: dy, r });
  const rect = (w: number, h: number, dy = 0) => ({ x: -w / 2, y: -h / 2 + dy, w, h });
  const decor = {
    register: rect(R * 1.3, R * 1.2, R * 0.2),
    bowl: spot(R * 0.95, R * 0.05),
    stool: spot(R * 0.9, -R * 0.1),
    radio: rect(R * 1.6, R * 0.95, R * 0.2),
    clock: spot(R * 0.6, -R * 0.3),
    board: rect(R * 1.6, R * 1.3),
    feeder: spot(R * 0.75, -R * 0.05),
    seller: spot(R * 0.85, -R * 0.15),
    courier: spot(R * 0.75, -R * 0.1),
    mat: rect(R * 1.8, R * 0.6),
    pointSign: spot(R * 0.75, 0),
    clerk: spot(R * 0.85, -R * 0.15),
    guests: rect(0, 0),
    poster: rect(0, 0),
  };
  drawDecor(g, items, { decor, outline, unit: R } as unknown as ShopLayout, c);
}

function incubator(box: Container, R: number, c: Colors, outline: number, speed: boolean): void {
  const g = new Graphics();
  const stroke = { width: outline * 0.8, color: c.outline };
  g.roundRect(-R * 0.85, R * 0.42, R * 1.7, R * 0.42, R * 0.16).fill(c.incubator).stroke(stroke);
  g.circle(0, -R * 0.02, R * 0.68).fill({ color: c.incubatorGlass, alpha: 0.9 }).stroke(stroke);
  box.addChild(g);
  const egg = new Graphics();
  drawEgg(egg, R * 0.7, c, outline * 0.8, 0);
  egg.position.set(0, R * 0.02);
  box.addChild(egg);
  // A hatch that goes faster: the green ring of the incubator, most of the way round.
  if (speed) {
    const ring = new Graphics();
    drawRing(ring, 0, -R * 0.02, R * 0.84, 0.7, c, outline * 1.1);
    box.addChild(ring);
  }
}

function showcase(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline };
  g.roundRect(-R * 0.95, -R * 0.55, R * 1.9, R * 1.1, R * 0.2).fill(c.showcase).stroke(stroke);
  for (let i = 0; i < 3; i++) g.roundRect(-R * 0.8 + i * R * 0.55, -R * 0.38, R * 0.48, R * 0.76, R * 0.1).fill(c.showcaseSlot);
  // The new place: a «+».
  const x = -R * 0.8 + 2 * R * 0.55 + R * 0.24;
  g.rect(x - R * 0.04, -R * 0.16, R * 0.08, R * 0.32).fill(c.outline);
  g.rect(x - R * 0.16, -R * 0.04, R * 0.32, R * 0.08).fill(c.outline);
}

function tags(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline, join: 'round' as const };
  g.moveTo(-R * 0.75, -R * 0.75).lineTo(-R * 0.35, -R * 0.35).stroke({ width: outline * 0.6, color: c.outline, cap: 'round' });
  g.poly([-R * 0.45, -R * 0.2, R * 0.05, -R * 0.7, R * 0.85, R * 0.1, R * 0.35, R * 0.6, -R * 0.45, -R * 0.2]).fill(c.eyeWhite).stroke(stroke);
  g.circle(-R * 0.2, -R * 0.2, R * 0.1).fill(c.outline);
  // A heart on the tag.
  const hx = R * 0.22;
  const hy = R * 0.02;
  const s = R * 0.18;
  g.circle(hx - s * 0.5, hy - s * 0.3, s * 0.55).fill(c.blush);
  g.circle(hx + s * 0.5, hy - s * 0.3, s * 0.55).fill(c.blush);
  g.poly([hx - s * 1.02, hy - s * 0.15, hx + s * 1.02, hy - s * 0.15, hx, hy + s * 1.05]).fill(c.blush);
}

function repair(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline };
  g.roundRect(-R * 0.9, -R * 0.8, R * 1.8, R * 1.1, R * 0.12).fill(c.wall).stroke(stroke);
  for (let i = 0; i < 4; i++) g.rect(-R * 0.75 + i * R * 0.42, -R * 0.75, R * 0.18, R * 1.0).fill({ color: c.wallShade, alpha: 0.8 });
  // A pot of paint in front.
  g.roundRect(-R * 0.15, R * 0.05, R * 0.8, R * 0.75, R * 0.12).fill(c.rarityRare).stroke(stroke);
  g.ellipse(R * 0.25, R * 0.08, R * 0.4, R * 0.12).fill(c.eyeWhite).stroke({ width: outline * 0.6, color: c.outline });
}

function shelves(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline };
  for (const y of [-R * 0.15, R * 0.65]) {
    g.rect(-R * 0.95, y, R * 1.9, outline * 1.4).fill(c.counter).stroke(stroke);
    for (let i = 0; i < 3; i++) {
      const bw = R * (0.42 + (i % 2) * 0.1);
      const bh = R * (0.38 + ((i + (y > 0 ? 1 : 0)) % 2) * 0.14);
      const x = -R * 0.85 + i * R * 0.6;
      g.rect(x, y - bh, bw, bh).fill(c.counterTop).stroke(stroke);
      g.rect(x + bw * 0.42, y - bh, bw * 0.16, bh).fill({ color: c.counter, alpha: 0.8 });
    }
  }
}

function locker(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline };
  g.roundRect(-R * 0.65, -R * 0.85, R * 1.3, R * 1.7, outline * 1.6).fill(c.doorFrame).stroke(stroke);
  for (let r = 0; r < 4; r++)
    for (let col = 0; col < 2; col++) g.rect(-R * 0.52 + col * R * 0.54, -R * 0.72 + r * R * 0.38, R * 0.48, R * 0.32).fill(c.queueSpot).stroke({ width: outline * 0.5, color: c.outline });
}

/** The review chest of «Подарки» (07 «Словарь»: «Сундук за отзыв»): a wooden box, a round lid, gold bands and a lock. */
function chest(g: Graphics, R: number, c: Colors, outline: number): void {
  const stroke = { width: outline * 0.8, color: c.outline, join: 'round' as const };
  g.roundRect(-R * 0.9, -R * 0.1, R * 1.8, R * 0.95, R * 0.12).fill(c.counter).stroke(stroke);
  g.moveTo(-R * 0.9, -R * 0.1)
    .lineTo(-R * 0.9, -R * 0.35)
    .quadraticCurveTo(0, -R * 0.95, R * 0.9, -R * 0.35)
    .lineTo(R * 0.9, -R * 0.1)
    .closePath()
    .fill(c.floorLine)
    .stroke(stroke);
  for (const x of [-R * 0.55, R * 0.42]) g.rect(x, -R * 0.62, R * 0.13, R * 1.45).fill(c.rarityLegendary).stroke({ width: outline * 0.5, color: c.outline });
  g.roundRect(-R * 0.17, -R * 0.24, R * 0.34, R * 0.4, R * 0.06).fill(c.rarityLegendary).stroke(stroke);
  g.rect(-R * 0.04, -R * 0.12, R * 0.08, R * 0.16).fill(c.outline);
}

/** The picture of a thing to buy at 0,0 inside radius R, with its shadow; thing — the upgrade's decor (content/upgrades.json) or its id. */
export function drawUpgradeIcon(box: Container, thing: string, R: number, c: Colors, outline: number): void {
  const art = new Container();
  drawThing(art, thing, R, c, outline);
  // The soft shadow lies right under the thing, whatever its shape.
  const b = art.getLocalBounds();
  const shadow = new Graphics();
  shadow.ellipse((b.minX + b.maxX) / 2, b.maxY - outline * 0.4, Math.max(R * 0.4, (b.maxX - b.minX) * 0.45), R * 0.12).fill({ color: c.outline, alpha: 0.22 });
  box.addChild(shadow, art);
}

function drawThing(box: Container, thing: string, R: number, c: Colors, outline: number): void {
  const g = new Graphics();
  box.addChild(g);
  if (thing === 'incubator' || thing === 'incubator_speed') return incubator(box, R, c, outline, thing === 'incubator_speed');
  if (thing === 'showcase') return showcase(g, R, c, outline);
  if (thing === 'tags') return tags(g, R, c, outline);
  if (thing === 'chest') return chest(g, R, c, outline);
  if (thing === 'point_repair') return repair(g, R, c, outline);
  if (thing === 'point_furnish') return shelves(g, R, c, outline);
  if (thing === 'point_passive') return locker(g, R, c, outline);
  if (thing === 'bell') {
    drawBell(g, R * 0.72, c, outline);
    g.position.set(0, R * 0.12);
    return;
  }
  if (thing === 'sign') {
    const badge = new Graphics();
    drawSign(g, badge, R * 1.8, R * 0.95, 3, false, c, outline);
    g.position.set(0, -R * 0.55);
    badge.position.set(badge.position.x, badge.position.y - R * 0.55);
    box.addChild(badge);
    return;
  }
  // The second point is the point's sign with its «2».
  decorThing(g, thing === 'point_second' ? { point_rent: 1, point_second: 1 } : { [thing]: 1 }, R, c, outline);
}
