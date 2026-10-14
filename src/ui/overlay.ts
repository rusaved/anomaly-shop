// What: windows by importance (UB-02): a popup in the centre (hatch, reward, gift, pause) or a panel from the right (upgrades, details); one at a time.
// Called by: every window module (pause, settings, hatch, away, gifts, work, merchant, upgrades, egg / lot / sale cards); src/main.ts (dismissAll on a tab tap).
// Keep: every window has a way back (docs/03 GD-05); a tap outside the card closes it; the tab bar stays above every window (styles.css z-index).

export type OverlayKind = 'popup' | 'panel';

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
