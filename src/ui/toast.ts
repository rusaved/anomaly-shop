// What: short toasts over the shop ("Not enough coins", "Rare!"): one line at a time (M3-18: a queue, at least 2 s each), fade in and out.
// Called by: src/main.ts (game events → text through t()), src/ui/* when an action is refused; hold() keeps the queue during «Lv N!» in the scene.
// Keep: toasts never block taps (pointer-events: none); texts come translated from the caller; a text already shown or waiting is not repeated.

import { iconize } from './kit.ts';

export type ToastKind = 'info' | 'good' | 'rare' | 'warn';

export interface Toasts {
  root: HTMLElement;
  show(text: string, kind?: ToastKind, ms?: number): void;
  /** Keeps the next toast back for ms (a level-up flies in the scene). */
  hold(ms: number): void;
  /** Toasts waiting (tests). */
  waiting(): number;
  /** The toast on screen now ('' when none): M4-00 — the shop keeps its own captions quiet meanwhile. */
  showing(): string;
}

/** The producer's rule after M2: one text on screen at a time, long enough to read. */
export const TOAST_MIN_MS = 2000;
/** More than this waiting: the oldest plain ones go (rare ones stay). */
const QUEUE_MAX = 4;
const FADE_MS = 300;

export interface ToastItem {
  text: string;
  kind: ToastKind;
  ms: number;
}

/** The queue alone (no DOM, unit-tested): a text shown or waiting is not added twice; past QUEUE_MAX the oldest plain one goes. */
export function enqueue(queue: ToastItem[], item: ToastItem, showing: string | null): void {
  if (showing === item.text || queue.some((q) => q.text === item.text)) return;
  queue.push(item);
  while (queue.length > QUEUE_MAX) {
    const plain = queue.findIndex((q) => q.kind !== 'rare');
    queue.splice(plain >= 0 ? plain : 0, 1);
  }
}

/** Круг правок FB-2 п. 6: what a toast never covers — the «‹» row of an inner screen and the target of a first-minute hint. */
const AVOID = '.sheet:not([hidden]) .mu-back, .overlay:not([hidden]) .mu-back, .hint:not([hidden]), .hint-ring, .is-hinted';

const meets = (a: DOMRect, top: number, bottom: number, r: DOMRect): boolean =>
  r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > top && r.left < a.right && r.right > a.left;

/** Moves the toasts' column off whatever of AVOID its toast would lie on (07 rule 17: under the bar, but not over a title): into the free
 *  middle of the bar when it fits there (sideways), else down past it. */
function place(el: HTMLElement): void {
  const root = el.parentElement;
  if (!root) return;
  root.style.removeProperty('transform');
  const box = el.getBoundingClientRect();
  const avoid = (): DOMRect[] => [...document.querySelectorAll(AVOID)].map((e) => e.getBoundingClientRect());
  if (!avoid().some((r) => meets(box, box.top, box.bottom, r))) return;
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  if (hud && box.height <= hud.height) {
    const top = hud.top + (hud.height - box.height) / 2;
    const busy = [...document.querySelectorAll('.hud button')].some((e) => meets(box, top, top + box.height, e.getBoundingClientRect()));
    if (!busy) {
      root.style.transform = `translateY(${Math.round(top - box.top)}px)`;
      return;
    }
  }
  let shift = 0;
  for (let i = 0; i < 4; i++) {
    const top = box.top + shift;
    const bottom = box.bottom + shift;
    const hit = avoid().filter((r) => meets(box, top, bottom, r));
    if (!hit.length) break;
    shift = Math.max(...hit.map((r) => r.bottom)) + 8 - box.top;
  }
  if (shift > 0) root.style.transform = `translateY(${Math.round(shift)}px)`;
}

export function createToasts(parent: HTMLElement): Toasts {
  const root = document.createElement('div');
  root.className = 'toasts';
  root.setAttribute('aria-live', 'polite');
  parent.appendChild(root);
  const queue: ToastItem[] = [];
  let current: HTMLElement | null = null;
  let heldUntil = 0;
  let timer = 0;

  const next = (): void => {
    if (current || !queue.length) return;
    const wait = heldUntil - Date.now();
    if (wait > 0) {
      window.clearTimeout(timer);
      timer = window.setTimeout(next, wait);
      return;
    }
    const item = queue.shift()!;
    const el = document.createElement('div');
    el.className = `toast toast-${item.kind}`;
    el.dataset.toast = item.kind;
    // MU-01: ◉ and ◆ in a text become the coin and the crystal pictures (07 «Знаки»).
    el.innerHTML = iconize(item.text);
    el.dataset.text = item.text;
    root.appendChild(el);
    current = el;
    place(el);
    // A screen that opens under a toast already shown (a lot, a hint) moves it too.
    const follow = window.setInterval(() => (current === el ? place(el) : window.clearInterval(follow)), 250);
    // The round of fixes (the usability review): a toast never moves the screen under a finger — it lies over the top
    // of the screen for a moment and lets every tap through (pointer-events: none), 07 rule 17.
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => {
        el.remove();
        current = null;
        next();
      }, FADE_MS);
    }, Math.max(TOAST_MIN_MS, item.ms));
  };

  return {
    root,
    show(text, kind = 'info', ms = 1600) {
      enqueue(queue, { text, kind, ms }, current?.dataset.text ?? null);
      next();
    },
    hold(ms) {
      heldUntil = Math.max(heldUntil, Date.now() + ms);
    },
    waiting: () => queue.length + (current ? 1 : 0),
    showing: () => (current && !current.classList.contains('out') ? (current.dataset.text ?? '') : ''),
  };
}
