// What: the shop scene drawn with primitives (docs/01, section 6; feature M0-08): wall, floor, counter, incubator, showcase, door and queue.
// Called by: src/main.ts (create once, layout on every size change, update on every store commit).
// Keep: reads state only; colors from style.json; real art replaces the primitives from M1 without changing the layout math.

import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { StyleData } from '../content/schemas.ts';
import type { SaveData } from '../sim/state.ts';
import { computeShopLayout, type Rect, type ShopLayout } from './shop-layout.ts';

export interface ShopView {
  root: Container;
  layout(stage: Rect, hudHeight: number): void;
  update(state: SaveData): void;
  relabel(): void;
}

type Translate = (key: string) => string;

export function createShopView(app: Application, style: StyleData, t: Translate, invalidate: () => void): ShopView {
  const c = style.colors;
  const root = new Container();
  const back = new Graphics();
  const furniture = new Graphics();
  const live = new Graphics();
  const labels = new Container();
  root.addChild(back, furniture, live, labels);
  app.stage.addChild(root);

  let current: ShopLayout | null = null;
  let state: SaveData | null = null;

  const label = (key: string): Text =>
    new Text({ text: t(key), style: { fontFamily: 'Rubik, sans-serif', fontSize: 14, fontWeight: '700', fill: c.outline, align: 'center' } });
  const texts = { incubator: label('shop.incubator'), showcase: label('shop.showcase'), queue: label('shop.queue'), counter: label('shop.counter') };
  for (const tx of Object.values(texts)) {
    tx.anchor.set(0.5, 0);
    tx.alpha = 0.75;
    labels.addChild(tx);
  }

  function drawBack(l: ShopLayout): void {
    back.clear();
    back.rect(l.wall.x, l.wall.y, l.wall.w, l.wall.h).fill(c.wall);
    back.rect(l.wall.x, l.wall.y, l.wall.w, Math.min(l.wall.h, l.unit * 0.9)).fill(c.wallShade);
    back.rect(l.floor.x, l.floor.y, l.floor.w, l.floor.h).fill(c.floor);
    back.rect(l.floor.x, l.floor.y, l.floor.w, l.outline).fill(c.floorLine);
    const stripe = l.unit * 1.2;
    for (let x = l.floor.x + stripe; x < l.floor.x + l.floor.w; x += stripe) back.rect(x, l.floor.y + l.outline, l.outline / 2, l.floor.h).fill(c.floorLine);
  }

  function drawFurniture(l: ShopLayout): void {
    const g = furniture;
    g.clear();
    const stroke = { width: l.outline, color: c.outline };
    // Door and queue spots.
    g.roundRect(l.door.x, l.door.y, l.door.w, l.door.h, l.radius).fill(c.door).stroke(stroke);
    g.roundRect(l.door.x + l.door.w * 0.18, l.door.y + l.door.h * 0.12, l.door.w * 0.64, l.door.h * 0.3, l.radius * 0.5).fill(c.doorFrame);
    g.circle(l.door.x + l.door.w * 0.78, l.door.y + l.door.h * 0.55, l.outline * 1.1).fill(c.counterTop);
    for (const s of l.queue) g.ellipse(s.x, s.y, s.r, s.r * 0.55).fill({ color: c.queueSpot, alpha: 0.55 }).stroke({ width: l.outline * 0.6, color: c.outline, alpha: 0.5 });
    // Showcase shelf with slots.
    g.roundRect(l.showcase.x, l.showcase.y, l.showcase.w, l.showcase.h, l.radius).fill(c.showcase).stroke(stroke);
    for (const s of l.slots) g.roundRect(s.x, s.y, s.w, s.h, l.radius * 0.7).fill(c.showcaseSlot).stroke({ width: l.outline * 0.7, color: c.outline, alpha: 0.6 });
    // Counter with a lighter top board.
    g.roundRect(l.counter.x, l.counter.y, l.counter.w, l.counter.h, l.radius * 0.6).fill(c.counter).stroke(stroke);
    g.roundRect(l.counterTop.x, l.counterTop.y, l.counterTop.w, l.counterTop.h, l.radius * 0.5).fill(c.counterTop).stroke(stroke);
    // Incubator: base and glass dome.
    const i = l.incubator;
    g.roundRect(i.x - i.r * 1.1, i.y + i.r * 0.6, i.r * 2.2, i.r * 0.5, l.radius * 0.4).fill(c.incubator).stroke(stroke);
    g.circle(i.x, i.y, i.r).fill({ color: c.incubatorGlass, alpha: 0.9 }).stroke(stroke);
  }

  function drawLive(l: ShopLayout, s: SaveData | null): void {
    const g = live;
    g.clear();
    const stroke = { width: l.outline * 0.8, color: c.outline };
    const i = l.incubator;
    if (s?.incubators[0]?.egg) {
      g.ellipse(i.x, i.y + i.r * 0.1, i.r * 0.5, i.r * 0.65).fill(c.egg).stroke(stroke);
      g.circle(i.x - i.r * 0.15, i.y - i.r * 0.15, i.r * 0.12).fill(c.eggSpots);
      g.circle(i.x + i.r * 0.2, i.y + i.r * 0.2, i.r * 0.1).fill(c.eggSpots);
    }
    const creatures = s?.creatures.slice(0, l.slots.length) ?? [];
    creatures.forEach((_, n) => {
      const slot = l.slots[n];
      if (!slot) return;
      const cx = slot.x + slot.w / 2;
      const cy = slot.y + slot.h * 0.58;
      const r = slot.w * 0.32;
      g.circle(cx, cy, r).fill(c.incubator).stroke(stroke);
      g.circle(cx - r * 0.35, cy - r * 0.2, r * 0.14).fill(c.outline);
      g.circle(cx + r * 0.35, cy - r * 0.2, r * 0.14).fill(c.outline);
    });
  }

  function placeLabels(l: ShopLayout): void {
    const size = Math.max(11, Math.min(16, l.unit * 0.42));
    for (const tx of Object.values(texts)) tx.style.fontSize = size;
    texts.showcase.position.set(l.showcase.x + l.showcase.w / 2, l.showcase.y + l.showcase.h + l.outline);
    texts.queue.position.set(l.door.x + l.door.w / 2, l.door.y - size - l.outline * 2);
    texts.counter.position.set(l.counter.x + l.counter.w / 2, l.counter.y + l.counter.h + l.outline);
    texts.incubator.anchor.set(0, 0.5);
    texts.incubator.position.set(l.incubator.x + l.incubator.r + l.outline * 2, l.incubator.y - l.incubator.r * 0.35);
  }

  return {
    root,
    layout(stage, hudHeight) {
      current = computeShopLayout(stage, hudHeight, style.scene.floorShare, style.scene.outlineWidth, style.scene.cornerRadius);
      drawBack(current);
      drawFurniture(current);
      drawLive(current, state);
      placeLabels(current);
      invalidate();
    },
    update(next) {
      state = next;
      if (current) drawLive(current, state);
      invalidate();
    },
    relabel() {
      texts.incubator.text = t('shop.incubator');
      texts.showcase.text = t('shop.showcase');
      texts.queue.text = t('shop.queue');
      texts.counter.text = t('shop.counter');
      invalidate();
    },
  };
}
