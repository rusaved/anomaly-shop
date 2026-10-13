// What: a full-screen overlay with a card (pause, settings): show/hide, stacking, Escape and backdrop handling.
// Called by: src/ui/pause.ts, src/ui/settings.ts.
// Keep: every overlay has a way back (docs/03 GD-05); pointer events only inside the card and the backdrop.

export interface Overlay {
  root: HTMLElement;
  card: HTMLElement;
  show(): void;
  hide(): void;
  isOpen(): boolean;
}

export function createOverlay(parent: HTMLElement, name: string, onBackdrop?: () => void): Overlay {
  const root = document.createElement('div');
  root.className = 'overlay';
  root.dataset.overlay = name;
  root.hidden = true;
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  root.appendChild(card);
  parent.appendChild(root);
  root.addEventListener('click', (e) => {
    if (e.target === root) onBackdrop?.();
  });
  return {
    root,
    card,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
    isOpen: () => !root.hidden,
  };
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
