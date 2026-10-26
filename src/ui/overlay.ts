// What: windows by importance (UB-02): a popup in the centre (hatch, reward, gift, pause) or a panel from the right (upgrades, details); one at a time.
// Called by: every window module (pause, settings, hatch, away, gifts, work, merchant, upgrades, egg / lot / sale cards); src/main.ts (dismissAll on a tab tap).
// Keep: every window has a way back (docs/03 GD-05); a tap outside the card closes it; the tab bar stays above every window (styles.css z-index).

/** popup — a 343 px card in the centre (07 rule 13); panel — from the right; screen — MU-08: a screen under the top bar (Подарки). */
export type OverlayKind = 'popup' | 'panel' | 'screen';

export interface Overlay {
  root: HTMLElement;
  card: HTMLElement;
  kind: OverlayKind;
  show(): void;
  hide(): void;
  isOpen(): boolean;
}

export interface OverlayOptions {
  /** popup (default) — centred over a dim backdrop; panel — from the right over the home panel area, the scene stays in view. */
  kind?: OverlayKind;
  /** How this window closes when another one opens or a tab is tapped (releases its pause, keeps the hatched creature…); default: hide. */
  dismiss?: () => void;
  /** Windows that stay open underneath this one (settings over pause). */
  over?: string[];
  /** T-01: no tap inside the window counts this long after it opens (a window opened by a tap on the scene lies under that finger). */
  guardMs?: number;
  /** T-02: the window shows a price — sideways it opens under the top bar and the balance stays in sight over the dim. */
  priced?: boolean;
}

/** A click this soon after a window opens is the opening tap itself (touch: pointerdown opens, the click follows). */
const GHOST_MS = 400;

/** The windows open now, oldest first (normally one; settings over pause makes two). */
const open: Array<{ name: string; overlay: Overlay; dismiss: () => void }> = [];

/** UB-02: a tab tap works from any window — everything open closes its own way. */
export function dismissAll(): void {
  for (const w of [...open].reverse()) w.dismiss();
}

/** The open window on top, or null. */
export function topWindow(): Overlay | null {
  return open.at(-1)?.overlay ?? null;
}

/** Escape: the window on top closes its own way; false when none is open. */
export function dismissTop(): boolean {
  const w = open.at(-1);
  w?.dismiss();
  return Boolean(w);
}

export function createOverlay(parent: HTMLElement, name: string, onBackdrop?: () => void, opts: OverlayOptions = {}): Overlay {
  const kind = opts.kind ?? 'popup';
  const root = document.createElement('div');
  root.className = 'overlay';
  root.dataset.overlay = name;
  root.dataset.kind = kind;
  root.hidden = true;
  if (opts.priced) root.dataset.priced = '';
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  root.appendChild(card);
  parent.appendChild(root);
  // A tap outside the card closes the window (UB-02); a window without its own rule just hides.
  // UB-10: not the very tap that opened it — on a touch screen its click lands on the fresh backdrop (the egg tap skipped the hatch run).
  let shownAt = 0;
  root.addEventListener('click', (e) => {
    if (e.target !== root) return;
    if (performance.now() - shownAt < GHOST_MS) return;
    if (onBackdrop) onBackdrop();
    else overlay.hide();
  });
  // T-01: the click of the opening tap lands on whatever of the fresh window is under the finger (the merchant's «Купить» over his cart).
  if (opts.guardMs)
    root.addEventListener(
      'click',
      (e) => {
        if (performance.now() - shownAt >= opts.guardMs!) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
  const overlay: Overlay = {
    root,
    card,
    kind,
    show() {
      if (!root.hidden) return;
      // One window at a time: the others close their own way first (settings may stay over pause).
      for (const w of [...open].reverse()) if (!opts.over?.includes(w.name)) w.dismiss();
      root.hidden = false;
      shownAt = performance.now();
      open.push({ name, overlay, dismiss: () => (opts.dismiss ?? overlay.hide)() });
    },
    hide() {
      root.hidden = true;
      const i = open.findIndex((w) => w.overlay === overlay);
      if (i >= 0) open.splice(i, 1);
    },
    isOpen: () => !root.hidden,
  };
  return overlay;
}

/** A 44 px button with a translated label; data-action for tests. */
export function button(action: string, i18nKey: string, extraClass = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${extraClass}`.trim();
  b.dataset.action = action;
  b.dataset.i18n = i18nKey;
  return b;
}

/** MU-09 (07 rule 13): the ✕ of a window that closes without a choice, in its top right corner. */
export function closeX(card: HTMLElement, label: string, onClose: () => void, action = 'win-close'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'win-x';
  b.dataset.action = action;
  b.setAttribute('aria-label', label);
  b.textContent = '✕';
  b.addEventListener('click', onClose);
  card.prepend(b);
  return b;
}
