// What: a sheet — the screen of one tab (docs/01 §6; M3-03): over the panel, taller in portrait; the shop scene stays in view above or to the left.
// Called by: src/main.ts (one per tab), the tab modules fill body and head.
// Keep: position comes from CSS (--sheet-top, --nav-size, --panel-size set by src/ui/layout.ts); data-sheet="<tab>" hooks for e2e.

export interface Sheet {
  root: HTMLElement;
  /** Under the title: sub-tabs or a timer of the tab. */
  head: HTMLElement;
  body: HTMLElement;
  setTitle(text: string): void;
  show(): void;
  hide(): void;
  shown(): boolean;
}

export function createSheet(parent: HTMLElement, id: string, onClose: () => void): Sheet {
  const root = document.createElement('section');
  root.className = 'sheet';
  root.dataset.sheet = id;
  root.hidden = true;
  root.innerHTML =
    '<header class="sheet-top"><h2 class="sheet-title" data-sheet-title></h2>' +
    '<button type="button" class="sheet-close" data-action="sheet-close" data-i18n="sheet.close" data-i18n-attr="aria-label"><span aria-hidden="true">×</span></button></header>' +
    '<div class="sheet-head" data-sheet-head></div><div class="sheet-body" data-sheet-body></div>';
  parent.appendChild(root);
  const title = root.querySelector('[data-sheet-title]') as HTMLElement;
  (root.querySelector('[data-action="sheet-close"]') as HTMLElement).addEventListener('click', onClose);
  return {
    root,
    head: root.querySelector('[data-sheet-head]') as HTMLElement,
    body: root.querySelector('[data-sheet-body]') as HTMLElement,
    setTitle(text) {
      if (title.textContent !== text) title.textContent = text;
    },
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
    shown: () => !root.hidden,
  };
}
