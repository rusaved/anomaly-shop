// What: a sheet — the screen of one tab in the one panel of every tab (docs/01 §6; M4-00): right of the shop on a PC and sideways, above the tab bar on a phone.
// Called by: src/main.ts (one per tab, ✕ closes to the home «Eggs»), the tab modules fill body and head and open their inner pages (detail).
// Keep: position comes from CSS (--panel-*); data-sheet / data-detail hooks for e2e; «Back» only inside a tab; leaving it closes its inner page, the scroll stays.

export interface Detail {
  root: HTMLElement;
  /** The inner page itself: the tab module renders into it. */
  card: HTMLElement;
  show(): void;
  hide(): void;
  isOpen(): boolean;
}

export interface Sheet {
  root: HTMLElement;
  /** Under the title: the sections of the tab or its timer. */
  head: HTMLElement;
  body: HTMLElement;
  setTitle(text: string): void;
  show(): void;
  hide(): void;
  shown(): boolean;
  /** An inner page of this tab (a lot, a creature's price, an egg's odds); onLeave closes it the module's way when the tab is left. */
  detail(name: string, onLeave: () => void): Detail;
  /** The ✕ in the title row (none on the home tab). */
  onClose(cb: () => void): void;
}

export function createSheet(parent: HTMLElement, id: string, home = false): Sheet {
  const root = document.createElement('section');
  root.className = 'sheet';
  root.dataset.sheet = id;
  root.dataset.kind = 'dock';
  if (home) root.dataset.home = '';
  root.hidden = true;
  root.innerHTML =
    '<header class="sheet-top"><h2 class="sheet-title" data-sheet-title></h2>' +
    (home ? '' : '<button type="button" class="sheet-close" data-action="sheet-close" aria-label="✕">✕</button>') +
    '</header><div class="sheet-head" data-sheet-head></div><div class="sheet-body" data-sheet-body></div>';
  parent.appendChild(root);
  const title = root.querySelector('[data-sheet-title]') as HTMLElement;
  const body = root.querySelector('[data-sheet-body]') as HTMLElement;
  const details: Array<{ d: Detail; onLeave: () => void }> = [];
  let scroll = 0;
  let close: (() => void) | null = null;
  root.querySelector('[data-action="sheet-close"]')?.addEventListener('click', () => close?.());
  const sync = (): void => {
    root.classList.toggle('has-detail', details.some((x) => x.d.isOpen()));
  };
  return {
    root,
    head: root.querySelector('[data-sheet-head]') as HTMLElement,
    body,
    setTitle(text) {
      if (title.textContent !== text) title.textContent = text;
    },
    show() {
      if (!root.hidden) return;
      root.hidden = false;
      // M4-00: the tab comes back where the player left it.
      body.scrollTop = scroll;
    },
    hide() {
      if (root.hidden) return;
      scroll = body.scrollTop;
      for (const x of details) if (x.d.isOpen()) x.onLeave();
      root.hidden = true;
    },
    shown: () => !root.hidden,
    detail(name, onLeave) {
      const box = document.createElement('div');
      box.className = 'sheet-detail';
      box.dataset.detail = name;
      box.hidden = true;
      const card = document.createElement('div');
      card.className = 'detail-page';
      box.appendChild(card);
      root.appendChild(box);
      const d: Detail = {
        root: box,
        card,
        show() {
          if (!box.hidden) return;
          if (!root.hidden) scroll = body.scrollTop;
          for (const x of details) if (x.d !== d && x.d.isOpen()) x.d.hide();
          box.hidden = false;
          box.scrollTop = 0;
          sync();
        },
        hide() {
          if (box.hidden) return;
          box.hidden = true;
          sync();
          body.scrollTop = scroll;
        },
        isOpen: () => !box.hidden,
      };
      details.push({ d, onLeave });
      return d;
    },
    onClose(cb) {
      close = cb;
    },
  };
}
