// What: the pictures of the upgrades on the «Магазин» cards and the side job bowl (MU, the round of fixes, items 4 and 6): the things of the shop in the A style.
// Called by: src/scene/portraits.ts (drawn once into an image, like a pet).
// Keep: shapes only, colors from style.json; a bought thing is the scene's own decor (drawDecor) with a soft shadow; no round orange disc — that is the coin.

import { Container, Graphics } from 'pixi.js';
import type { StyleData } from '../content/schemas.ts';
import { drawEgg, drawRing } from './art.ts';
import { drawBell, drawDecor, drawFoodBowl, drawSign } from './decor.ts';
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

/** The signs of the finds (s4-finds: each find has its own picture, never the coin of its reward). */
function findSign(g: Graphics, thing: string, R: number, c: Colors, outline: number): boolean {
  const stroke = { width: outline * 0.8, color: c.outline, join: 'round' as const };
  const star = (x: number, y: number, r: number, color: string): void => {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      const d = i % 2 === 0 ? r : r * 0.45;
      pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.poly(pts).fill(color).stroke(stroke);
  };
  switch (thing) {
    case 'penny':
      // The first penny: one big coin standing on its edge a little, a shine — the find, not a price.
      g.ellipse(0, 0, R * 0.62, R * 0.7).fill(c.uiAccent).stroke(stroke);
      g.ellipse(0, 0, R * 0.42, R * 0.5).fill(c.counterTop).stroke({ width: outline * 0.5, color: c.outline });
      g.rect(-R * 0.06, -R * 0.28, R * 0.12, R * 0.56).fill(c.uiAccent);
      return true;
    case 'house':
      g.poly([-R * 0.85, -R * 0.1, 0, -R * 0.85, R * 0.85, -R * 0.1]).fill(c.rarityEpic).stroke(stroke);
      g.rect(-R * 0.65, -R * 0.1, R * 1.3, R * 0.85).fill(c.wall).stroke(stroke);
      g.roundRect(-R * 0.18, R * 0.25, R * 0.36, R * 0.5, R * 0.08).fill(c.door).stroke(stroke);
      g.rect(-R * 0.55, R * 0.05, R * 0.28, R * 0.24).fill(c.incubatorGlass).stroke({ width: outline * 0.5, color: c.outline });
      return true;
    case 'bag':
      g.poly([-R * 0.3, -R * 0.55, R * 0.3, -R * 0.55, R * 0.15, -R * 0.3, -R * 0.15, -R * 0.3]).fill(c.counter).stroke(stroke);
      g.ellipse(0, R * 0.2, R * 0.7, R * 0.6).fill(c.counterTop).stroke(stroke);
      g.rect(-R * 0.3, -R * 0.38, R * 0.6, R * 0.1).fill(c.blush).stroke({ width: outline * 0.5, color: c.outline });
      star(0, R * 0.22, R * 0.26, c.uiAccent);
      return true;
    case 'star':
      star(0, 0, R * 0.85, c.rarityLegendary);
      return true;
    case 'bubble':
      g.roundRect(-R * 0.85, -R * 0.7, R * 1.7, R * 1.1, R * 0.35).fill(c.eyeWhite).stroke(stroke);
      g.poly([-R * 0.3, R * 0.38, -R * 0.5, R * 0.8, R * 0.05, R * 0.4]).fill(c.eyeWhite).stroke(stroke);
      g.rect(-R * 0.3, R * 0.33, R * 0.5, R * 0.1).fill(c.eyeWhite);
      for (const x of [-0.4, 0, 0.4]) g.circle(x * R, -R * 0.15, R * 0.1).fill(c.outline);
      return true;
    case 'album':
      g.roundRect(-R * 0.75, -R * 0.8, R * 1.5, R * 1.6, R * 0.12).fill(c.rarityRare).stroke(stroke);
      g.rect(-R * 0.75, -R * 0.8, R * 0.22, R * 1.6).fill(c.outline);
      g.roundRect(-R * 0.3, -R * 0.45, R * 0.8, R * 0.62, R * 0.1).fill(c.eyeWhite).stroke({ width: outline * 0.5, color: c.outline });
      g.circle(R * 0.1, -R * 0.14, R * 0.17).fill(c.blush);
      return true;
    case 'city':
      for (const [x, w, h, color] of [
        [-0.85, 0.55, 1.1, c.wall],
        [-0.25, 0.55, 1.55, c.rarityEpic],
        [0.35, 0.5, 0.9, c.counterTop],
      ] as const) {
        g.rect(x * R, R * 0.75 - h * R, w * R, h * R).fill(color).stroke(stroke);
        for (let y = 0.75 - h + 0.2; y < 0.55; y += 0.32) g.rect((x + 0.14) * R, y * R, w * 0.36 * R, R * 0.14).fill(c.incubatorGlass);
      }
      return true;
    case 'plant':
      g.poly([-R * 0.45, R * 0.15, R * 0.45, R * 0.15, R * 0.32, R * 0.85, -R * 0.32, R * 0.85]).fill(c.blush).stroke(stroke);
      for (const [x, y] of [
        [-0.32, -0.3],
        [0.32, -0.3],
        [0, -0.55],
      ] as const)
        g.ellipse(x * R, y * R, R * 0.2, R * 0.42).fill(c.uiGood).stroke({ width: outline * 0.6, color: c.outline });
      return true;
    case 'door':
      g.roundRect(-R * 0.5, -R * 0.85, R * 1.0, R * 1.7, R * 0.12).fill(c.door).stroke(stroke);
      g.roundRect(-R * 0.35, -R * 0.68, R * 0.7, R * 0.5, R * 0.08).fill(c.doorFrame);
      g.circle(R * 0.28, R * 0.12, R * 0.08).fill(c.counterTop).stroke({ width: outline * 0.5, color: c.outline });
      return true;
    case 'lamp':
      g.moveTo(0, -R * 0.95).lineTo(0, -R * 0.45).stroke({ width: outline * 0.7, color: c.outline });
      g.circle(0, R * 0.2, R * 0.8).fill({ color: c.counterTop, alpha: 0.35 });
      g.circle(0, R * 0.18, R * 0.3).fill(c.counterTop).stroke(stroke);
      g.moveTo(-R * 0.65, R * 0.05).quadraticCurveTo(-R * 0.5, -R * 0.55, 0, -R * 0.55).quadraticCurveTo(R * 0.5, -R * 0.55, R * 0.65, R * 0.05).closePath().fill(c.rarityEpic).stroke(stroke);
      return true;
    case 'gem_vip':
    case 'gem_exclusive': {
      const color = thing === 'gem_vip' ? c.rarityLegendary : c.uiBad;
      g.poly([-R * 0.75, -R * 0.2, -R * 0.4, -R * 0.65, R * 0.4, -R * 0.65, R * 0.75, -R * 0.2, 0, R * 0.8]).fill(color).stroke(stroke);
      g.poly([-R * 0.4, -R * 0.65, 0, -R * 0.2, R * 0.4, -R * 0.65]).fill({ color: c.eyeWhite, alpha: 0.45 });
      return true;
    }
    case 'crown':
      g.poly([-R * 0.8, R * 0.45, -R * 0.8, -R * 0.45, -R * 0.4, -R * 0.05, 0, -R * 0.7, R * 0.4, -R * 0.05, R * 0.8, -R * 0.45, R * 0.8, R * 0.45]).fill(c.rarityLegendary).stroke(stroke);
      for (const x of [-0.45, 0, 0.45]) g.circle(x * R, R * 0.2, R * 0.1).fill(c.uiBad);
      return true;
    case 'cart':
      g.poly([-R * 0.85, -R * 0.55, -R * 0.6, -R * 0.55, -R * 0.4, R * 0.25, R * 0.65, R * 0.25, R * 0.8, -R * 0.35, -R * 0.52, -R * 0.35]).fill(c.uiPanelHi).stroke(stroke);
      for (const x of [-0.25, 0.5]) g.circle(x * R, R * 0.55, R * 0.16).fill(c.outline);
      g.rect(-R * 0.3, -R * 0.75, R * 0.45, R * 0.4).fill(c.counterTop).stroke({ width: outline * 0.5, color: c.outline });
      return true;
    default:
      return false;
  }
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
  if (thing === 'workBowl') return drawFoodBowl(g, 0, R * 0.05, R * 0.95, c, outline * 0.8);
  if (thing === 'egg') {
    drawEgg(g, R * 1.15, c, outline, 0);
    return;
  }
  if (findSign(g, thing, R, c, outline)) return;
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
