// What: scene effects (juice): particle bursts and floating numbers over the shop, one Graphics and a small Text pool.
// Called by: src/scene/shop.ts (burst on tap, hatch, level up and sale; update every frame while anything is alive).
// Keep: effects never change game state; update() returns false when nothing is alive, so the scene can stop rendering.

import { Container, Graphics, Text } from 'pixi.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Floater {
  text: Text;
  vy: number;
  life: number;
  max: number;
}

export interface Fx {
  layer: Container;
  burst(x: number, y: number, count: number, colors: string[], speed: number, size: number): void;
  float(x: number, y: number, text: string, color: string, size: number, rise: number): void;
  /** Advances every effect; false when nothing is alive. */
  update(dt: number): boolean;
  /** M4-00: the floating words alive and in sight now (numbers like «+15» are not words: they are the coins themselves). */
  words(): string[];
  /** M4-00: a hint or a toast speaks — the floating words fly on unseen. */
  quiet(on: boolean): void;
  clear(): void;
}

const GRAVITY = 900;
/** A floater that is only a number (+15, +1◆) — not a caption. */
const NUMBER = /^[+\-−]?[\d\s.,\u00a0\u202f◆]+$/;
const POOL = 16;

export function createFx(outline: string): Fx {
  const layer = new Container();
  const dots = new Graphics();
  layer.addChild(dots);
  const particles: Particle[] = [];
  const floaters: Floater[] = [];
  const pool: Text[] = [];
  let hush = false;
  // A tiny deterministic spread (no Math.random needed for looks either).
  let seed = 1;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const fx: Fx = {
    layer,
    burst(x, y, count, colors, speed, size) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + rnd() * 0.6;
        const v = speed * (0.55 + rnd() * 0.6);
        const max = 0.45 + rnd() * 0.35;
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.5, life: max, max, color: colors[i % colors.length] ?? outline, size: size * (0.6 + rnd() * 0.7) });
      }
    },
    float(x, y, text, color, size, rise) {
      // M4-00: one floating word at a time — a new word takes the place of the old one.
      if (!NUMBER.test(text)) for (const f of floaters) if (!NUMBER.test(f.text.text)) f.life = Math.min(f.life, 0.001);
      const t = pool.pop() ?? new Text({ text: '', style: { fontFamily: 'Rubik, sans-serif', fontWeight: '700', fill: color, stroke: { color: outline, width: 4 }, align: 'center' } });
      t.text = text;
      t.style.fill = color;
      t.style.fontSize = size;
      t.style.stroke = { color: outline, width: Math.max(3, size * 0.18) };
      t.anchor.set(0.5);
      t.position.set(x, y);
      t.alpha = 1;
      t.visible = !hush || NUMBER.test(text);
      t.scale.set(0.6);
      layer.addChild(t);
      const max = 0.9;
      floaters.push({ text: t, vy: -rise / max, life: max, max });
    },
    update(dt) {
      dots.clear();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = p.life / p.max;
        dots.circle(p.x, p.y, p.size * (0.4 + 0.6 * k)).fill({ color: p.color, alpha: Math.min(1, k * 1.5) });
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i]!;
        f.life -= dt;
        if (f.life <= 0) {
          floaters.splice(i, 1);
          layer.removeChild(f.text);
          if (pool.length < POOL) pool.push(f.text);
          else f.text.destroy();
          continue;
        }
        const k = 1 - f.life / f.max;
        f.text.y += f.vy * dt * (1 - k * 0.6);
        f.text.scale.set(k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.8));
        f.text.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      }
      return particles.length > 0 || floaters.length > 0;
    },
    words: () => (hush ? [] : floaters.map((f) => f.text.text).filter((x) => !NUMBER.test(x))),
    quiet(on) {
      hush = on;
      for (const f of floaters) f.text.visible = !on || NUMBER.test(f.text.text);
    },
    clear() {
      particles.length = 0;
      for (const f of floaters) layer.removeChild(f.text);
      floaters.length = 0;
      dots.clear();
    },
  };
  return fx;
}
