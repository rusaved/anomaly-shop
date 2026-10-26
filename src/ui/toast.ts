// What: short toasts over the shop ("Not enough coins", "Rare!"): one line at a time (M3-18: a queue, at least 2 s each), fade in and out.
// Called by: src/main.ts (game events → text through t()), src/ui/* when an action is refused; hold() keeps the queue during «Lv N!» in the scene.
// Keep: a tap on a toast is its own and closes it (круг правок FB-3 п. 5); portrait over the tab bar, sideways under the top bar; texts come translated; a text shown or waiting is not repeated.

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

/** Круг правок FB-2 п. 6, FB-3 п. 5: what a toast never covers — the «‹» row and the segments of a screen, a first-minute hint, its target
 *  and its hand. */
const AVOID =
  '.sheet:not([hidden]) .mu-back, .overlay:not([hidden]) .mu-back, .sheet:not([hidden]) .mu-seg, .hint:not([hidden]), .hint-ring, .is-hinted, .tap-finger:not([hidden])';

const meets = (a: DOMRect, top: number, bottom: number, r: DOMRect): boolean =>
  r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > top && r.left < a.right && r.right > a.left;

/** Moves the toasts' column off whatever of AVOID its toast would lie on (07 rule 17: under the bar, but not over a title): into the free
 *  middle of the bar when it fits there (sideways), else down past it. */
function place(el: HTMLElement, extra: () => DOMRect[]): void {
  const root = el.parentElement;
  if (!root) return;
  root.style.removeProperty('transform');
  root.style.removeProperty('align-items');
  root.style.removeProperty('padding-left');
  el.style.removeProperty('max-width');
  const portrait = root.closest('.portrait') !== null;
  // Круг правок FB-3 (сверка с макетом): portrait — the buttons of the list under the toast are kept clear too (a tap on the toast is its own).
  const rects = (sel: string): DOMRect[] => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const list = portrait ? document.querySelector('.sheet:not([hidden]) > .sheet-body')?.getBoundingClientRect() : undefined;
  const listButtons = (): DOMRect[] =>
    list ? rects('.sheet:not([hidden]) > .sheet-body button').filter((r) => r.bottom > list.top + 1 && r.top < list.bottom - 1) : [];
  let box = el.getBoundingClientRect();
  if (portrait) {
    // A toast on a column of buttons (the prices of «Лавка» and «Магазин») narrows to the left of it when it still reads there.
    const hit = listButtons().filter((r) => meets(box, box.top, box.bottom, r));
    const room = hit.length ? Math.min(...hit.map((r) => r.left)) - 8 - 16 : 0;
    if (room >= 160) {
      root.style.alignItems = 'flex-start';
      root.style.paddingLeft = '16px';
      el.style.maxWidth = `${Math.floor(room)}px`;
      box = el.getBoundingClientRect();
    }
  }
  const avoid = (): DOMRect[] => [...rects(AVOID), ...listButtons(), ...extra()];
  if (!avoid().some((r) => meets(box, box.top, box.bottom, r))) return;
  // Круг правок FB-3 п. 5: portrait — the toast stands over the tab bar and goes up past whatever it would lie on.
  if (portrait) {
    let up = 0;
    let clear = false;
    for (let i = 0; i < 8; i++) {
      const hit = avoid().filter((r) => meets(box, box.top - up, box.bottom - up, r));
      if (!hit.length) {
        clear = true;
        break;
      }
      up = box.bottom - Math.min(...hit.map((r) => r.top)) + 8;
    }
    // No free band over the list (a grid of egg cards): the toast stays over the tab bar for its 2 s — a tap on it only closes it.
    if (!clear || (list && box.top - up < list.top)) {
      const hard = rects(AVOID).concat(extra());
      up = 0;
      for (let i = 0; i < 4; i++) {
        const hit = hard.filter((r) => meets(box, box.top - up, box.bottom - up, r));
        if (!hit.length) break;
        up = box.bottom - Math.min(...hit.map((r) => r.top)) + 8;
      }
    }
    if (up > 0) root.style.transform = `translateY(${-Math.round(up)}px)`;
    return;
  }
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  if (hud && box.height <= hud.height) {
    // The widest free stretch of the bar between its buttons: the toast stands in its middle when it fits there.
    const edges = [...document.querySelectorAll('.hud button')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .sort((a, b) => a.left - b.left);
    let from = hud.left;
    let best = { left: 0, width: 0 };
    for (const r of [...edges, new DOMRect(hud.right, hud.top, 0, hud.height)]) {
      if (r.left - from > best.width) best = { left: from, width: r.left - from };
      from = Math.max(from, r.right);
    }
    if (best.width >= box.width + 16) {
      const top = hud.top + (hud.height - box.height) / 2;
      const left = best.left + (best.width - box.width) / 2;
      root.style.transform = `translate(${Math.round(left - box.left)}px, ${Math.round(top - box.top)}px)`;
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
  // V-01 (Q-064 п. 1): a toast moved down to the bottom of the scene keeps clear of its round buttons («Подработка»): it narrows
  // to their right.
  const low = el.getBoundingClientRect();
  const buttons = rects('.stage-actions .stage-btn').filter((r) => meets(low, low.top, low.bottom, r));
  if (buttons.length) {
    const base = root.getBoundingClientRect();
    const from = Math.max(...buttons.map((r) => r.right)) + 8 - base.left;
    root.style.alignItems = 'flex-start';
    root.style.paddingLeft = `${Math.round(from)}px`;
    el.style.maxWidth = `${Math.floor(base.width - from - 8)}px`;
  }
}

/** extra — rects of the scene a toast never covers either (the shelf frame drawn in the canvas: круг правок FB-2, арт-ревизия). */
export function createToasts(parent: HTMLElement, extra: () => DOMRect[] = () => []): Toasts {
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
    place(el, extra);

    // A screen that opens under a toast already shown (a lot, a hint) moves it too.
    const follow = window.setInterval(() => (current === el ? place(el, extra) : window.clearInterval(follow)), 250);
    // The round of fixes (the usability review): a toast never moves the screen under a finger — it lies over the screen for a moment
    // (07 rule 17); a tap on it stays on it (круг правок FB-3 п. 5).
    let gone = false;
    const leave = (): void => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      window.setTimeout(() => {
        el.remove();
        current = null;
        next();
      }, FADE_MS);
    };
    const stay = window.setTimeout(leave, Math.max(TOAST_MIN_MS, item.ms));
    // A tap on the toast is the toast's: it goes away now and the screen under it gets nothing.
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      window.clearTimeout(stay);
      leave();
    });
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
