// What: short toasts over the shop ("Not enough coins", "Rare!"): one line, fade in and out, newest on top, at most 3.
// Called by: src/main.ts (game events → text through t()), src/ui/* when an action is refused.
// Keep: toasts never block taps (pointer-events: none); texts come translated from the caller.

export type ToastKind = 'info' | 'good' | 'rare' | 'warn';

export interface Toasts {
  root: HTMLElement;
  show(text: string, kind?: ToastKind, ms?: number): void;
}

const MAX = 3;

export function createToasts(parent: HTMLElement): Toasts {
  const root = document.createElement('div');
  root.className = 'toasts';
  root.setAttribute('aria-live', 'polite');
  parent.appendChild(root);
  return {
    root,
    show(text, kind = 'info', ms = 1600) {
      const last = root.lastElementChild as HTMLElement | null;
      if (last && last.textContent === text && !last.classList.contains('out')) last.remove();
      const el = document.createElement('div');
      el.className = `toast toast-${kind}`;
      el.dataset.toast = kind;
      el.textContent = text;
      root.appendChild(el);
      while (root.children.length > MAX) root.firstElementChild?.remove();
      setTimeout(() => {
        el.classList.add('out');
        setTimeout(() => el.remove(), 300);
      }, ms);
    },
  };
}
