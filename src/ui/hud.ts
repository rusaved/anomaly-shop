// What: the top bar (docs/07 rule 8, «Токены»; MU-02): settings · gifts (a dot) · leaders on the left; «ур. N» · the balance with «+» on the right.
// Called by: src/main.ts (create once, update on every store commit, delayed while sale coins fly in).
// Keep: one top bar on every screen, 48 px, elements 40 px; numbers through Intl.NumberFormat; the only accent is the «+» (it opens the Store).

import { createCounter } from './counter.ts';

export interface Hud {
  root: HTMLElement;
  /** The gear: the pause window with Settings (s6-pause). */
  pauseButton: HTMLButtonElement;
  /** The left group after the gear: Gifts and Leaders (main.ts adds them). */
  side: HTMLElement;
  /** The right group: the seller level chip goes first, then the balance pill. */
  balance: HTMLElement;
  /** The balance pill with its «+» (a tap opens the Store). */
  wallet: HTMLElement;
  /** The coin icon the sale coins fly into. */
  coinIcon: HTMLElement;
  /** Rolls to coins; delaySec waits for flying coins (and restarts a roll that began this frame). */
  update(coins: number, opts?: { delaySec?: number; snap?: boolean }): void;
  /** A short pulse of the coin chip (a coin landed). */
  pulse(): void;
  setLanguage(lang: string): void;
}

const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';

export function createHud(parent: HTMLElement, lang: string, rollSec: () => number): Hud {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML =
    `<div class="hud-side" data-hud="side"><button type="button" class="hud-btn" data-action="pause" data-i18n="hud.settings" data-i18n-attr="aria-label">${GEAR}</button></div>` +
    '<div class="hud-right" data-hud="right"><button type="button" class="hud-wallet" data-action="balance" data-i18n="hud.balance" data-i18n-attr="aria-label">' +
    '<span class="hud-pill"><span class="hud-coins" data-hud="coins" role="status"><span class="coin hud-coin" aria-hidden="true"></span><span class="hud-coins-value">0</span></span>' +
    '<span class="hud-plus" aria-hidden="true">+</span></span></button></div>';
  parent.appendChild(root);
  const chip = root.querySelector('.hud-coins') as HTMLElement;
  const value = root.querySelector('.hud-coins-value') as HTMLElement;
  const coinIcon = root.querySelector('.hud-coin') as HTMLElement;
  const pauseButton = root.querySelector('[data-action="pause"]') as HTMLButtonElement;
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
    side: root.querySelector('[data-hud="side"]') as HTMLElement,
    balance: root.querySelector('[data-hud="right"]') as HTMLElement,
    wallet: root.querySelector('[data-action="balance"]') as HTMLElement,
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
    setLanguage(next) {
      format = new Intl.NumberFormat(next);
      written = '';
      paint();
    },
  };
}
