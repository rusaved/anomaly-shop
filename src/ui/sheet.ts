// What: a sheet — the screen of one tab (docs/01 §6; UB-01): «Eggs» is the home panel by the shop, others fill the space between the bars; one at a time.
// Called by: src/main.ts (one per tab), the tab modules fill body and head.
// Keep: position comes from CSS (--panel-*, --hud-height, --nav-size set by src/ui/layout.ts); data-sheet="<tab>" hooks for e2e.

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

/** home — the panel of the home screen next to the scene; screen — a whole tab screen. */
export type SheetKind = 'home' | 'screen';

export function createSheet(parent: HTMLElement, id: string, kind: SheetKind = 'screen'): Sheet {
  const root = document.createElement('section');
  root.className = 'sheet';
  root.dataset.sheet = id;
  root.dataset.kind = kind;
  root.hidden = true;
  root.innerHTML =
    '<header class="sheet-top"><h2 class="sheet-title" data-sheet-title></h2></header>' +
    '<div class="sheet-head" data-sheet-head></div><div class="sheet-body" data-sheet-body></div>';
  parent.appendChild(root);
  const title = root.querySelector('[data-sheet-title]') as HTMLElement;
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
