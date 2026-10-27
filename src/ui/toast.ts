// What: short toasts over the shop ("Not enough coins", "Rare!"): one line at a time (M3-18: a queue, at least 2 s each), fade in and out.
// Called by: src/main.ts (game events → text through t()), src/ui/* when an action is refused; hold() keeps the queue during «Lv N!» in the scene.
// Keep: H-01, H-04, S-02 — one toast on screen at a time with a pause between two; the important first, an answer to a tap at once; sideways every toast stands in the free stretch of the top bar (never on a button); a window open — any toast but an answer to a tap waits and comes after it closes; a tap on a toast is its own and closes it (круг правок FB-3 п. 5); portrait over the tab bar; texts come translated; a text shown or waiting is not repeated.

import { iconize } from './kit.ts';

export type ToastKind = 'info' | 'good' | 'rare' | 'warn';

export interface ToastOptions {
  /** H-01: the answer to a tap — it comes now (the toast on screen gives way at once). */
  now?: boolean;
  /** H-04: news, not an answer — one line, never over a window, the chats or the shelf; it waits for a clear moment. */
  calm?: boolean;
}

export interface Toasts {
  root: HTMLElement;
  show(text: string, kind?: ToastKind, ms?: number, opts?: ToastOptions): void;
  /** Keeps the next toast back for ms (a level-up flies in the scene). */
  hold(ms: number): void;
  /** Toasts waiting (tests). */
  waiting(): number;
  /** The toast on screen now ('' when none): M4-00 — the shop keeps its own captions quiet meanwhile. */
  showing(): string;
  /** H-04, S-02: the toast on screen stands in the top bar (off the scene) — the scene's hint stays under it. */
  calm(): boolean;
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
  now?: boolean;
  calm?: boolean;
  /** When it was queued (a calm one waiting past CALM_WAIT_MS goes). */
  at?: number;
  /** H-04: a calm one whose spot was taken waits till then. */
  retryAt?: number;
}

/** H-04: the order of the queue — an answer to a tap first, then rare, good, the rest; calm news after the answers of its kind. */
export const rank = (q: ToastItem): number => (q.now ? 4 : q.kind === 'warn' ? 3 : q.kind === 'rare' ? 2 : q.kind === 'good' ? 1 : 0) * 2 + (q.calm ? 0 : 1);
/** H-04: a calm toast that found no clear moment in this time goes (the level and the shop show it themselves). */
export const CALM_WAIT_MS = 30_000;

/** The queue alone (no DOM, unit-tested): a text shown or waiting is not added twice; past QUEUE_MAX the oldest plain one goes. */
export function enqueue(queue: ToastItem[], item: ToastItem, showing: string | null): void {
  if (showing === item.text || queue.some((q) => q.text === item.text)) return;
  // H-04: the important first; the same rank keeps its order.
  const at = queue.findIndex((q) => rank(q) < rank(item));
  queue.splice(at < 0 ? queue.length : at, 0, item);
  while (queue.length > QUEUE_MAX) {
    // The oldest of the least important goes (rare ones stay while anything plainer waits).
    const low = Math.min(...queue.filter((q) => q.kind !== 'rare').map(rank));
    const plain = queue.findIndex((q) => q.kind !== 'rare' && rank(q) === low);
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
  el.classList.remove('toast-bar');
  if (el.classList.contains('toast-calm')) {
    placeCalm(el, root);
    return keepInside(el, root);
  }
  // S-02: sideways every toast stands in the top bar — under it there is no button of a list, a card or the shelf.
  if (root.closest('.portrait') === null && placeBar(el, root, 2)) return keepInside(el, root);
  placeFree(el, extra);
  keepInside(el, root);
}

/** The old way (portrait, or no room in the bar): over the tab bar or under the top bar, moved off whatever of AVOID it would lie on. */
function placeFree(el: HTMLElement, extra: () => DOMRect[]): void {
  const root = el.parentElement;
  if (!root) return;
  el.style.removeProperty('width');
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
  // P-01: narrowed into more lines, the toast still ends 4 px over the tab bar — whole in sight, never on a tab.
  const bar = document.querySelector('#nav')?.getBoundingClientRect();
  const end = el.getBoundingClientRect().bottom;
  if (bar && bar.height > 0 && end > bar.top - 4) root.style.transform = `translateY(${Math.round(shift - (end - bar.top + 4))}px)`;
}

/** H-04: what a calm toast never lies on — a window, the chats, the lists of a tab, the hint (and the shelf: extra). */
const CALM_AVOID = `${AVOID}, .overlay:not([hidden]) > .card, .sheet:not([hidden]) .chat-row, .sheet:not([hidden]) .chat-dialog, .sheet:not([hidden]) .mu-card, .sheet:not([hidden]) .mu-btn`;
/** H-04, S-02: a window open — every toast but an answer to a tap waits. */
const windowOpen = (): boolean => document.querySelector('.overlay:not([hidden])') !== null;
/** S-02: an answer to a tap (now) or a refusal of one (warn) comes even over a window — the player tapped there. */
const answers = (q: ToastItem): boolean => q.now === true || q.kind === 'warn';

/** S-02: the widest free stretch of the top bar between its buttons and chips (none — null). */
function barStretch(): { left: number; width: number; hud: DOMRect } | null {
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  if (!hud || hud.height === 0) return null;
  const edges = [...document.querySelectorAll('.hud button, .hud [data-chip]')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0)
    .sort((a, b) => a.left - b.left);
  let from = Math.max(0, hud.left);
  let best = { left: 0, width: 0 };
  for (const r of [...edges, new DOMRect(Math.min(innerWidth, hud.right), hud.top, 0, hud.height)]) {
    if (r.left - from > best.width) best = { left: from, width: r.left - from };
    from = Math.max(from, r.right);
  }
  return { ...best, hud };
}

/** H-04, S-02: a toast in the top bar's widest free stretch — one line, or two when the bar holds them (sideways); false — no room. */
function placeBar(el: HTMLElement, root: HTMLElement, lines: 1 | 2): boolean {
  root.style.removeProperty('transform');
  root.style.removeProperty('align-items');
  root.style.removeProperty('padding-left');
  // Its own width, not the column's (sideways the column is the scene's width, narrow beside a list).
  el.style.maxWidth = 'none';
  el.style.width = 'max-content';
  const bar = barStretch();
  if (!bar) return false;
  // Layout sizes (a toast coming in is scaled by its animation; its box would read narrower).
  const box = { width: el.offsetWidth, height: el.offsetHeight };
  // +2 px: a text 0.3 px wider than its box would end in «…».
  const w = Math.min(Math.ceil(box.width) + 2, bar.width - 16);
  if (w < 120) return false;
  el.style.maxWidth = `${Math.floor(w)}px`;
  if (lines === 2) el.style.width = `${Math.floor(w)}px`;
  if (lines === 2 && el.offsetHeight <= bar.hud.height + 4) {
    // Two lines: as narrow as the text needs (no wide empty pill).
    el.style.width = 'max-content';
  }
  const b = el.getBoundingClientRect();
  if (el.offsetHeight > bar.hud.height + 4 || (lines === 1 && el.offsetHeight > box.height + 1)) return false;
  const top = bar.hud.top + (bar.hud.height - b.height) / 2;
  root.style.transform = `translate(${Math.round(bar.left + (bar.width - b.width) / 2 - b.left)}px, ${Math.round(top - b.top)}px)`;
  el.classList.add('toast-bar');
  return true;
}

/** H-04: a calm toast stands in the top bar's widest free stretch (one line), else just under the bar. */
function placeCalm(el: HTMLElement, root: HTMLElement): void {
  if (placeBar(el, root, root.closest('.portrait') ? 1 : 2)) return;
  const box = el.getBoundingClientRect();
  const hud = document.querySelector('.hud')?.getBoundingClientRect();
  if (!hud) return;
  // No room in the bar (portrait): just under it, within the screen.
  el.style.maxWidth = 'calc(100vw - 32px)';
  root.style.transform = `translateY(${Math.round(hud.bottom + 6 - box.top)}px)`;
}

/** S-02: a toast always whole in the screen (it stood at −28 px over ☰ and «Подарки» on 880×405). */
function keepInside(el: HTMLElement, root: HTMLElement): void {
  const b = el.getBoundingClientRect();
  if (b.width === 0) return;
  const dx = b.left < 4 ? 4 - b.left : b.right > innerWidth - 4 ? innerWidth - 4 - b.right : 0;
  const dy = b.top < 4 ? 4 - b.top : b.bottom > innerHeight - 4 ? innerHeight - 4 - b.bottom : 0;
  if (!dx && !dy) return;
  const m = new DOMMatrixReadOnly(getComputedStyle(root).transform === 'none' ? undefined : getComputedStyle(root).transform);
  root.style.transform = `translate(${Math.round(m.e + dx)}px, ${Math.round(m.f + dy)}px)`;
}

/** H-04: the calm toast now on screen lies on something it must not (tests and the queue read it). */
export function calmBlocked(el: HTMLElement, extra: () => DOMRect[]): boolean {
  const box = el.getBoundingClientRect();
  const rs = [...document.querySelectorAll(CALM_AVOID)].map((e) => e.getBoundingClientRect()).concat(extra());
  return rs.some((r) => meets(box, box.top, box.bottom, r));
}

/** extra — rects of the scene a toast never covers either; gapMs — S-02: the pause between two toasts (an answer to a tap skips it). */
export function createToasts(parent: HTMLElement, extra: () => DOMRect[] = () => [], gapMs = 0): Toasts {
  const root = document.createElement('div');
  root.className = 'toasts';
  root.setAttribute('aria-live', 'polite');
  parent.appendChild(root);
  const queue: ToastItem[] = [];
  let current: HTMLElement | null = null;
  /** H-01: removes the toast on screen at once (an answer to a tap takes its place). */
  let drop: () => void = () => {};
  let heldUntil = 0;
  let timer = 0;
  /** S-02: when the last toast went (the next one waits gapMs after it). */
  let lastGone = 0;

  const next = (): void => {
    if (current || !queue.length) return;
    const now = Date.now();
    const wait = heldUntil - now;
    // H-01: an answer to a tap never waits for the level flying in the scene.
    if (wait > 0 && !queue[0]!.now) {
      window.clearTimeout(timer);
      timer = window.setTimeout(next, wait);
      return;
    }
    // H-04: calm news waits while a window is open or its spot was taken a moment ago; past CALM_WAIT_MS it goes.
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.calm && now - (queue[i]!.at ?? now) > CALM_WAIT_MS) queue.splice(i, 1);
    // S-02: with a window open only an answer to a tap comes; the rest wait for it to close. Two toasts never follow at once.
    const gap = lastGone + gapMs - now;
    const pickAt = queue.findIndex((q) => (answers(q) || (!windowOpen() && gap <= 0)) && (!q.calm || (q.retryAt ?? 0) <= now));
    if (pickAt < 0) {
      window.clearTimeout(timer);
      if (queue.length) timer = window.setTimeout(next, gap > 0 ? Math.min(500, gap) : 500);
      return;
    }
    const item = queue.splice(pickAt, 1)[0]!;
    const el = document.createElement('div');
    el.className = `toast toast-${item.kind}${item.calm ? ' toast-calm' : ''}`;
    el.dataset.toast = item.kind;
    // MU-01: ◉ and ◆ in a text become the coin and the crystal pictures (07 «Знаки»).
    el.innerHTML = iconize(item.text);
    el.dataset.text = item.text;
    root.appendChild(el);
    current = el;
    place(el, extra);
    if (item.calm && calmBlocked(el, extra)) {
      // H-04: no clear spot now — back to its place in the queue, a new try in 0.5 s (other toasts pass meanwhile).
      el.remove();
      current = null;
      queue.splice(pickAt, 0, { ...item, retryAt: now + 500 });
      next();
      return;
    }

    // A screen that opens under a toast already shown (a lot, a hint) moves it too.
    const follow = window.setInterval(() => {
      if (current !== el) return window.clearInterval(follow);
      place(el, extra);
      // H-04: a list that came over a calm toast — it gives way at once. S-02: a window that opened over a toast (not an answer) —
      // the toast goes back to the head of the queue and comes again after the window.
      if (!gone && !answers(item) && windowOpen()) {
        window.clearTimeout(stay);
        gone = true;
        cut();
        queue.unshift({ ...item, at: Date.now() });
        next();
        return;
      }
      if (item.calm && !gone && calmBlocked(el, extra)) leave();
    }, 250);
    // The round of fixes (the usability review): a toast never moves the screen under a finger — it lies over the screen for a moment
    // (07 rule 17); a tap on it stays on it (круг правок FB-3 п. 5).
    let gone = false;
    let fade = 0;
    const cut = (): void => {
      window.clearTimeout(fade);
      el.remove();
      if (current === el) current = null;
      lastGone = Date.now();
    };
    const leave = (): void => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      fade = window.setTimeout(() => {
        cut();
        next();
      }, FADE_MS);
    };
    const stay = window.setTimeout(leave, Math.max(TOAST_MIN_MS, item.ms));
    drop = () => {
      window.clearTimeout(stay);
      gone = true;
      cut();
    };
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
    show(text, kind = 'info', ms = 1600, opts = {}) {
      enqueue(queue, { text, kind, ms, now: opts.now === true, calm: opts.calm === true, at: Date.now() }, current?.dataset.text ?? null);
      // H-01: the answer to a tap does not wait for the toast on screen — that one goes at once.
      if (opts.now && current && current.dataset.text !== text) drop();
      next();
    },
    hold(ms) {
      heldUntil = Math.max(heldUntil, Date.now() + ms);
    },
    waiting: () => queue.length + (current ? 1 : 0),
    showing: () => (current && !current.classList.contains('out') ? (current.dataset.text ?? '') : ''),
    calm: () => Boolean(current?.classList.contains('toast-calm') || current?.classList.contains('toast-bar')),
  };
}
