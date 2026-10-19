// What: the feel of every press (FB-13): a click sound on any button, a 10–20 ms buzz on the main ones (Android, the settings switch).
// Called by: src/main.ts once; the squeeze to 0.95 is CSS (:active of every button, src/ui/mu.css).
// Keep: one capture listener on the document, never stops a tap; a dimmed button (aria-disabled, disabled) gives no feedback.

export interface PressDeps {
  sound(): void;
  /** The buzz is on (settings) and the device can (navigator.vibrate). */
  vibrate(): boolean;
  buzzMs: number;
}

export interface Press {
  /** Presses counted so far (test API: every button gives its feedback). */
  count(): number;
}

/** Buttons that buzz: the one main action of a screen, the center tab, the main of a window. */
const MAIN = '.mu-btn.main, .btn-primary, .nav-tab[data-tab="home"]';

export function installPress(doc: Document, deps: PressDeps): Press {
  let n = 0;
  doc.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"]');
      if (!el || el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) return;
      n += 1;
      deps.sound();
      if (el.matches(MAIN) && deps.vibrate()) navigator.vibrate?.(deps.buzzMs);
    },
    { capture: true, passive: true },
  );
  return { count: () => n };
}
