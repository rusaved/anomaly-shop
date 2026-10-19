// What: the celebration of a rarity (FB-09): sparks, salute bursts, a flash, a shake — from «good» up, ≤ 1.5 s, on a hatch or a reward.
// Called by: src/main.ts when the hatch result shows (and any reward of a rarity); feel.json burst holds every level.
// Keep: never catches a tap (pointer-events: none) — a tap anywhere ends it; prefers-reduced-motion: only the flash; one canvas, no loop when idle.

import type { BurstLevelData, RarityName } from '../content/schemas.ts';

export interface BurstData {
  sec: number;
  good: BurstLevelData;
  valuable: BurstLevelData;
  premium: BurstLevelData;
  vip: BurstLevelData;
  exclusive: BurstLevelData;
}

export interface Burst {
  /** Plays the level of a rarity from the element (its center) or the screen center; common plays nothing. */
  play(rarity: RarityName, from: HTMLElement | null, color: string): BurstLevelData | null;
  /** The level playing now (test API), null when idle. */
  playing(): RarityName | null;
  stop(): void;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  c: string;
  at: number;
}

export function createBurst(parent: HTMLElement, data: BurstData, shakeEl: HTMLElement, reduced: () => boolean): Burst {
  const canvas = document.createElement('canvas');
  canvas.className = 'burst';
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('div');
  flash.className = 'burst-flash';
  flash.hidden = true;
  parent.append(canvas, flash);
  const ctx = canvas.getContext('2d');
  let bits: Bit[] = [];
  let raf = 0;
  let start = 0;
  let now: RarityName | null = null;
  const stop = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    bits = [];
    now = null;
    canvas.hidden = true;
    flash.hidden = true;
    shakeEl.style.removeProperty('transform');
  };
  // A tap anywhere skips the celebration (the tap itself still reaches its button).
  window.addEventListener('pointerdown', () => now && stop(), { capture: true, passive: true });

  const spray = (x: number, y: number, n: number, speed: number, colors: string[], delay: number): void => {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const v = speed * (0.55 + Math.random() * 0.6);
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, r: 1.6 + Math.random() * 2.4, c: colors[i % colors.length]!, at: delay });
    }
  };

  const frame = (t: number): void => {
    const k = (t - start) / 1000;
    if (k >= data.sec || !ctx) return stop();
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const dpr = window.devicePixelRatio || 1;
    for (const b of bits) {
      const s = k - b.at;
      if (s < 0) continue;
      const life = 1 - s / Math.max(0.2, data.sec - b.at);
      if (life <= 0) continue;
      ctx.globalAlpha = Math.min(1, life * 1.6);
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.arc((b.x + b.vx * s) * dpr, (b.y + b.vy * s + 260 * s * s) * dpr, b.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  return {
    play(rarity, from, color) {
      stop();
      if (rarity === 'common') return null;
      const lvl = data[rarity];
      now = rarity;
      const box = parent.getBoundingClientRect();
      const r = from?.getBoundingClientRect();
      const cx = r && !lvl.full ? r.left + r.width / 2 - box.left : box.width / 2;
      const cy = r && !lvl.full ? r.top + r.height / 2 - box.top : box.height * 0.42;
      if (lvl.flash > 0) {
        flash.hidden = false;
        flash.style.setProperty('--burst-flash', String(lvl.flash));
        flash.style.setProperty('--burst-color', color);
        flash.style.setProperty('--burst-sec', `${Math.min(data.sec, 0.9)}s`);
        flash.classList.toggle('full', lvl.full);
        // Restart the CSS fade.
        flash.style.animation = 'none';
        void flash.offsetWidth;
        flash.style.removeProperty('animation');
      }
      if (reduced()) {
        window.setTimeout(() => now === rarity && stop(), Math.min(data.sec, 0.9) * 1000);
        return lvl;
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      canvas.hidden = false;
      const colors = [color, '#fff7ea', '#ffd84d'];
      spray(cx, cy, lvl.sparks, lvl.full ? 420 : 220, colors, 0);
      for (let i = 0; i < lvl.salutes; i++) {
        const sx = lvl.full ? box.width * (0.15 + Math.random() * 0.7) : cx + (Math.random() - 0.5) * Math.min(260, box.width * 0.7);
        const sy = lvl.full ? box.height * (0.15 + Math.random() * 0.45) : cy - 40 - Math.random() * 90;
        spray(sx, sy, lvl.full ? 34 : 22, lvl.full ? 260 : 170, colors, 0.12 + (i * (data.sec * 0.5)) / Math.max(1, lvl.salutes));
      }
      if (lvl.shake > 0) {
        shakeEl.style.transform = `translate(${lvl.shake}px, 0)`;
        const seq = [-lvl.shake, lvl.shake * 0.6, -lvl.shake * 0.4, 0];
        seq.forEach((x, i) => window.setTimeout(() => now === rarity && (shakeEl.style.transform = `translate(${x}px, ${i % 2 ? 1 : -1}px)`), 60 * (i + 1)));
      }
      start = performance.now();
      raf = requestAnimationFrame(frame);
      return lvl;
    },
    playing: () => now,
    stop,
  };
}
