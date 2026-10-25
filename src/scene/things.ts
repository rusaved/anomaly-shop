// What: the M6-20 easter egg things (docs/01b §2): a window (cloud, winged teapot), a wall clock (tick, noon chime), a flower pot (leaves, bloom).
// Called by: src/scene/shop.ts (build on layout and decor changes, animate every frame, play on thingTapped, secret and chime events).
// Keep: style.json colors, ShopLayout.decor places (a window of width 0 is not there); the plain clock only while the cuckoo clock is not bought.

import { Circle, Container, Graphics, Rectangle } from 'pixi.js';
import type { SecretTarget, StyleData } from '../content/schemas.ts';
import type { ShopLayout } from './shop-layout.ts';

type Colors = StyleData['colors'];

export interface Things {
  /** Behind the furniture (the window); in front of the wall things (clock, flower). */
  back: Container;
  front: Container;
  build(l: ShopLayout, cuckoo: boolean, hit: (target: SecretTarget, area: Rectangle | Circle) => void): void;
  /** A first-tap answer (secrets.json first). */
  tapped(first: string, count: number): void;
  /** A secret step (secrets.json show): teapot, bloom. */
  secret(show: string): void;
  /** The flower's taps so far (the save): leaves and the bloom stay after a reload. */
  setFlower(taps: number): void;
  /** Animations; true while something moves. */
  animate(dt: number): boolean;
  /** Where to put a floating word over a thing. */
  spot(target: 'pane' | 'clock' | 'flower'): { x: number; y: number; r: number } | null;
}

const BLOOM_AT = 30;

export function createThings(c: Colors): Things {
  const back = new Container();
  const front = new Container();
  const windowG = new Graphics();
  const sky = new Container();
  const cloud = new Graphics();
  const teapot = new Graphics();
  const skyMask = new Graphics();
  sky.addChild(cloud, teapot);
  sky.mask = skyMask;
  back.addChild(windowG, sky, skyMask);
  const clockG = new Graphics();
  const handG = new Graphics();
  const flowerG = new Graphics();
  front.addChild(clockG, handG, flowerG);
  let l: ShopLayout | null = null;
  let cloudLeft = 0;
  let teapotLeft = 0;
  let tickLeft = 0;
  let flowerTaps = 0;
  let grow = 0;

  const drawFlower = (): void => {
    flowerG.clear();
    if (!l) return;
    const f = l.decor.flower;
    const w = l.outline;
    const r = f.r;
    // The pot stands on the counter top; the stem grows a leaf every 8 taps (up to 4), the bloom at 30.
    flowerG.poly([f.x - r * 0.7, f.y - r * 0.9, f.x + r * 0.7, f.y - r * 0.9, f.x + r * 0.5, f.y, f.x - r * 0.5, f.y]).fill(c.counter).stroke({ width: w * 0.8, color: c.outline, join: 'round' });
    flowerG.rect(f.x - r * 0.78, f.y - r * 1.1, r * 1.56, r * 0.26).fill(c.counterTop).stroke({ width: w * 0.7, color: c.outline });
    const leaves = Math.min(4, 1 + Math.floor(flowerTaps / 8));
    const top = f.y - r * (1.6 + leaves * 0.35);
    flowerG.moveTo(f.x, f.y - r * 1.1).lineTo(f.x, top).stroke({ width: w * 0.9, color: c.outline, cap: 'round' });
    flowerG.moveTo(f.x, f.y - r * 1.1).lineTo(f.x, top).stroke({ width: w * 0.45, color: c.uiGood, cap: 'round' });
    for (let i = 0; i < leaves; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const y = f.y - r * (1.35 + i * 0.35);
      const s = i === leaves - 1 && grow > 0 ? 1 - grow / 0.5 : 1;
      flowerG.ellipse(f.x + side * r * 0.32 * s, y, r * 0.3 * s, r * 0.14 * s).fill(c.uiGood).stroke({ width: w * 0.5, color: c.outline });
    }
    if (flowerTaps >= BLOOM_AT) {
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        flowerG.circle(f.x + Math.cos(a) * r * 0.3, top + Math.sin(a) * r * 0.3, r * 0.24).fill(c.blush).stroke({ width: w * 0.5, color: c.outline });
      }
      flowerG.circle(f.x, top, r * 0.18).fill(c.uiAccent).stroke({ width: w * 0.5, color: c.outline });
    } else flowerG.circle(f.x, top, r * 0.12).fill(c.uiGood).stroke({ width: w * 0.5, color: c.outline });
  };

  const drawHands = (): void => {
    handG.clear();
    if (!l || clockG.visible === false) return;
    const k = l.decor.clock;
    const w = l.outline;
    const wobble = tickLeft > 0 ? Math.sin(tickLeft * 30) * 0.25 : 0;
    const a = -Math.PI / 2 + Math.PI * 0.35 + wobble;
    handG.moveTo(k.x, k.y).lineTo(k.x + Math.cos(a) * k.r * 0.55, k.y + Math.sin(a) * k.r * 0.55).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
    handG.moveTo(k.x, k.y).lineTo(k.x, k.y - k.r * 0.38).stroke({ width: w * 0.7, color: c.outline, cap: 'round' });
    handG.circle(k.x, k.y, w * 0.6).fill(c.outline);
  };

  const drawCloud = (g: Graphics, x: number, y: number, s: number): void => {
    g.clear();
    for (const [dx, dy, rr] of [[-0.5, 0.1, 0.4], [0, -0.15, 0.5], [0.5, 0.1, 0.4]] as const) g.circle(x + dx * s, y + dy * s, rr * s).fill(c.eyeWhite);
  };

  const drawTeapot = (g: Graphics, x: number, y: number, s: number, flap: number): void => {
    g.clear();
    const w = l?.outline ?? 2;
    for (const side of [-1, 1]) g.ellipse(x + side * s * 0.15, y - s * (0.45 + flap * 0.15), s * 0.28, s * 0.12).fill(c.eyeWhite).stroke({ width: w * 0.5, color: c.outline });
    g.poly([x + s * 0.35, y, x + s * 0.75, y - s * 0.3, x + s * 0.4, y + s * 0.15]).fill(c.rarityRare).stroke({ width: w * 0.5, color: c.outline, join: 'round' });
    g.ellipse(x, y, s * 0.42, s * 0.32).fill(c.rarityRare).stroke({ width: w * 0.6, color: c.outline });
    g.circle(x, y - s * 0.34, s * 0.08).fill(c.uiAccent).stroke({ width: w * 0.4, color: c.outline });
  };

  return {
    back,
    front,
    build(layout, cuckoo, hit) {
      l = layout;
      const d = layout.decor;
      const w = layout.outline;
      windowG.clear();
      skyMask.clear();
      const win = d.window;
      const hasWindow = win.w > 0;
      sky.visible = hasWindow;
      if (hasWindow) {
        windowG.roundRect(win.x - w, win.y - w, win.w + w * 2, win.h + w * 2, w * 2).fill(c.doorFrame).stroke({ width: w, color: c.outline });
        windowG.rect(win.x, win.y, win.w, win.h).fill(c.incubatorGlass);
        skyMask.rect(win.x, win.y, win.w, win.h).fill(c.eyeWhite);
        drawCloud(cloud, win.x - win.w, win.y + win.h * 0.35, win.h * 0.3);
        cloud.visible = false;
        teapot.visible = false;
        // The cross of the frame on top of the sky (drawn by the front: the cloud passes behind it).
        windowG.rect(win.x + win.w / 2 - w * 0.5, win.y, w, win.h).fill(c.doorFrame);
        windowG.rect(win.x, win.y + win.h / 2 - w * 0.5, win.w, w).fill(c.doorFrame);
        windowG.rect(win.x - w, win.y + win.h, win.w + w * 2, w * 1.6).fill(c.counterTop).stroke({ width: w * 0.6, color: c.outline });
        hit('pane', new Rectangle(win.x - 4, win.y - 4, Math.max(44, win.w + 8), Math.max(44, win.h + 8)));
      }
      // The plain wall clock while the cuckoo clock is not bought (that one is drawn by decor.ts in the same place).
      const k = d.clock;
      clockG.clear();
      clockG.visible = !cuckoo;
      if (!cuckoo) {
        clockG.circle(k.x, k.y, k.r * 0.85).fill(c.counter).stroke({ width: w, color: c.outline });
        clockG.circle(k.x, k.y, k.r * 0.68).fill(c.eyeWhite).stroke({ width: w * 0.6, color: c.outline });
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI * i) / 2;
          clockG.circle(k.x + Math.cos(a) * k.r * 0.52, k.y + Math.sin(a) * k.r * 0.52, w * 0.5).fill(c.outline);
        }
      }
      drawHands();
      hit('clock', new Circle(k.x, k.y + (cuckoo ? k.r * 0.2 : 0), Math.max(22, k.r * 1.1)));
      drawFlower();
      const f = d.flower;
      hit('flower', new Rectangle(f.x - Math.max(22, f.r), f.y - Math.max(44, f.r * 3.2), Math.max(44, f.r * 2), Math.max(44, f.r * 3.2)));
    },
    tapped(first, count) {
      if (first === 'cloud' && sky.visible) {
        cloudLeft = 1.6;
        cloud.visible = true;
      } else if (first === 'tick') tickLeft = 0.5;
      else if (first === 'leaf') {
        flowerTaps = Math.max(flowerTaps, count);
        if (flowerTaps % 8 === 0 && flowerTaps <= 24) grow = 0.5;
        drawFlower();
      }
    },
    secret(show) {
      if (show === 'teapot' && sky.visible) {
        teapotLeft = 2.2;
        teapot.visible = true;
      } else if (show === 'bloom') {
        flowerTaps = Math.max(flowerTaps, BLOOM_AT);
        drawFlower();
      }
    },
    setFlower(taps) {
      flowerTaps = taps;
      drawFlower();
    },
    animate(dt) {
      if (!l) return false;
      let moving = false;
      const win = l.decor.window;
      if (cloudLeft > 0) {
        cloudLeft = Math.max(0, cloudLeft - dt);
        const k = 1 - cloudLeft / 1.6;
        drawCloud(cloud, win.x - win.h * 0.5 + (win.w + win.h) * k, win.y + win.h * 0.4, win.h * 0.3);
        cloud.visible = cloudLeft > 0;
        moving = true;
      }
      if (teapotLeft > 0) {
        teapotLeft = Math.max(0, teapotLeft - dt);
        const k = 1 - teapotLeft / 2.2;
        drawTeapot(teapot, win.x - win.h * 0.5 + (win.w + win.h) * k, win.y + win.h * (0.55 - Math.sin(k * Math.PI) * 0.2), win.h * 0.45, Math.sin(teapotLeft * 30));
        teapot.visible = teapotLeft > 0;
        moving = true;
      }
      if (tickLeft > 0) {
        tickLeft = Math.max(0, tickLeft - dt);
        drawHands();
        moving = true;
      }
      if (grow > 0) {
        grow = Math.max(0, grow - dt);
        drawFlower();
        moving = true;
      }
      return moving;
    },
    spot(target) {
      if (!l) return null;
      const d = l.decor;
      if (target === 'pane') return d.window.w > 0 ? { x: d.window.x + d.window.w / 2, y: d.window.y, r: d.window.h / 2 } : null;
      if (target === 'clock') return d.clock;
      return { x: d.flower.x, y: d.flower.y - d.flower.r * 2.5, r: d.flower.r };
    },
  };
}
