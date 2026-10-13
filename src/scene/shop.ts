// What: the shop scene (docs/01, section 6): wall, floor, counter, incubators with eggs, showcase, door and queue; taps go to the sim.
// Called by: src/main.ts (create once, layout on every size change, frame on every ticker tick, onEvent for game events).
// Keep: reads the game view only, never writes state (taps call the handlers); colors from style.json, feel from feel.json.

import { Circle, Container, Graphics, Text, type Application } from 'pixi.js';
import type { FeelData, StyleData } from '../content/schemas.ts';
import type { GameEvent, GameView } from '../sim/game.ts';
import { drawCreature, drawEgg, drawRing, rarityColor } from './art.ts';
import { createFx } from './fx.ts';
import { computeShopLayout, type Rect, type ShopLayout, type Spot } from './shop-layout.ts';

export interface ShopHandlers {
  tapIncubator(index: number): void;
}

export interface ShopAnchors {
  incubators: Spot[];
  slots: Rect[];
  queue: Spot[];
  counter: Rect;
}

export interface ShopView {
  root: Container;
  layout(stage: Rect, hudHeight: number): void;
  /** One ticker tick: animations, then a render request only when something moved. */
  frame(dt: number, view: GameView): void;
  onEvent(e: GameEvent): void;
  relabel(): void;
  /** Stage coordinates of the tappable pieces (hints, test API); null before the first layout. */
  anchors(): ShopAnchors | null;
}

type Translate = (key: string) => string;

interface CreatureNode {
  box: Container;
  art: Graphics;
  key: string;
  /** Arrival from the incubator, 0..1 (1 = sitting in its slot). */
  arrive: number;
  from: { x: number; y: number } | null;
  landed: boolean;
}

interface IncubatorNode {
  hit: Container;
  box: Container;
  egg: Graphics;
  key: string;
  squash: number;
}

export function createShopView(app: Application, style: StyleData, feel: FeelData, t: Translate, invalidate: () => void, handlers: ShopHandlers): ShopView {
  const c = style.colors;
  const root = new Container();
  const back = new Graphics();
  const furniture = new Graphics();
  const rings = new Graphics();
  const creaturesLayer = new Container();
  const eggsLayer = new Container();
  const hits = new Container();
  const labels = new Container();
  const fx = createFx(c.outline);
  root.addChild(back, furniture, rings, eggsLayer, creaturesLayer, labels, fx.layer, hits);
  app.stage.addChild(root);

  let stageRect: Rect | null = null;
  let hud = 0;
  let current: ShopLayout | null = null;
  let incubatorCount = 1;
  let time = 0;
  let incs: IncubatorNode[] = [];
  const creatures = new Map<string, CreatureNode>();
  const spawnFrom = new Map<string, { x: number; y: number }>();

  const label = (key: string): Text =>
    new Text({ text: t(key), style: { fontFamily: 'Rubik, sans-serif', fontSize: 14, fontWeight: '700', fill: c.outline, align: 'center' } });
  const texts = { showcase: label('shop.showcase'), queue: label('shop.queue') };
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
    // Incubators: base and glass dome.
    for (const i of l.incubators) {
      g.roundRect(i.x - i.r * 1.1, i.y + i.r * 0.6, i.r * 2.2, i.r * 0.5, l.radius * 0.4).fill(c.incubator).stroke(stroke);
      g.circle(i.x, i.y, i.r).fill({ color: c.incubatorGlass, alpha: 0.9 }).stroke(stroke);
    }
  }

  function buildIncubators(l: ShopLayout): void {
    for (const n of incs) {
      n.hit.destroy({ children: true });
      n.box.destroy({ children: true });
    }
    incs = l.incubators.map((spot, index) => {
      const hit = new Container();
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.hitArea = new Circle(0, 0, spot.r * 1.25);
      hit.position.set(spot.x, spot.y);
      hit.on('pointerdown', () => handlers.tapIncubator(index));
      hits.addChild(hit);
      const box = new Container();
      const egg = new Graphics();
      box.addChild(egg);
      box.position.set(spot.x, spot.y + spot.r * 0.12);
      eggsLayer.addChild(box);
      return { hit, box, egg, key: '', squash: 0 };
    });
  }

  function placeLabels(l: ShopLayout): void {
    const size = Math.max(11, Math.min(16, l.unit * 0.42));
    for (const tx of Object.values(texts)) tx.style.fontSize = size;
    texts.showcase.position.set(l.showcase.x + l.showcase.w / 2, l.showcase.y + l.showcase.h + l.outline);
    texts.queue.position.set(l.door.x + l.door.w / 2, l.door.y - size - l.outline * 2);
  }

  const slotCenter = (slot: Rect) => ({ x: slot.x + slot.w / 2, y: slot.y + slot.h * 0.56, r: slot.w * 0.36 });
  const easeOutBack = (k: number): number => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

  function animateCreatures(dt: number, view: GameView, l: ShopLayout): boolean {
    let moving = false;
    const list = view.creatures.slice(0, l.slots.length);
    const alive = new Set(list.map((x) => x.uid));
    for (const [uid, node] of creatures) {
      if (alive.has(uid)) continue;
      node.box.destroy({ children: true });
      creatures.delete(uid);
    }
    list.forEach((cv, n) => {
      const slot = l.slots[n];
      if (!slot) return;
      const at = slotCenter(slot);
      let node = creatures.get(cv.uid);
      if (!node) {
        const box = new Container();
        const art = new Graphics();
        box.addChild(art);
        creaturesLayer.addChild(box);
        const from = spawnFrom.get(cv.uid) ?? null;
        spawnFrom.delete(cv.uid);
        node = { box, art, key: '', arrive: from ? 0 : 1, from, landed: !from };
        creatures.set(cv.uid, node);
      }
      const key = `${cv.species}:${at.r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        drawCreature(node.art, cv.species, cv.rarity, at.r, c, l.outline * 0.8);
      }
      if (node.arrive < 1 && node.from) {
        moving = true;
        node.arrive = Math.min(1, node.arrive + (feel.hatchFlySec > 0 ? dt / feel.hatchFlySec : 1));
        const k = node.arrive;
        const e = 1 - Math.pow(1 - k, 3);
        const lift = Math.sin(k * Math.PI) * l.unit * 1.6;
        node.box.position.set(node.from.x + (at.x - node.from.x) * e, node.from.y + (at.y - node.from.y) * e - lift);
        node.box.scale.set(0.3 + 0.7 * easeOutBack(k));
      } else {
        node.box.position.set(at.x, at.y);
        node.box.scale.set(1);
        if (!node.landed) {
          node.landed = true;
          fx.burst(at.x, at.y, Math.round(feel.hatchBurst), [rarityColor(c, cv.rarity), c.uiAccent, c.showcaseSlot], at.r * 5, l.outline * 1.3);
          fx.float(at.x, at.y - at.r * 1.4, t(`rarity.${cv.rarity}`), rarityColor(c, cv.rarity), Math.max(14, at.r * 0.7), l.unit * 0.9);
          moving = true;
        }
      }
    });
    return moving;
  }

  function relayout(): void {
    if (!stageRect) return;
    current = computeShopLayout(stageRect, hud, style.scene.floorShare, style.scene.outlineWidth, style.scene.cornerRadius, incubatorCount);
    drawBack(current);
    drawFurniture(current);
    buildIncubators(current);
    for (const node of creatures.values()) node.key = '';
    placeLabels(current);
    fx.clear();
    invalidate();
  }

  function animateIncubators(dt: number, view: GameView, l: ShopLayout): boolean {
    let moving = false;
    rings.clear();
    view.incubators.forEach((iv, i) => {
      const node = incs[i];
      const spot = l.incubators[i];
      if (!node || !spot) return;
      node.box.visible = Boolean(iv.egg);
      if (!iv.egg) return;
      moving = true;
      const stage = iv.share > 0.75 ? 2 : iv.share > 0.45 ? 1 : 0;
      const key = `${iv.egg}:${stage}:${spot.r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        drawEgg(node.egg, spot.r, c, l.outline * 0.8, iv.share);
      }
      node.squash = Math.max(0, node.squash - dt);
      const k = feel.bounceSec > 0 ? node.squash / feel.bounceSec : 0;
      const sq = feel.eggTapSquash * Math.sin(k * Math.PI) * (k > 0 ? 1 : 0);
      if (iv.waiting) {
        // The starter egg invites a tap: a soft hop and pulse.
        const hop = Math.abs(Math.sin(time * 3.2));
        node.box.rotation = Math.sin(time * 6.4) * 0.06;
        node.box.y = spot.y + spot.r * 0.12 - hop * spot.r * 0.12;
        node.box.scale.set(1 + feel.waitPulse * hop + sq, 1 + feel.waitPulse * hop - sq);
      } else {
        const wobble = ((feel.eggWobbleDeg * Math.PI) / 180) * (0.3 + iv.share);
        node.box.rotation = Math.sin(time * (8 + 14 * iv.share)) * wobble;
        node.box.y = spot.y + spot.r * 0.12;
        node.box.scale.set(1 + sq, 1 - sq);
        drawRing(rings, spot.x, spot.y, spot.r + l.outline * 1.6, iv.share, c, Math.max(3, l.outline));
      }
    });
    return moving;
  }

  return {
    root,
    layout(stage, hudHeight) {
      stageRect = stage;
      hud = hudHeight;
      relayout();
    },
    frame(dt, view) {
      time += dt;
      if (view.incubators.length !== incubatorCount) {
        incubatorCount = Math.max(1, view.incubators.length);
        relayout();
      }
      if (!current) return;
      const moving = animateIncubators(dt, view, current);
      const flying = animateCreatures(dt, view, current);
      const alive = fx.update(dt);
      if (moving || flying || alive) invalidate();
    },
    onEvent(e) {
      if (!current) return;
      if (e.type === 'eggTap') {
        const node = incs[e.incubator];
        const spot = current.incubators[e.incubator];
        if (!node || !spot) return;
        node.squash = feel.bounceSec;
        fx.burst(spot.x, spot.y - spot.r * 0.2, 5, [c.eggSpots, c.uiAccent, c.incubatorGlass], spot.r * 3, current.outline * 1.2);
      } else if (e.type === 'hatched') {
        const spot = current.incubators[e.incubator];
        if (spot) {
          spawnFrom.set(e.uid, { x: spot.x, y: spot.y });
          fx.burst(spot.x, spot.y, Math.round(feel.hatchBurst * 0.75), [c.egg, c.eggSpots, rarityColor(c, e.rarity)], spot.r * 4, current.outline * 1.4);
        }
      } else if (e.type === 'eggBought') {
        const spot = current.incubators[e.incubator];
        if (spot) fx.burst(spot.x, spot.y, 8, [c.incubator, c.incubatorGlass, c.uiAccent], spot.r * 3.5, current.outline * 1.2);
      }
      invalidate();
    },
    relabel() {
      texts.showcase.text = t('shop.showcase');
      texts.queue.text = t('shop.queue');
      invalidate();
    },
    anchors() {
      if (!current) return null;
      return { incubators: current.incubators, slots: current.slots, queue: current.queue, counter: current.counter };
    },
  };
}
