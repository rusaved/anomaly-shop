// What: the shop scene (docs/01, section 6): wall, floor, counter, incubators with eggs, showcase, door and queue; taps go to the sim.
// Called by: src/main.ts (create once, layout on every size change, frame on every ticker tick, onEvent for game events).
// Keep: reads the game view only, never writes state (taps call the handlers); colors from style.json, feel from feel.json.

import { Circle, Container, Graphics, Rectangle, Text, type Application } from 'pixi.js';
import type { FeelData, StyleData } from '../content/schemas.ts';
import type { GameEvent, GameView } from '../sim/game.ts';
import { drawCreature, drawCustomer, drawEgg, drawRing, rarityColor } from './art.ts';
import { createFx } from './fx.ts';
import { computeShopLayout, type Rect, type ShopLayout, type Spot } from './shop-layout.ts';

export interface ShopHandlers {
  tapIncubator(index: number): void;
  tapCreature(uid: string): void;
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
  /** Stage point above a customer (coin flights start there). */
  customerPoint(id: number): { x: number; y: number } | null;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const FALLBACK_LOOK = { shape: 'kettle', body: '#cccccc', accent: '#ffffff' } as const;

interface CreatureNode {
  box: Container;
  art: Graphics;
  tag: Graphics;
  price: Text;
  level: Text;
  bar: Graphics;
  key: string;
  shown: string;
  /** Seconds left of the feeding hop. */
  hop: number;
  /** Arrival from the incubator, 0..1 (1 = sitting in its slot). */
  arrive: number;
  from: { x: number; y: number } | null;
  landed: boolean;
}

interface CustomerNode {
  box: Container;
  art: Graphics;
  key: string;
  leaving: boolean;
  mood: 'sold' | 'haggle' | 'wait' | null;
  hop: number;
}

interface IncubatorNode {
  hit: Container;
  box: Container;
  egg: Graphics;
  key: string;
  squash: number;
}

export interface ShopDeps {
  style: StyleData;
  feel: FeelData;
  t: Translate;
  /** The creature's line in the current language. */
  line(species: string): string;
  invalidate(): void;
  handlers: ShopHandlers;
}

export function createShopView(app: Application, deps: ShopDeps): ShopView {
  const { style, feel, t, invalidate, handlers } = deps;
  const c = style.colors;
  const root = new Container();
  const back = new Graphics();
  const furniture = new Graphics();
  const rings = new Graphics();
  const creaturesLayer = new Container();
  const selection = new Graphics();
  const customersLayer = new Container();
  customersLayer.sortableChildren = true;
  const eggsLayer = new Container();
  const hits = new Container();
  const labels = new Container();
  const fx = createFx(c.outline);
  root.addChild(back, furniture, selection, rings, eggsLayer, customersLayer, creaturesLayer, labels, fx.layer, hits);
  app.stage.addChild(root);

  let stageRect: Rect | null = null;
  let hud = 0;
  let current: ShopLayout | null = null;
  let incubatorCount = 1;
  let time = 0;
  let incs: IncubatorNode[] = [];
  let slotHits: Container[] = [];
  const visitors = new Map<number, CustomerNode>();
  let slotUids: Array<string | null> = [];
  let selectedKey = '';
  const creatures = new Map<string, CreatureNode>();
  /** Sold creatures flying to their buyer: start, target, progress. */
  const departing: Array<{ node: CreatureNode; from: { x: number; y: number }; to: { x: number; y: number }; t: number }> = [];
  const soldTo = new Map<string, { x: number; y: number }>();
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

  function buildSlots(l: ShopLayout): void {
    for (const h of slotHits) h.destroy();
    slotHits = l.slots.map((slot, index) => {
      const hit = new Container();
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.hitArea = new Rectangle(slot.x, slot.y - slot.h * 0.1, slot.w, slot.h * 1.2);
      hit.on('pointerdown', () => {
        const uid = slotUids[index];
        if (uid) handlers.tapCreature(uid);
      });
      hits.addChild(hit);
      return hit;
    });
  }

  function drawSelection(view: GameView, l: ShopLayout): void {
    const index = view.creatures.slice(0, l.slots.length).findIndex((x) => x.uid === view.selected);
    const key = `${index}:${view.creatures.length}`;
    if (key === selectedKey) return;
    selectedKey = key;
    selection.clear();
    const slot = l.slots[index];
    if (!slot || view.creatures.length < 2) return;
    const pad = l.outline * 1.2;
    selection.roundRect(slot.x - pad, slot.y - pad, slot.w + pad * 2, slot.h + pad * 2, l.radius * 0.9).stroke({ width: l.outline * 1.2, color: c.uiAccent });
  }

  function placeLabels(l: ShopLayout): void {
    const size = Math.max(11, Math.min(16, l.unit * 0.42));
    for (const tx of Object.values(texts)) tx.style.fontSize = size;
    texts.showcase.position.set(l.showcase.x + l.showcase.w / 2, l.showcase.y + l.showcase.h + l.outline);
    // The label gives way to the incubators when the wall is short (landscape phones).
    const domeTop = Math.min(...l.incubators.map((i) => i.y - i.r - l.outline));
    texts.showcase.visible = texts.showcase.y + size * 1.2 < domeTop;
    texts.queue.position.set(l.door.x + l.door.w / 2, l.door.y - size - l.outline * 2);
  }

  const slotCenter = (slot: Rect) => ({ x: slot.x + slot.w / 2, y: slot.y + slot.h * 0.56, r: slot.w * 0.36 });
  const easeOutBack = (k: number): number => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

  const fmt = (n: number): string => n.toLocaleString(document.documentElement.lang || 'ru');

  /** Price pill under the portrait and a level badge at its top right (local to the creature box). */
  function drawTags(node: CreatureNode, cv: GameView['creatures'][number], r: number, l: ShopLayout): void {
    const size = Math.max(11, r * 0.42);
    node.price.text = fmt(cv.price);
    node.price.style.fontSize = size;
    const coinR = size * 0.42;
    const pillW = node.price.width + coinR * 2 + size * 0.9;
    const pillH = size * 1.35;
    const py = r * 1.12;
    node.tag.clear();
    node.tag.roundRect(-pillW / 2, py - pillH / 2, pillW, pillH, pillH / 2).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
    node.tag.circle(-pillW / 2 + size * 0.4 + coinR, py, coinR).fill(c.uiAccent).stroke({ width: Math.max(1, l.outline * 0.4), color: c.outline });
    node.price.position.set(coinR + size * 0.2, py);
    const max = cv.level >= cv.maxLevel;
    node.level.text = max ? 'MAX' : String(cv.level);
    node.level.style.fontSize = size * (max ? 0.62 : 0.85);
    const br = size * 0.72;
    node.tag.circle(r * 0.92, -r * 0.88, br).fill(max ? c.rarityLegendary : c.uiPanel).stroke({ width: l.outline * 0.6, color: c.outline });
    node.level.style.fill = max ? c.outline : c.uiText;
    node.level.position.set(r * 0.92, -r * 0.88);
    // Satiety bar flows into the level badge (genre standard XP bar).
    node.bar.clear();
    if (!max) {
      const bx = -r * 0.95;
      const bw = r * 1.75;
      const bh = Math.max(6, r * 0.24);
      const by = -r * 0.88 - bh / 2;
      node.bar.roundRect(bx, by, bw, bh, bh / 2).fill(c.uiPanel).stroke({ width: l.outline * 0.5, color: c.outline });
      const share = cv.need > 0 ? Math.min(1, cv.fed / cv.need) : 0;
      if (share > 0) node.bar.roundRect(bx + 1, by + 1, Math.max(bh - 2, (bw - 2) * share), bh - 2, (bh - 2) / 2).fill(c.uiGood);
    }
  }

  // One speech bubble at a time: the creature's line on arrival (and at the sale, M1-06).
  const bubble = new Container();
  const bubbleBg = new Graphics();
  const bubbleText = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: c.outline, align: 'center', wordWrap: true } });
  bubbleText.anchor.set(0.5);
  bubble.addChild(bubbleBg, bubbleText);
  bubble.visible = false;
  root.addChild(bubble);
  let bubbleLife = 0;

  function say(species: string, at: { x: number; y: number; r: number }, l: ShopLayout): void {
    const text = deps.line(species);
    if (!text) return;
    const size = Math.max(13, Math.min(17, l.unit * 0.42));
    bubbleText.style.fontSize = size;
    bubbleText.style.wordWrapWidth = Math.min(l.stage.w * 0.6, l.unit * 6);
    bubbleText.text = text;
    const w = bubbleText.width + size * 1.4;
    const h = bubbleText.height + size * 0.9;
    const x = Math.max(l.stage.x + w / 2 + 4, Math.min(l.stage.x + l.stage.w - w / 2 - 4, at.x));
    const below = at.y - at.r * 1.3 - h < l.stage.y + Math.min(l.stage.h * 0.3, hud);
    const y = below ? at.y + at.r * 1.9 + h / 2 : at.y - at.r * 1.3 - h / 2;
    bubbleBg.clear();
    const tipX = Math.max(-w / 2 + size, Math.min(w / 2 - size, at.x - x));
    if (below) bubbleBg.poly([tipX - size * 0.4, -h / 2 + 1, tipX + size * 0.4, -h / 2 + 1, tipX, -h / 2 - size * 0.6]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline, join: 'round' });
    else bubbleBg.poly([tipX - size * 0.4, h / 2 - 1, tipX + size * 0.4, h / 2 - 1, tipX, h / 2 + size * 0.6]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline, join: 'round' });
    bubbleBg.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, size)).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
    if (below) bubbleBg.rect(tipX - size * 0.4 + 1, -h / 2 - 1, size * 0.8 - 2, l.outline * 0.8 + 2).fill(c.eyeWhite);
    else bubbleBg.rect(tipX - size * 0.4 + 1, h / 2 - l.outline * 0.8 - 1, size * 0.8 - 2, l.outline * 0.8 + 2).fill(c.eyeWhite);
    bubble.position.set(x, y);
    bubble.visible = true;
    bubble.alpha = 0;
    bubbleLife = feel.lineSec;
  }

  function animateBubble(dt: number): boolean {
    if (!bubble.visible) return false;
    bubbleLife -= dt;
    if (bubbleLife <= 0) {
      bubble.visible = false;
      return true;
    }
    const k = bubbleLife / feel.lineSec;
    bubble.alpha = k > 0.9 ? (1 - k) / 0.1 : k < 0.15 ? k / 0.15 : 1;
    bubble.scale.set(k > 0.9 ? 0.85 + 0.15 * ((1 - k) / 0.1) : 1);
    return true;
  }

  // Offer bubble over the front customer: coin and the price for the selected creature.
  const offerBox = new Container();
  const offerBg = new Graphics();
  const offerText = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: c.outline } });
  offerText.anchor.set(0, 0.5);
  offerBox.addChild(offerBg, offerText);
  offerBox.visible = false;
  root.addChild(offerBox);
  let offerKey = '';
  let offerPulse = 0;

  function drawOffer(text: string, l: ShopLayout): void {
    const size = Math.max(13, Math.min(18, l.unit * 0.46));
    offerText.style.fontSize = size;
    offerText.text = text;
    const coinR = size * 0.45;
    const w = offerText.width + coinR * 2 + size * 1.1;
    const h = size * 1.6;
    offerBg.clear();
    offerBg.poly([-size * 0.35, h / 2 - 1, size * 0.35, h / 2 - 1, 0, h / 2 + size * 0.5]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline, join: 'round' });
    offerBg.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
    offerBg.rect(-size * 0.35 + 1, h / 2 - l.outline, size * 0.7 - 2, l.outline + 1).fill(c.eyeWhite);
    const hasCoin = /\d/.test(text);
    if (hasCoin) offerBg.circle(-w / 2 + size * 0.45 + coinR, 0, coinR).fill(c.uiAccent).stroke({ width: Math.max(1, l.outline * 0.4), color: c.outline });
    offerText.position.set(hasCoin ? -w / 2 + size * 0.7 + coinR * 2 : -offerText.width / 2, 0);
  }

  function animateCustomers(dt: number, view: GameView, l: ShopLayout): boolean {
    let moving = false;
    const first = l.queue[0];
    if (!first) return false;
    const r = first.r * 1.45;
    const doorAt = { x: l.door.x + l.door.w / 2, y: l.door.y + l.door.h * 0.9 };
    const present = new Set(view.queue.map((q) => q.id));
    view.queue.forEach((q, i) => {
      let node = visitors.get(q.id);
      if (!node) {
        const box = new Container();
        const art = new Graphics();
        box.addChild(art);
        box.position.set(doorAt.x, doorAt.y);
        box.alpha = 0;
        customersLayer.addChild(box);
        node = { box, art, key: '', leaving: false, mood: null, hop: 0 };
        visitors.set(q.id, node);
      }
      const key = `${q.customer}:${r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        drawCustomer(node.art, q.customer, style.customers[q.customer] ?? { body: c.queueSpot, accent: c.outline }, r, c, l.outline * 0.8);
      }
      const spot = l.queue[Math.min(i, l.queue.length - 1)]!;
      if (step(node, spot.x, spot.y, dt, r)) moving = true;
      if (node.box.alpha < 1) {
        node.box.alpha = Math.min(1, node.box.alpha + dt * 4);
        moving = true;
      }
    });
    for (const [id, node] of visitors) {
      if (present.has(id)) continue;
      if (!node.leaving) {
        node.leaving = true;
        if (node.mood === 'sold') node.hop = 0.35;
      }
      moving = true;
      if (node.hop > 0) {
        node.hop = Math.max(0, node.hop - dt);
        node.box.y -= Math.sin((node.hop / 0.35) * Math.PI) * r * 0.05;
        continue;
      }
      step(node, doorAt.x, doorAt.y, dt, r);
      node.box.alpha -= dt * 2.2;
      if (node.box.alpha <= 0) {
        node.box.destroy({ children: true });
        visitors.delete(id);
      }
    }
    // Front customer's offer bubble.
    const front = view.queue[0] ? visitors.get(view.queue[0].id) : undefined;
    const deal = view.deal;
    const text = deal ? (deal.uid ? fmt(deal.offer) : '…') : '';
    if (front && text) {
      if (text !== offerKey) {
        offerKey = text;
        drawOffer(text, l);
      }
      offerPulse = Math.max(0, offerPulse - dt);
      const k = offerPulse > 0 ? Math.sin((offerPulse / 0.3) * Math.PI) * 0.25 : 0;
      offerBox.scale.set(1 + k);
      offerBox.position.set(front.box.x, front.box.y - r * 2.6);
      offerBox.alpha = front.box.alpha;
      if (!offerBox.visible || offerPulse > 0) moving = true;
      offerBox.visible = true;
    } else if (offerBox.visible) {
      offerBox.visible = false;
      offerKey = '';
      moving = true;
    }
    return moving;
  }

  /** Walks a customer toward a point; true while still walking. */
  function step(node: CustomerNode, tx: number, ty: number, dt: number, r: number): boolean {
    const dx = tx - node.box.x;
    const dy = ty - node.box.y;
    const dist = Math.hypot(dx, dy);
    node.box.zIndex = node.box.y;
    if (dist < 0.5) {
      node.box.position.set(tx, ty);
      node.art.y = 0;
      return false;
    }
    const k = Math.min(1, dt * 6);
    node.box.position.set(node.box.x + dx * k, node.box.y + dy * k);
    node.art.y = -Math.abs(Math.sin(time * 14)) * r * 0.12;
    return true;
  }

  function animateCreatures(dt: number, view: GameView, l: ShopLayout): boolean {
    let moving = false;
    const list = view.creatures.slice(0, l.slots.length);
    slotUids = l.slots.map((_, i) => list[i]?.uid ?? null);
    const alive = new Set(list.map((x) => x.uid));
    for (const [uid, node] of creatures) {
      if (alive.has(uid)) continue;
      creatures.delete(uid);
      moving = true;
      const to = soldTo.get(uid);
      soldTo.delete(uid);
      if (to) departing.push({ node, from: { x: node.box.x, y: node.box.y }, to, t: 0 });
      else node.box.destroy({ children: true });
    }
    for (let i = departing.length - 1; i >= 0; i--) {
      const d = departing[i]!;
      d.t = Math.min(1, d.t + dt / Math.max(0.05, feel.hatchFlySec));
      const e = d.t * d.t * (3 - 2 * d.t);
      d.node.box.position.set(d.from.x + (d.to.x - d.from.x) * e, d.from.y + (d.to.y - d.from.y) * e - Math.sin(d.t * Math.PI) * l.unit * 1.2);
      d.node.box.scale.set(1 - 0.55 * e);
      d.node.box.alpha = d.t > 0.8 ? (1 - d.t) / 0.2 : 1;
      moving = true;
      if (d.t >= 1) {
        fx.burst(d.to.x, d.to.y, 10, [c.blush, c.uiAccent, c.eyeWhite], l.unit * 2.5, l.outline * 1.2);
        d.node.box.destroy({ children: true });
        departing.splice(i, 1);
      }
    }
    list.forEach((cv, n) => {
      const slot = l.slots[n];
      if (!slot) return;
      const at = slotCenter(slot);
      let node = creatures.get(cv.uid);
      if (!node) {
        const box = new Container();
        const art = new Graphics();
        const tag = new Graphics();
        const bar = new Graphics();
        const price = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: c.outline, align: 'center' } });
        const level = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: c.uiText, align: 'center' } });
        price.anchor.set(0.5);
        level.anchor.set(0.5);
        box.addChild(art, bar, tag, price, level);
        creaturesLayer.addChild(box);
        const from = spawnFrom.get(cv.uid) ?? null;
        spawnFrom.delete(cv.uid);
        node = { box, art, tag, bar, price, level, key: '', shown: '', hop: 0, arrive: from ? 0 : 1, from, landed: !from };
        creatures.set(cv.uid, node);
        moving = true;
      }
      const key = `${cv.species}:${at.r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        node.shown = '';
        drawCreature(node.art, style.creatures[cv.species] ?? FALLBACK_LOOK, cv.rarity, at.r, c, l.outline * 0.8);
      }
      const shown = `${cv.price}:${cv.level}:${cv.maxLevel}:${cv.fed}:${cv.need}`;
      if (node.shown !== shown) {
        node.shown = shown;
        drawTags(node, cv, at.r, l);
        moving = true;
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
        node.hop = Math.max(0, node.hop - dt);
        const k = feel.bounceSec > 0 ? node.hop / feel.bounceSec : 0;
        const jump = Math.sin(k * Math.PI);
        node.box.position.set(at.x, at.y - jump * at.r * feel.feedJump);
        node.box.scale.set(1 - feel.feedSquash * jump * 0.5, 1 + feel.feedSquash * jump);
        if (node.hop > 0) moving = true;
        if (!node.landed) {
          node.landed = true;
          say(cv.species, at, l);
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
    buildSlots(current);
    selectedKey = '';
    for (const node of creatures.values()) node.key = '';
    for (const d of departing) d.node.box.destroy({ children: true });
    departing.length = 0;
    placeLabels(current);
    fx.clear();
    bubble.visible = false;
    offerKey = '';
    for (const node of visitors.values()) node.key = '';
    invalidate();
  }

  function animateIncubators(dt: number, view: GameView, l: ShopLayout): boolean {
    let moving = false;
    rings.clear();
    view.incubators.forEach((iv, i) => {
      const node = incs[i];
      const spot = l.incubators[i];
      if (!node || !spot) return;
      if (node.box.visible !== Boolean(iv.egg)) {
        node.box.visible = Boolean(iv.egg);
        moving = true;
      }
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
      const before = selectedKey;
      drawSelection(view, current);
      const talking = animateBubble(dt);
      const walking = animateCustomers(dt, view, current);
      const alive = fx.update(dt);
      if (moving || flying || alive || talking || walking || before !== selectedKey) invalidate();
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
      } else if (e.type === 'fed') {
        const node = creatures.get(e.uid);
        const index = slotUids.indexOf(e.uid);
        const slot = current.slots[index];
        if (!node || !slot) return;
        const at = slotCenter(slot);
        node.hop = feel.bounceSec;
        const size = Math.max(14, at.r * 0.6);
        if (e.levelUp) {
          fx.burst(at.x, at.y, Math.round(feel.levelUpBurst), [c.uiGood, c.uiAccent, c.eyeWhite], at.r * 5, current.outline * 1.3);
          fx.float(at.x, at.y - at.r * 1.2, t('fx.levelUp', { n: e.level }), c.uiGood, size * 1.25, current.unit * 1.2);
        } else if (e.maxed) {
          fx.float(at.x, at.y - at.r * 1.1, t('fx.max'), c.rarityLegendary, size, current.unit * 0.8);
        } else {
          fx.float(at.x + at.r * 0.5, at.y - at.r * 0.9, '+1', c.uiGood, size, current.unit * 0.8);
          fx.burst(at.x, at.y + at.r * 0.4, 3, [c.blush, c.uiGood], at.r * 2.5, current.outline);
        }
      } else if (e.type === 'sold') {
        const buyer = visitors.get(e.customerId);
        const index = slotUids.indexOf(e.uid);
        const slot = current.slots[index];
        if (buyer) {
          soldTo.set(e.uid, { x: buyer.box.x, y: buyer.box.y - current.unit * 1.2 });
          fx.float(buyer.box.x, buyer.box.y - current.unit * 3, `+${fmt(e.price)}`, c.uiAccent, Math.max(18, current.unit * 0.7), current.unit * 1.1);
        }
        if (slot) say(e.species, slotCenter(slot), current);
      } else if (e.type === 'haggled' && e.result === 'up') {
        const buyer = visitors.get(e.customerId);
        offerPulse = 0.3;
        if (buyer) fx.float(buyer.box.x, buyer.box.y - current.unit * 3.2, `+${Math.round(e.bonus * 100)}%`, c.uiGood, Math.max(15, current.unit * 0.55), current.unit * 0.9);
      } else if (e.type === 'customerLeft') {
        const node = visitors.get(e.id);
        if (node) node.mood = e.reason;
        if (node && e.reason === 'haggle') {
          fx.burst(node.box.x, node.box.y - current.unit, 8, [c.uiMuted, c.outline], current.unit * 2.5, current.outline);
          fx.float(node.box.x, node.box.y - current.unit * 2.6, t('fx.huff'), c.eyeWhite, Math.max(15, current.unit * 0.55), current.unit * 0.8);
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
    customerPoint(id) {
      const node = visitors.get(id);
      return node && current ? { x: node.box.x, y: node.box.y - current.unit * 1.4 } : null;
    },
    anchors() {
      if (!current) return null;
      return { incubators: current.incubators, slots: current.slots, queue: current.queue, counter: current.counter };
    },
  };
}
