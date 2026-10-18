// What: the shop scene (docs/01, section 6): wall, floor, counter, incubators with eggs, showcase, door and queue; taps go to the sim.
// Called by: src/main.ts (create once, layout on every size change, frame on every ticker tick, onEvent for game events).
// Keep: reads the game view only, never writes state (taps call the handlers); colors from style.json, feel from feel.json.

import { Circle, Container, Graphics, Rectangle, Text, type Application } from 'pixi.js';
import type { FeelData, StyleData } from '../content/schemas.ts';
import type { GameEvent, GameView } from '../sim/game.ts';
import { drawCreature, drawCustomer, drawEgg, drawRing, rarityColor } from './art.ts';
import type { EventView } from '../sim/game.ts';
import { createFx } from './fx.ts';
import { drawBell, drawPointBack, drawDecor, drawLamp, drawSign } from './decor.ts';
import type { SecretTarget } from '../content/schemas.ts';
import { computeShopLayout, type Rect, type ShopLayout, type Spot } from './shop-layout.ts';

export interface ShopHandlers {
  tapIncubator(index: number): void;
  tapCreature(uid: string): void;
  /** The event thing at the door (egg, merchant cart). */
  tapEvent(): void;
  tapEventCoin(id: number): void;
  /** Sign, door, lamp: easter eggs (M2-16). */
  tapThing(target: SecretTarget): void;
  /** The order board (M2-19). */
  tapBoard(): void;
}

export interface ShopAnchors {
  incubators: Spot[];
  slots: Rect[];
  queue: Spot[];
  counter: Rect;
  /** The random event: sneeze coins and the thing at the door (test API, hints). */
  eventCoins: Array<{ id: number; x: number; y: number }>;
  eventThing: Spot | null;
  /** Easter egg things: sign, door, lamp. */
  things: { sign: Rect; door: Rect; lamp: Spot };
  /** UB-09: the caption on the counter that signs the scene's tap gestures ('' when none). */
  caption: string;
}

export interface ShopView {
  root: Container;
  /** shelf — MU-03: a portrait phone shows the showcase as the «Витрина» strip there (canvas coordinates). */
  layout(stage: Rect, hudHeight: number, shelf?: Rect | null, roomH?: number): void;
  /** One ticker tick: animations, then a render request only when something moved. */
  frame(dt: number, view: GameView): void;
  onEvent(e: GameEvent): void;
  /** The last text that flew up in the scene for a purchase (test API, M3-17). */
  lastUpgradeText(): string;
  relabel(): void;
  /** Stage coordinates of the tappable pieces (hints, test API); null before the first layout. */
  anchors(): ShopAnchors | null;
  /** UB-10: the counter caption of the tap gestures — off while the first minute's hints teach them. */
  signGestures(on: boolean): void;
  /** M4-00: a hint points into the shop — the shop's own captions and lines keep quiet meanwhile (one caption at a time). */
  quiet(on: boolean): void;
  /** M4-00: the captions on the shop now (labels, the counter sign, speech lines, floating words) — never more than one. */
  captions(): string[];
  /** Stage point above a customer (coin flights start there). */
  customerPoint(id: number): { x: number; y: number } | null;
  /** A line over a creature (by uid) or a customer (by id), M2-17; nothing when it is not on the scene. */
  speak(who: { uid: string } | { customerId: number }, line: string): void;
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
  /** Egg shell tints by care level (eggs.json → care.shell; 0 is the egg's own color). */
  careShell: readonly string[];
  invalidate(): void;
  handlers: ShopHandlers;
}

export function createShopView(app: Application, deps: ShopDeps): ShopView {
  const { style, feel, t, invalidate, handlers } = deps;
  const c = style.colors;
  const root = new Container();
  const back = new Graphics();
  const furniture = new Graphics();
  const decorG = new Graphics();
  /** M4-05: the pickup point behind the furniture (repair, shelves, the parcel locker). */
  const pointBack = new Graphics();
  const bellBox = new Container();
  const bellG = new Graphics();
  bellBox.addChild(bellG);
  bellBox.visible = false;
  let decorKey = '';
  let decorItems: Record<string, number> = {};
  let bellSwing = 0;
  const rings = new Graphics();
  const creaturesLayer = new Container();
  const selection = new Graphics();
  const customersLayer = new Container();
  customersLayer.sortableChildren = true;
  const eggsLayer = new Container();
  const hits = new Container();
  const labels = new Container();
  const fx = createFx(c.outline);
  // Easter egg things (M2-16): the sign over the door, a plaque on the door, the hanging lamp; each answers a tap.
  const signBox = new Container();
  const signG = new Graphics();
  const signBadge = new Graphics();
  signBox.addChild(signG, signBadge);
  const plaqueBox = new Container();
  const plaqueG = new Graphics();
  plaqueBox.addChild(plaqueG);
  const stranger = new Graphics();
  stranger.alpha = 0;
  const lampBox = new Container();
  const lampG = new Graphics();
  lampBox.addChild(lampG);
  const disco = new Graphics();
  disco.alpha = 0;
  let signSwing = 0;
  let badgeHop = 0;
  let signGlow = false;
  let plaqueFlip = 0;
  let doorKnock = 0;
  let strangerLeft = 0;
  let lampWarm = true;
  let discoLeft = 0;
  const thingHits: Container[] = [];

  function buildThings(l: ShopLayout, level: number): void {
    const d = l.decor;
    drawSign(signG, signBadge, d.sign.w, d.sign.h, level, signGlow || level >= 5, c, l.outline);
    signBox.position.set(d.sign.x + d.sign.w / 2, d.sign.y);
    const pw = l.door.w * 0.42;
    const ph = l.door.h * 0.12;
    plaqueG.clear();
    plaqueG.roundRect(-pw / 2, -ph / 2, pw, ph, ph * 0.3).fill(c.uiGood).stroke({ width: l.outline * 0.5, color: c.outline });
    plaqueG.circle(0, -ph * 1.1, ph * 0.12).fill(c.outline);
    plaqueBox.position.set(l.door.x + l.door.w / 2, l.door.y + l.door.h * 0.52);
    const win = { x: l.door.x + l.door.w * 0.18, y: l.door.y + l.door.h * 0.12, w: l.door.w * 0.64, h: l.door.h * 0.3 };
    stranger.clear();
    stranger.circle(win.x + win.w * 0.5, win.y + win.h * 0.55, win.h * 0.32).fill(c.outline);
    stranger.roundRect(win.x + win.w * 0.2, win.y + win.h * 0.8, win.w * 0.6, win.h * 0.3, win.h * 0.15).fill(c.outline);
    stranger.circle(win.x + win.w * 0.42, win.y + win.h * 0.5, win.h * 0.05).fill(c.eyeWhite);
    stranger.circle(win.x + win.w * 0.58, win.y + win.h * 0.5, win.h * 0.05).fill(c.eyeWhite);
    drawLamp(lampG, d.lamp.r, d.lamp.y - l.stage.y, lampWarm, c, l.outline);
    lampBox.position.set(d.lamp.x, d.lamp.y);
    disco.clear();
    disco.rect(l.stage.x, l.stage.y, l.stage.w, l.stage.h).fill(c.eyeWhite);
    for (const h of thingHits) h.destroy();
    thingHits.length = 0;
    const hit = (target: SecretTarget, area: Rectangle | Circle): void => {
      const box = new Container();
      box.eventMode = 'static';
      box.cursor = 'pointer';
      box.hitArea = area;
      box.on('pointerdown', () => handlers.tapThing(target));
      hits.addChildAt(box, 0);
      thingHits.push(box);
    };
    hit('sign', new Rectangle(d.sign.x - 4, d.sign.y - 4, d.sign.w + 8, Math.max(44, d.sign.h + 12)));
    hit('door', new Rectangle(l.door.x, l.door.y, l.door.w, l.door.h));
    hit('lamp', new Circle(d.lamp.x, d.lamp.y, Math.max(22, d.lamp.r * 1.4)));
    if (decorItems.board) {
      const box = new Container();
      box.eventMode = 'static';
      box.cursor = 'pointer';
      box.hitArea = new Rectangle(d.board.x - 4, d.board.y - 4, Math.max(44, d.board.w + 8), Math.max(44, d.board.h + 8));
      box.on('pointerdown', () => handlers.tapBoard());
      hits.addChildAt(box, 0);
      thingHits.push(box);
    }
  }

  function animateThings(dt: number, l: ShopLayout): boolean {
    let moving = false;
    if (signSwing > 0) {
      signSwing = Math.max(0, signSwing - dt);
      signBox.rotation = Math.sin(signSwing * 22) * 0.18 * (signSwing / 0.9);
      moving = true;
    }
    if (badgeHop > 0) {
      badgeHop = Math.max(0, badgeHop - dt);
      const k = badgeHop / 0.9;
      signBadge.pivot.y = Math.sin((1 - k) * Math.PI) * l.unit * 0.9;
      signBadge.rotation = (1 - k) * Math.PI * 2;
      moving = true;
    }
    if (plaqueFlip > 0) {
      plaqueFlip = Math.max(0, plaqueFlip - dt);
      plaqueBox.scale.x = Math.cos((1 - plaqueFlip / 0.5) * Math.PI * 2);
      moving = true;
    }
    if (doorKnock > 0) {
      doorKnock = Math.max(0, doorKnock - dt);
      plaqueBox.x = l.door.x + l.door.w / 2 + Math.sin(doorKnock * 40) * l.unit * 0.06;
      moving = true;
    }
    if (strangerLeft > 0) {
      strangerLeft = Math.max(0, strangerLeft - dt);
      stranger.alpha = Math.min(1, strangerLeft, (2.2 - strangerLeft) * 3);
      moving = true;
    }
    if (discoLeft > 0) {
      discoLeft = Math.max(0, discoLeft - dt);
      const colors = [c.rarityRare, c.rarityEpic, c.uiGood, c.rarityLegendary, c.blush];
      disco.tint = colors[Math.floor(discoLeft * 6) % colors.length] ?? c.blush;
      disco.alpha = discoLeft > 0 ? 0.3 : 0;
      if (Math.floor(discoLeft * 4) !== Math.floor((discoLeft + dt) * 4)) for (const node of creatures.values()) node.hop = feel.bounceSec;
      moving = true;
    }
    return moving;
  }

  // Random events (M2-15): sneeze coins on the floor and the thing at the door, above the other taps.
  const eventLayer = new Container();
  let eventKey = '';
  let eventCoins = new Map<number, Container>();
  let eventThing: Container | null = null;
  let eventSpot: Spot | null = null;
  root.addChild(back, pointBack, furniture, stranger, plaqueBox, decorG, signBox, lampBox, bellBox, selection, rings, eggsLayer, customersLayer, creaturesLayer, labels, disco, fx.layer, hits, eventLayer);
  app.stage.addChild(root);

  let stageRect: Rect | null = null;
  let shelfRect: Rect | null = null;
  let roomHeight = 0;
  let upgradeText = '';
  let hud = 0;
  let current: ShopLayout | null = null;
  let incubatorCount = 1;
  let slotCount = 3;
  let queueCount = 3;
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
  // UB-09: the hidden gestures of the scene are signed on the counter front — a tap opens or hurries the egg, a tap on a pet feeds it.
  const caption = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontSize: 13, fontWeight: '700', fill: c.outline, align: 'center', wordWrap: true, wordWrapWidth: 200 } });
  caption.anchor.set(0.5, 0.5);
  caption.alpha = 0.9;
  labels.addChild(caption);
  let captionKey = '';
  let captionsOn = true;
  let quietOn = false;
  /** What the one-caption choice showed last (a change is a redraw). */
  let captionsKey = '';
  /** Whether the layout leaves room for the showcase label (landscape phones: no). */
  let showcaseFits = true;
  /** UB-10: the caption stays on the counter front — two lines at most, smaller when the counter is low. */
  let counterH = 0;
  const fitCaption = (): void => {
    caption.scale.set(1);
    if (counterH > 0 && caption.height > counterH * 0.82) caption.scale.set((counterH * 0.82) / caption.height);
  };

  // M4-09: the city the shop is in — every new city has its own walls and floor (style.json cities).
  let city = 1;
  const room = (): typeof c => {
    const list = style.cities ?? [];
    return city > 1 && list.length ? { ...c, ...list[(city - 2) % list.length] } : c;
  };
  function drawBack(l: ShopLayout): void {
    const k = room();
    back.clear();
    back.rect(l.wall.x, l.wall.y, l.wall.w, l.wall.h).fill(k.wall);
    back.rect(l.wall.x, l.wall.y, l.wall.w, Math.min(l.wall.h, l.unit * 0.9)).fill(k.wallShade);
    back.rect(l.floor.x, l.floor.y, l.floor.w, l.floor.h).fill(k.floor);
    back.rect(l.floor.x, l.floor.y, l.floor.w, l.outline).fill(k.floorLine);
    const stripe = l.unit * 1.2;
    // MU-03: the boards run only in the room; the «Витрина» floor under it is plain and a shade darker (s1-shop-scene).
    const boardsH = l.strip ? l.roomBottom - l.floor.y : l.floor.h;
    for (let x = l.floor.x + stripe; x < l.floor.x + l.floor.w; x += stripe) back.rect(x, l.floor.y + l.outline, l.outline / 2, boardsH).fill(k.floorLine);
    if (l.strip) {
      back.rect(l.floor.x, l.roomBottom, l.floor.w, l.floor.y + l.floor.h - l.roomBottom).fill(k.floor);
      back.rect(l.floor.x, l.roomBottom, l.floor.w, l.floor.y + l.floor.h - l.roomBottom).fill({ color: k.outline, alpha: 0.14 });
      back.rect(l.floor.x, l.roomBottom, l.floor.w, l.outline).fill(k.floorLine);
    }
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
    if (l.strip) {
      // MU-03 (s1-shop-scene): a picture frame on the wall; the places are dark cards of the «Витрина» strip on the floor.
      const f = l.frame;
      g.roundRect(f.x, f.y, f.w, f.h, l.radius).fill(c.showcase).stroke(stroke);
      g.roundRect(f.x + l.outline * 2.2, f.y + l.outline * 2.2, f.w - l.outline * 4.4, f.h - l.outline * 4.4, l.radius * 0.6).fill(c.showcaseSlot).stroke({ width: l.outline * 0.7, color: c.outline, alpha: 0.6 });
      for (const s of l.slots) g.roundRect(s.x, s.y, s.w, s.h, 14).fill({ color: c.outline, alpha: 0.32 });
    } else {
      // Showcase shelf with slots.
      g.roundRect(l.showcase.x, l.showcase.y, l.showcase.w, l.showcase.h, l.radius).fill(c.showcase).stroke(stroke);
      for (const s of l.slots) g.roundRect(s.x, s.y, s.w, s.h, l.radius * 0.7).fill(c.showcaseSlot).stroke({ width: l.outline * 0.7, color: c.outline, alpha: 0.6 });
    }
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
      hit.hitArea = new Rectangle(slot.x - l.slotGap / 2, slot.y - slot.h * 0.1, slot.w + l.slotGap, slot.h * 1.2);
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
    const key = `${index}:${view.creatures.map((x) => x.rarity).join(',')}`;
    if (key === selectedKey) return;
    selectedKey = key;
    selection.clear();
    // MU-01: on the «Витрина» strip every pet wears the ring of its rarity (07 «Редкость»: 2.5 px, the lower steps at 70 %).
    if (l.strip)
      view.creatures.slice(0, l.slots.length).forEach((cv, i) => {
        const s = l.slots[i]!;
        const low = cv.rarity === 'common' || cv.rarity === 'good' || cv.rarity === 'valuable';
        selection.roundRect(s.x, s.y, s.w, s.h, 14).stroke({ width: cv.rarity === 'common' ? 1 : 2.5, color: cv.rarity === 'common' ? c.rarityEdge : rarityColor(style.rarity, cv.rarity), alpha: low ? 0.7 : 1 });
      });
    const slot = l.slots[index];
    if (!slot || l.strip) return;
    const pad = l.outline * 1.2;
    selection.roundRect(slot.x - pad, slot.y - pad, slot.w + pad * 2, slot.h + pad * 2, l.radius * 0.9).stroke({ width: l.outline * 1.2, color: c.uiAccent });
  }

  function placeLabels(l: ShopLayout): void {
    const size = Math.max(12, Math.min(16, l.unit * 0.42));
    for (const tx of Object.values(texts)) tx.style.fontSize = size;
    caption.style.fontSize = size;
    caption.style.wordWrapWidth = l.counter.w * 0.92;
    caption.position.set(l.counter.x + l.counter.w / 2, l.counter.y + l.counter.h * 0.58);
    counterH = l.counter.h;
    fitCaption();
    texts.showcase.position.set(l.showcase.x + l.showcase.w / 2, l.showcase.y + l.showcase.h + l.outline);
    // The label gives way to the incubators when the wall is short (landscape phones).
    const domeTop = Math.min(...l.incubators.map((i) => i.y - i.r - l.outline));
    showcaseFits = !l.strip && texts.showcase.y + size * 1.2 < domeTop;
    // The one-caption choice is made again after a relayout (it would keep a stale «shown»).
    captionsKey = '';
    oneCaption();
    texts.queue.position.set(l.door.x + l.door.w / 2, l.door.y - size - l.outline * 2);
    // UB-07: the hanging sign covers this label; the door with its buyers speaks for itself.
    texts.queue.visible = false;
  }

  const slotCenter = (slot: Rect) => ({ x: slot.x + slot.w / 2, y: slot.y + slot.h * 0.56, r: slot.w * 0.36 });
  const easeOutBack = (k: number): number => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

  const fmt = (n: number): string => n.toLocaleString(document.documentElement.lang || 'ru');

  /** Price pill under the portrait and a level badge at its top right (local to the creature box). */
  /** picked: the customer at the counter bids for this one — its pill takes the offer bubble's accent color. */
  function drawTags(node: CreatureNode, cv: GameView['creatures'][number], r: number, l: ShopLayout, picked: boolean, order: 'none' | 'wanted' | 'ready'): void {
    const size = Math.max(12, r * 0.42);
    // MU-03 (s1-shop-scene): a place of the «Витрина» strip shows the pet in its rarity ring, no tags (the price is on «Продажи»).
    if (l.strip) {
      node.tag.clear();
      node.price.text = '';
      node.level.text = '';
      return;
    }
    node.price.text = fmt(cv.price);
    node.price.style.fontSize = size;
    const coinR = size * 0.42;
    node.price.style.fill = c.outline;
    const pillW = node.price.width + coinR * 2 + size * 0.9;
    const pillH = size * 1.35;
    const py = r * 1.12;
    node.tag.clear();
    // Color discipline (Q-022, M3-17): the rarity is a short dash under the creature, above its price tag.
    node.tag.roundRect(-r * 0.32, py - pillH / 2 - r * 0.2, r * 0.64, Math.max(3, r * 0.09), r * 0.05).fill(rarityColor(style.rarity, cv.rarity));
    node.tag.roundRect(-pillW / 2, py - pillH / 2, pillW, pillH, pillH / 2).fill(picked ? c.uiAccent : decorItems.tags ? c.rarityCommon : c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
    node.tag.circle(-pillW / 2 + size * 0.4 + coinR, py, coinR).fill(c.uiAccent).stroke({ width: Math.max(1, l.outline * 0.4), color: c.outline });
    node.price.position.set(coinR + size * 0.2, py);
    const max = cv.level >= cv.maxLevel;
    node.level.text = max ? 'MAX' : String(cv.level);
    node.level.style.fontSize = size * (max ? 0.62 : 0.85);
    const br = size * 0.72;
    node.tag.circle(r * 0.92, -r * 0.88, br).fill(max ? c.rarityLegendary : c.uiPanel).stroke({ width: l.outline * 0.6, color: c.outline });
    node.level.style.fill = max ? c.outline : c.uiText;
    // The board order wants this species (M2-19): a star at the bottom left, gold once the level is enough.
    if (order !== 'none') {
      const sx = -r * 0.95;
      const sy = r * 0.62;
      const sr = Math.max(7, r * 0.3);
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 5;
        const d = i % 2 === 0 ? sr : sr * 0.45;
        pts.push(sx + Math.cos(a) * d, sy + Math.sin(a) * d);
      }
      node.tag.poly(pts).fill(order === 'ready' ? c.rarityLegendary : c.uiMuted).stroke({ width: l.outline * 0.5, color: c.outline, join: 'round' });
    }
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

  // Speech bubbles (M1-06, M2-17): one for the creatures, one for the customers; a new line replaces the old one.
  interface Bubble {
    box: Container;
    bg: Graphics;
    text: Text;
    life: number;
  }
  function makeBubble(): Bubble {
    const box = new Container();
    const bg = new Graphics();
    const text = new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: c.outline, align: 'center', wordWrap: true } });
    text.anchor.set(0.5);
    box.addChild(bg, text);
    box.visible = false;
    root.addChild(box);
    return { box, bg, text, life: 0 };
  }
  const bubble = makeBubble();
  const talk = makeBubble();

  /** Shows a line over a point (tip toward it); below the point when the top is too close to the HUD. */
  function showBubble(b: Bubble, line: string, at: { x: number; y: number; r: number }, l: ShopLayout): void {
    if (!line) return;
    const size = Math.max(13, Math.min(17, l.unit * 0.42));
    b.text.style.fontSize = size;
    b.text.style.wordWrapWidth = Math.min(l.stage.w * 0.6, l.unit * 6);
    b.text.text = line;
    const w = b.text.width + size * 1.4;
    const h = b.text.height + size * 0.9;
    const x = Math.max(l.stage.x + w / 2 + 4, Math.min(l.stage.x + l.stage.w - w / 2 - 4, at.x));
    const below = at.y - at.r * 1.3 - h < l.stage.y + Math.min(l.stage.h * 0.3, hud);
    const y = below ? at.y + at.r * 1.9 + h / 2 : at.y - at.r * 1.3 - h / 2;
    const g = b.bg;
    g.clear();
    const tipX = Math.max(-w / 2 + size, Math.min(w / 2 - size, at.x - x));
    if (below) g.poly([tipX - size * 0.4, -h / 2 + 1, tipX + size * 0.4, -h / 2 + 1, tipX, -h / 2 - size * 0.6]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline, join: 'round' });
    else g.poly([tipX - size * 0.4, h / 2 - 1, tipX + size * 0.4, h / 2 - 1, tipX, h / 2 + size * 0.6]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline, join: 'round' });
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, size)).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
    if (below) g.rect(tipX - size * 0.4 + 1, -h / 2 - 1, size * 0.8 - 2, l.outline * 0.8 + 2).fill(c.eyeWhite);
    else g.rect(tipX - size * 0.4 + 1, h / 2 - l.outline * 0.8 - 1, size * 0.8 - 2, l.outline * 0.8 + 2).fill(c.eyeWhite);
    b.box.position.set(x, y);
    b.box.visible = true;
    b.box.alpha = 0;
    b.life = feel.lineSec;
  }

  /** The creature's own hatch line (species.json). */
  function say(species: string, at: { x: number; y: number; r: number }, l: ShopLayout): void {
    showBubble(bubble, deps.line(species), at, l);
  }

  function animateBubble(dt: number): boolean {
    let on = false;
    for (const b of [bubble, talk]) {
      if (!b.box.visible) continue;
      on = true;
      b.life -= dt;
      if (b.life <= 0) {
        b.box.visible = false;
        continue;
      }
      const k = b.life / feel.lineSec;
      b.box.alpha = k > 0.9 ? (1 - k) / 0.1 : k < 0.15 ? k / 0.15 : 1;
      b.box.scale.set(k > 0.9 ? 0.85 + 0.15 * ((1 - k) / 0.1) : 1);
    }
    return on;
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
      const key = `${q.customer}:${q.outfit}:${q.accessory}:${r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        const look = style.customers[q.customer] ?? { body: c.queueSpot, accent: c.outline };
        drawCustomer(node.art, q.customer, { body: q.outfit || look.body, accent: look.accent }, r, c, l.outline * 0.8, q.accessory);
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
    // UB-05: the front buyer is the oldest open chat; the bubble shows its offer.
    const text = view.queue[0] ? fmt(view.queue[0].offer) : '';
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
      const key = `${cv.species}:${at.r.toFixed(1)}:${cv.tint}`;
      if (node.key !== key) {
        node.key = key;
        node.shown = '';
        drawCreature(node.art, style.creatures[cv.species] ?? FALLBACK_LOOK, cv.rarity, at.r, c, l.outline * 0.8);
        // M4-25: a marked one wears its tint (species.json marks); particles come in M5.
        node.art.tint = cv.tint || 0xffffff;
      }
      const picked = false;
      const order = view.order && view.order.species === cv.species ? (cv.level >= view.order.level ? 'ready' : 'wanted') : 'none';
      const shown = `${cv.price}:${cv.level}:${cv.maxLevel}:${cv.fed}:${cv.need}:${picked}:${order}`;
      if (node.shown !== shown) {
        node.shown = shown;
        drawTags(node, cv, at.r, l, picked, order);
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
          fx.burst(at.x, at.y, Math.round(feel.hatchBurst), [rarityColor(style.rarity, cv.rarity), c.uiAccent, c.showcaseSlot], at.r * 5, l.outline * 1.3);
          fx.float(at.x, at.y - at.r * 1.4, t(`rarity.${cv.rarity}`), rarityColor(style.rarity, cv.rarity), Math.max(14, at.r * 0.7), l.unit * 0.9);
          moving = true;
        }
      }
    });
    return moving;
  }

  function relayout(): void {
    if (!stageRect) return;
    current = computeShopLayout(stageRect, hud, shelfRect ? (style.scene.stripFloorShare ?? style.scene.floorShare) : style.scene.floorShare, style.scene.outlineWidth, style.scene.cornerRadius, incubatorCount, slotCount, queueCount, shelfRect, roomHeight);
    drawBack(current);
    drawFurniture(current);
    buildIncubators(current);
    buildSlots(current);
    selectedKey = '';
    decorKey = '';
    for (const node of creatures.values()) node.key = '';
    for (const d of departing) d.node.box.destroy({ children: true });
    departing.length = 0;
    placeLabels(current);
    fx.clear();
    bubble.box.visible = false;
    talk.box.visible = false;
    offerKey = '';
    for (const node of visitors.values()) node.key = '';
    invalidate();
  }

  /** Where an event coin lies: a point of the free floor from its 0..1 position. */
  function coinPoint(x: number, y: number, l: ShopLayout): { x: number; y: number } {
    const x0 = l.floor.x + l.unit * 0.5;
    const x1 = Math.max(x0 + l.unit, l.door.x - l.unit * 0.6);
    const y0 = l.floor.y + l.unit * 0.35;
    const y1 = Math.max(y0 + l.unit * 0.5, l.stage.y + l.stage.h - l.unit * 0.45);
    return { x: x0 + (x1 - x0) * x, y: y0 + (y1 - y0) * y };
  }

  function buildEvent(ev: EventView | null, l: ShopLayout): void {
    eventLayer.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    eventCoins = new Map();
    eventThing = null;
    eventSpot = null;
    if (!ev) return;
    const tapR = Math.max(22, l.unit * 0.45);
    if (ev.kind === 'sneeze') {
      for (const coin of ev.coins) {
        const p = coinPoint(coin.x, coin.y, l);
        const box = new Container();
        const g = new Graphics();
        const r = Math.max(9, l.unit * 0.24);
        g.ellipse(0, r * 0.9, r * 0.9, r * 0.3).fill({ color: c.outline, alpha: 0.2 });
        g.circle(0, 0, r).fill(c.uiAccent).stroke({ width: l.outline * 0.6, color: c.outline });
        g.circle(0, 0, r * 0.55).stroke({ width: l.outline * 0.5, color: c.counterTop });
        box.addChild(g);
        box.position.set(p.x, p.y);
        box.eventMode = 'static';
        box.cursor = 'pointer';
        box.hitArea = new Circle(0, 0, tapR);
        box.on('pointerdown', () => handlers.tapEventCoin(coin.id));
        eventLayer.addChild(box);
        eventCoins.set(coin.id, box);
      }
    } else if (ev.kind === 'doorEgg' || ev.kind === 'merchant' || ev.kind === 'inspector' || ev.kind === 'photo' || ev.kind === 'pie' || ev.kind === 'blink' || ev.kind === 'catWalk') {
      // M4-21: the cat sits on the sign; the rest wait at the door.
      const spot: Spot =
        ev.kind === 'catWalk'
          ? { x: l.decor.sign.x + l.decor.sign.w * 0.75, y: l.decor.sign.y - l.unit * 0.1, r: l.unit * 0.45 }
          : { x: Math.max(l.stage.x + l.unit, l.door.x - l.unit * 0.75), y: l.floor.y + l.unit * 0.35, r: l.unit * 0.55 };
      const box = new Container();
      const g = new Graphics();
      const r = spot.r;
      if (ev.kind === 'doorEgg') {
        // A basket with the egg and a note.
        drawEgg(g, r * 0.9, c, l.outline * 0.7, 0, ev.egg ? style.eggs[ev.egg] : undefined);
        g.roundRect(-r * 0.75, r * 0.1, r * 1.5, r * 0.6, r * 0.2).fill(c.counter).stroke({ width: l.outline * 0.7, color: c.outline });
        g.roundRect(r * 0.35, -r * 0.65, r * 0.55, r * 0.42, r * 0.06).fill(c.eyeWhite).stroke({ width: l.outline * 0.5, color: c.outline });
        g.rect(r * 0.43, -r * 0.5, r * 0.38, l.outline * 0.4).fill(c.uiMuted);
      } else if (ev.kind === 'inspector') {
        // The inspector's note: a paper with lines and a stamp.
        g.roundRect(-r * 0.6, -r * 0.8, r * 1.2, r * 1.5, r * 0.08).fill(c.eyeWhite).stroke({ width: l.outline * 0.7, color: c.outline });
        for (let i = 0; i < 3; i++) g.rect(-r * 0.4, -r * 0.5 + i * r * 0.3, r * 0.8, l.outline * 0.45).fill(c.uiMuted);
        g.circle(r * 0.3, r * 0.4, r * 0.22).stroke({ width: l.outline * 0.6, color: c.blush });
      } else if (ev.kind === 'photo') {
        // A camera on a tripod.
        g.moveTo(0, 0).lineTo(-r * 0.5, r * 0.8).moveTo(0, 0).lineTo(r * 0.5, r * 0.8).stroke({ width: l.outline * 0.7, color: c.outline });
        g.roundRect(-r * 0.7, -r * 0.7, r * 1.4, r * 0.8, r * 0.15).fill(c.uiPanelAlt).stroke({ width: l.outline * 0.7, color: c.outline });
        g.circle(0, -r * 0.3, r * 0.28).fill(c.incubatorGlass).stroke({ width: l.outline * 0.6, color: c.outline });
        g.rect(r * 0.3, -r * 0.85, r * 0.3, r * 0.15).fill(c.uiAccent);
      } else if (ev.kind === 'pie') {
        // A pie on a plate.
        g.ellipse(0, r * 0.35, r * 0.8, r * 0.22).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
        g.moveTo(-r * 0.6, r * 0.25).quadraticCurveTo(0, -r * 0.6, r * 0.6, r * 0.25).closePath().fill(c.counterTop).stroke({ width: l.outline * 0.7, color: c.outline });
        for (const dx of [-0.25, 0, 0.25]) g.rect(r * dx - l.outline * 0.2, -r * 0.1, l.outline * 0.4, r * 0.2).fill(c.counter);
      } else if (ev.kind === 'blink') {
        // A glow: the lampbug's light that blinked in.
        g.circle(0, 0, r * 1.1).fill({ color: c.counterTop, alpha: 0.35 });
        g.circle(0, 0, r * 0.55).fill(c.counterTop).stroke({ width: l.outline * 0.6, color: c.outline });
        g.rect(-r * 0.2, r * 0.5, r * 0.4, r * 0.25).fill(c.uiMuted).stroke({ width: l.outline * 0.5, color: c.outline });
      } else if (ev.kind === 'catWalk') {
        // The cloud cat: a puffy head with ears.
        g.poly([-r * 0.6, -r * 0.2, -r * 0.45, -r * 0.9, -r * 0.1, -r * 0.45]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
        g.poly([r * 0.6, -r * 0.2, r * 0.45, -r * 0.9, r * 0.1, -r * 0.45]).fill(c.eyeWhite).stroke({ width: l.outline * 0.6, color: c.outline });
        g.ellipse(0, 0, r * 0.75, r * 0.55).fill(c.eyeWhite).stroke({ width: l.outline * 0.7, color: c.outline });
        for (const dx of [-0.25, 0.25]) g.circle(r * dx, -r * 0.05, r * 0.08).fill(c.outline);
      } else {
        // The merchant's cart with an awning and two eggs.
        g.roundRect(-r * 1.0, -r * 0.45, r * 2.0, r * 0.75, r * 0.15).fill(c.counter).stroke({ width: l.outline * 0.7, color: c.outline });
        g.poly([-r * 1.1, -r * 0.5, -r * 0.9, -r * 1.05, r * 0.9, -r * 1.05, r * 1.1, -r * 0.5]).fill(c.blush).stroke({ width: l.outline * 0.7, color: c.outline, join: 'round' });
        for (const dx of [-0.5, 0.5]) g.ellipse(r * dx, -r * 0.55, r * 0.22, r * 0.3).fill(dx < 0 ? c.egg : (style.eggs.egg_warm?.shell ?? c.egg)).stroke({ width: l.outline * 0.5, color: c.outline });
        for (const dx of [-0.65, 0.65]) g.circle(r * dx, r * 0.4, r * 0.22).fill(c.uiPanelAlt).stroke({ width: l.outline * 0.6, color: c.outline });
      }
      box.addChild(g);
      box.position.set(spot.x, spot.y);
      box.eventMode = 'static';
      box.cursor = 'pointer';
      box.hitArea = new Circle(0, 0, Math.max(tapR, r * 1.2));
      box.on('pointerdown', () => handlers.tapEvent());
      eventLayer.addChild(box);
      eventThing = box;
      eventSpot = spot;
    }
  }

  function animateEvent(view: GameView, l: ShopLayout): boolean {
    const ev = view.event;
    const key = ev ? `${ev.id}:${ev.coins.map((x) => x.id).join(',')}:${l.unit.toFixed(1)}` : '';
    if (key !== eventKey) {
      eventKey = key;
      buildEvent(ev, l);
    }
    if (!ev) return false;
    let i = 0;
    for (const box of eventCoins.values()) box.pivot.y = Math.sin(time * 6 + i++) * l.unit * 0.06;
    if (eventThing && eventSpot) {
      const k = Math.abs(Math.sin(time * 3));
      eventThing.scale.set(1 + 0.06 * k, 1 - 0.04 * k);
      eventThing.y = eventSpot.y - k * l.unit * 0.08;
    }
    return true;
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
      const key = `${iv.egg}:${stage}:${iv.careLevel}:${spot.r.toFixed(1)}`;
      if (node.key !== key) {
        node.key = key;
        // Care shows on the shell (M3-02): the egg takes the tint of its care level.
        const look = style.eggs[iv.egg];
        const tint = iv.careLevel > 0 ? deps.careShell[iv.careLevel] : undefined;
        drawEgg(node.egg, spot.r, c, l.outline * 0.8, iv.share, tint ? { shell: tint, spots: look?.spots ?? c.eggSpots } : look);
      }
      node.squash = Math.max(0, node.squash - dt);
      const k = feel.bounceSec > 0 ? node.squash / feel.bounceSec : 0;
      const sq = feel.eggTapSquash * Math.sin(k * Math.PI) * (k > 0 ? 1 : 0);
      if (iv.waiting || iv.ready) {
        // The starter egg and a ready egg invite a tap: a soft hop and pulse.
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

  /**
   * M4-00: one caption at a time on the shop (docs/01 §1а «на экране одна надпись за раз»): a hint at the shop > a floating word
   * (level up, upgrade, rarity) > the newest speech line > the counter sign > the showcase label. The hidden ones keep their timers.
   */
  function oneCaption(): void {
    const words = fx.words().length > 0;
    const lines = [bubble, talk].filter((b) => b.box.visible).sort((a, b) => b.life - a.life);
    const line = !quietOn && !words ? lines[0] : undefined;
    for (const b of [bubble, talk]) b.box.renderable = b === line;
    const sign = !quietOn && !words && !line && Boolean(caption.text);
    caption.renderable = sign;
    texts.showcase.visible = showcaseFits && !quietOn && !words && !line && !sign;
    // The shop draws on demand: a caption that came or went is a change to draw.
    const key = `${line === bubble ? 1 : line === talk ? 2 : 0}${sign ? 1 : 0}${texts.showcase.visible ? 1 : 0}`;
    if (key !== captionsKey) {
      captionsKey = key;
      invalidate();
    }
  }

  return {
    root,
    layout(stage, hudHeight, shelf = null, roomH = 0) {
      stageRect = stage;
      shelfRect = shelf;
      roomHeight = roomH;
      hud = hudHeight;
      relayout();
    },
    frame(dt, view) {
      time += dt;
      if (view.city !== city) {
        city = view.city;
        if (current) {
          drawBack(current);
          decorKey = '';
        }
      }
      const sign = !captionsOn ? '' : view.incubators.some((i) => i.egg && (i.ready || i.waiting)) ? 'shop.tapHatch' : view.creatures.length ? 'shop.tapFeed' : view.incubators.some((i) => i.egg) ? 'shop.tapWarm' : '';
      if (sign !== captionKey) {
        captionKey = sign;
        caption.text = sign ? t(sign) : '';
        fitCaption();
      }
      oneCaption();
      if (view.incubators.length !== incubatorCount || view.slots !== slotCount || view.queueSize !== queueCount) {
        incubatorCount = Math.max(1, view.incubators.length);
        slotCount = Math.max(1, view.slots);
        queueCount = Math.max(2, view.queueSize);
        relayout();
      }
      if (!current) return;
      const key = JSON.stringify(view.decor);
      if (key !== decorKey) {
        decorKey = key;
        decorItems = view.decor;
        drawDecor(decorG, decorItems, current, c);
        drawPointBack(pointBack, decorItems, current, room());
        buildThings(current, decorItems.sign ?? 0);
        bellBox.visible = Boolean(decorItems.bell);
        drawBell(bellG, current.decor.bell.r, c, current.outline);
        bellBox.position.set(current.decor.bell.x, current.decor.bell.y);
        for (const node of creatures.values()) node.shown = '';
        invalidate();
      }
      if (bellSwing > 0) {
        bellSwing = Math.max(0, bellSwing - dt);
        bellBox.rotation = Math.sin(bellSwing * 28) * 0.45 * (bellSwing / 0.8);
        invalidate();
      }
      const moving = animateIncubators(dt, view, current);
      const flying = animateCreatures(dt, view, current);
      const before = selectedKey;
      drawSelection(view, current);
      const talking = animateBubble(dt);
      const walking = animateCustomers(dt, view, current);
      const happening = animateEvent(view, current) || animateThings(dt, current);
      const alive = fx.update(dt);
      if (moving || flying || alive || talking || walking || happening || before !== selectedKey) invalidate();
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
          fx.burst(spot.x, spot.y, Math.round(feel.hatchBurst * 0.75), [c.egg, c.eggSpots, rarityColor(style.rarity, e.rarity)], spot.r * 4, current.outline * 1.4);
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
        if (buyer) {
          soldTo.set(e.uid, { x: buyer.box.x, y: buyer.box.y - current.unit * 1.2 });
          fx.float(buyer.box.x, buyer.box.y - current.unit * 3, `+${fmt(e.price)}`, c.uiAccent, Math.max(18, current.unit * 0.7), current.unit * 1.1);
          if (e.crystals > 0) fx.float(buyer.box.x + current.unit * 0.9, buyer.box.y - current.unit * 2.2, `+${e.crystals}◆`, c.rarityRare, Math.max(16, current.unit * 0.55), current.unit * 1.0);
        }
      } else if (e.type === 'chatReply' && e.ctx === 'accept') {
        // The buyer took the counter price (UB-05): the offer bubble pulses.
        offerPulse = 0.3;
      } else if (e.type === 'customerLeft') {
        const node = visitors.get(e.id);
        if (node) node.mood = e.reason;
      } else if (e.type === 'thingTapped') {
        if (e.target === 'sign') signSwing = 0.9;
        else if (e.target === 'door') {
          plaqueFlip = 0.5;
          if (decorItems.bell) bellSwing = 0.8;
          fx.float(current.door.x + current.door.w / 2, current.door.y - current.unit * 0.2, t('fx.ding'), c.eyeWhite, Math.max(14, current.unit * 0.45), current.unit * 0.6);
        } else if (e.target === 'lamp') {
          lampWarm = !lampWarm;
          drawLamp(lampG, current.decor.lamp.r, current.decor.lamp.y - current.stage.y, lampWarm, c, current.outline);
        }
      } else if (e.type === 'secret') {
        if (e.show === 'hop') badgeHop = 0.9;
        else if (e.show === 'glow') {
          signGlow = true;
          buildThings(current, decorItems.sign ?? 0);
        } else if (e.show === 'knock') {
          doorKnock = 0.6;
          fx.float(current.door.x + current.door.w / 2, current.door.y + current.door.h * 0.3, t('fx.knock'), c.eyeWhite, Math.max(15, current.unit * 0.5), current.unit * 0.8);
        } else if (e.show === 'stranger') strangerLeft = 2.2;
        else if (e.show === 'disco') discoLeft = 3;
        if (e.coins > 0) fx.float(current.door.x, current.door.y - current.unit * 0.6, `+${fmt(e.coins)}`, c.uiAccent, Math.max(16, current.unit * 0.55), current.unit);
      } else if (e.type === 'orderDone') {
        const b = current.decor.board;
        fx.burst(b.x + b.w / 2, b.y + b.h / 2, 12, [c.rarityLegendary, c.uiAccent, c.eyeWhite], current.unit * 2.5, current.outline);
      } else if (e.type === 'eventCoin') {
        const box = eventCoins.get(e.id);
        if (box) {
          fx.float(box.x, box.y - current.unit * 0.4, `+${fmt(e.value)}`, c.uiAccent, Math.max(15, current.unit * 0.5), current.unit * 0.8);
          fx.burst(box.x, box.y, 6, [c.uiAccent, c.counterTop], current.unit * 1.5, current.outline);
        }
      } else if (e.type === 'eventStarted' && e.kind === 'sneeze' && e.uid) {
        const index = slotUids.indexOf(e.uid);
        const slot = current.slots[index];
        const node = creatures.get(e.uid);
        if (slot) {
          const at = slotCenter(slot);
          fx.float(at.x, at.y - at.r * 1.3, t('fx.sneeze'), c.eyeWhite, Math.max(15, at.r * 0.6), current.unit);
          fx.burst(at.x, at.y, 12, [c.uiAccent, c.counterTop, c.eyeWhite], at.r * 6, current.outline * 1.2);
        }
        if (node) node.hop = feel.bounceSec * 2;
      } else if (e.type === 'cuckoo') {
        const k = current.decor.clock;
        fx.float(k.x, k.y - k.r * 1.2, t('fx.cuckoo'), c.uiAccent, Math.max(14, current.unit * 0.5), current.unit * 0.8);
        fx.burst(k.x, k.y - k.r * 0.7, 6, [c.uiAccent, c.eyeWhite], current.unit * 1.5, current.outline);
      } else if (e.type === 'customerArrived') {
        if (decorItems.bell) bellSwing = 0.8;
      } else if (e.type === 'eggBought' || e.type === 'rescueEgg') {
        const spot = current.incubators[e.incubator];
        if (spot) fx.burst(spot.x, spot.y, 8, [c.incubator, c.incubatorGlass, c.uiAccent], spot.r * 3.5, current.outline * 1.2);
      } else if (e.type === 'upgradeBought') {
        // M3-17: the shop changed — it shines where the shop is and says so in the scene (the panel stays aside).
        // In the upper part of the shop: it stays in view above a portrait panel.
        const area = stageRect ?? current.stage;
        const x = area.x + area.w / 2;
        const y = area.y + Math.max(hud, area.h * 0.22);
        const size = Math.max(14, Math.min(26, current.unit * 0.75));
        fx.burst(x, y, 18, [c.uiAccent, c.rarityLegendary, c.eyeWhite], current.unit * 6, current.outline * 1.4);
        upgradeText = t('fx.upgrade', { n: e.level });
        fx.float(x, y, upgradeText, c.uiAccent, size, current.unit * 1.4);
      }
      invalidate();
    },
    lastUpgradeText: () => upgradeText,
    relabel() {
      caption.text = captionKey ? t(captionKey) : '';
      fitCaption();
      texts.showcase.text = t('shop.showcase');
      texts.queue.text = t('shop.queue');
      invalidate();
    },
    speak(who, line) {
      if (!current) return;
      if ('uid' in who) {
        const slot = current.slots[slotUids.indexOf(who.uid)];
        if (slot) showBubble(bubble, line, slotCenter(slot), current);
      } else {
        const node = visitors.get(who.customerId);
        // Over the customer's head, above the offer bubble.
        if (node) showBubble(talk, line, { x: node.box.x - current.unit * 0.6, y: node.box.y - current.unit * 2.6, r: current.unit * 0.9 }, current);
      }
      invalidate();
    },
    customerPoint(id) {
      const node = visitors.get(id);
      return node && current ? { x: node.box.x, y: node.box.y - current.unit * 1.4 } : null;
    },
    signGestures(on) {
      captionsOn = on;
    },
    quiet(on) {
      if (on === quietOn) return;
      quietOn = on;
      fx.quiet(on);
      oneCaption();
    },
    captions() {
      // The same choice the next frame makes: what is in sight right now.
      oneCaption();
      const out = [...fx.words()];
      for (const b of [bubble, talk]) if (b.box.visible && b.box.renderable && b.box.alpha > 0.05) out.push(b.text.text);
      if (caption.renderable && caption.text) out.push(caption.text);
      if (texts.showcase.visible) out.push(texts.showcase.text);
      return out;
    },
    anchors() {
      if (!current) return null;
      const coinsAt = [...eventCoins.entries()].map(([id, box]) => ({ id, x: box.x, y: box.y }));
      return { incubators: current.incubators, slots: current.slots, queue: current.queue, counter: current.counter, eventCoins: coinsAt, eventThing: eventSpot, things: { sign: current.decor.sign, door: current.door, lamp: current.decor.lamp }, caption: caption.text };
    },
  };
}
