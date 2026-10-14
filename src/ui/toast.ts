// What: short toasts over the shop ("Not enough coins", "Rare!"): one line at a time (M3-18: a queue, at least 2 s each), fade in and out.
// Called by: src/main.ts (game events → text through t()), src/ui/* when an action is refused; hold() keeps the queue during «Lv N!» in the scene.
// Keep: toasts never block taps (pointer-events: none); texts come translated from the caller; a text already shown or waiting is not repeated.

export type ToastKind = 'info' | 'good' | 'rare' | 'warn';

export interface Toasts {
  root: HTMLElement;
  show(text: string, kind?: ToastKind, ms?: number): void;
  /** Keeps the next toast back for ms (a level-up flies in the scene). */
  hold(ms: number): void;
  /** Toasts waiting (tests). */
  waiting(): number;
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
    el.textContent = item.text;
    root.appendChild(el);
    current = el;
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
      enqueue(queue, { text, kind, ms }, current?.textContent ?? null);
      next();
    },
    hold(ms) {
      heldUntil = Math.max(heldUntil, Date.now() + ms);
    },
    waiting: () => queue.length + (current ? 1 : 0),
  };
}
