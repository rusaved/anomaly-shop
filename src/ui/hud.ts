// What: the HUD strip over the scene: the coin counter rolling to its value (M1-07) and the pause button.
// Called by: src/main.ts (create once, update on every store commit, delayed while sale coins fly in).
// Keep: numbers through Intl.NumberFormat of the current language; the HUD only reads state; tabular digits, no layout jumps.

import { createCounter } from './counter.ts';

export interface Hud {
  root: HTMLElement;
  pauseButton: HTMLButtonElement;
  /** The coin icon the sale coins fly into. */
  coinIcon: HTMLElement;
  /** Rolls to coins; delaySec waits for flying coins (and restarts a roll that began this frame). */
  update(coins: number, opts?: { delaySec?: number; snap?: boolean }): void;
  /** A short pulse of the coin chip (a coin landed). */
  pulse(): void;
  /** The crystal chip (M2-08): shown once the player has seen a crystal. */
  crystals(n: number, shown: boolean): void;
  setLanguage(lang: string): void;
}

export function createHud(parent: HTMLElement, lang: string, rollSec: () => number): Hud {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML =
    '<div class="hud-left"><div class="hud-coins" data-hud="coins" role="status" data-i18n="hud.coins" data-i18n-attr="aria-label"><span class="coin" aria-hidden="true"></span><span class="hud-coins-value">0</span></div>' +
    '<div class="hud-crystals" data-hud="crystals" role="status" data-i18n="hud.crystals" data-i18n-attr="aria-label" hidden><span class="gem" aria-hidden="true"></span><span class="hud-crystals-value">0</span></div></div>' +
    '<button type="button" class="hud-pause" data-action="pause" data-i18n="hud.pause" data-i18n-attr="aria-label"><span class="hud-pause-icon" aria-hidden="true"></span></button>';
  parent.appendChild(root);
  const chip = root.querySelector('.hud-coins') as HTMLElement;
  const value = root.querySelector('.hud-coins-value') as HTMLElement;
  const coinIcon = root.querySelector('.coin') as HTMLElement;
  const pauseButton = root.querySelector('[data-action="pause"]') as HTMLButtonElement;
  const gemChip = root.querySelector('.hud-crystals') as HTMLElement;
  const gemValue = root.querySelector('.hud-crystals-value') as HTMLElement;
  let gemText = '';
  let format = new Intl.NumberFormat(lang);
  const counter = createCounter(0);
  let written = '';
  let raf = 0;
  let lastT = 0;

  const paint = (): void => {
    const text = format.format(Math.round(counter.shown()));
    if (text !== written) {
      written = text;
      value.textContent = text;
    }
  };
  const loop = (now: number): void => {
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    const moving = counter.step(dt);
    paint();
    raf = moving ? requestAnimationFrame(loop) : 0;
  };
  const kick = (): void => {
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    root,
    pauseButton,
    coinIcon,
    update(coins, opts) {
      if (opts?.snap || reduced) {
        counter.snap(coins);
        paint();
        return;
      }
      const delay = opts?.delaySec ?? 0;
      if (coins === counter.target() && delay === 0) return;
      counter.set(coins, rollSec(), delay, delay > 0);
      kick();
    },
    pulse() {
      chip.classList.remove('pulse');
      void chip.offsetWidth;
      chip.classList.add('pulse');
    },
    crystals(n, shown) {
      gemChip.hidden = !shown;
      const text = format.format(Math.floor(n));
      if (text === gemText) return;
      if (gemText) {
        gemChip.classList.remove('pulse');
        void gemChip.offsetWidth;
        gemChip.classList.add('pulse');
      }
      gemText = text;
      gemValue.textContent = text;
    },
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      written = '';
      gemText = '';
      paint();
    },
  };
}
