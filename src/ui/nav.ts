// What: the bottom tab bar (docs/07 «Словарь», rules 8–12; MU-02): Market · Storage · Sales · Shop (center, the scene) · Eggs · Chats · Store.
// Called by: src/main.ts (create once; badges and open tabs on every commit); a tap selects its tab, a tap on the active one goes to its main screen.
// Keep: tab ids are stable data-tab hooks for e2e; labels are nav.<id> keys in i18n (12 px under every icon, the button's aria-label too); icons are inline SVG; a closed tab (Q-026 B) has no button.

export const TABS = ['market', 'inventory', 'sales', 'home', 'eggs', 'chats', 'shop'] as const;
export type TabId = (typeof TABS)[number];

const ICONS: Record<TabId, string> = {
  market: '<path d="M3 4h2l2.2 11h10.6L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  inventory: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  sales: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.6"/>',
  home: '<path d="M4 10l1.5-5h13L20 10"/><path d="M5 10v10h14V10"/><path d="M4 10h16"/><path d="M10 20v-5h4v5"/>',
  eggs: '<path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z"/><path d="M8.5 13l2 1.6 2-2.2 2.5 1.8"/>',
  chats: '<path d="M4 5h16v11H9l-5 4z"/>',
  shop: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
};

export interface Nav {
  root: HTMLElement;
  /** The active tab (always one; «Лавка» is home). */
  active(): TabId;
  /** Marks a tab active without calling back. */
  mark(tab: TabId): void;
  /** A dot (true) or a number on the tab; false or 0 hides it. */
  badge(tab: TabId, value: boolean | number): void;
  /** H-01: the tab shows its green dot now. */
  dotted(tab: TabId): boolean;
  /** Shows or hides a tab button (Q-026 B); fresh — it opens now, in play: a pulse draws the eye. */
  setOpen(tab: TabId, open: boolean, fresh?: boolean): void;
}

export function createNav(parent: HTMLElement, onSelect: (tab: TabId, again: boolean) => void): Nav {
  const root = document.createElement('nav');
  root.id = 'nav';
  root.className = 'nav';
  root.innerHTML = TABS.map(
    (id) =>
      // The round of fixes, item 6: every tab has its accessible name (the label, as the eye reads it).
      `<button type="button" class="nav-tab" data-tab="${id}" data-action="${id === 'shop' ? 'upgrades' : `tab-${id}`}" data-i18n="nav.${id}" data-i18n-attr="aria-label">` +
      `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg></span>` +
      `<span class="nav-label" data-i18n="nav.${id}"></span>` +
      '<span class="nav-badge" data-badge hidden></span></button>',
  ).join('');
  parent.appendChild(root);
  let current: TabId = 'home';
  const button = (id: TabId): HTMLElement => root.querySelector(`[data-tab="${id}"]`) as HTMLElement;
  const nav: Nav = {
    root,
    active: () => current,
    mark(tab) {
      current = tab;
      for (const id of TABS) button(id).classList.toggle('active', id === tab);
      for (const id of TABS) button(id).setAttribute('aria-pressed', String(id === tab));
    },
    badge(tab, value) {
      const b = button(tab).querySelector('[data-badge]') as HTMLElement;
      const text = typeof value === 'number' && value > 0 ? String(Math.min(value, 99)) : '';
      b.hidden = !value;
      if (b.textContent !== text) b.textContent = text;
      b.classList.toggle('nav-dot', value === true);
    },
    dotted(tab) {
      const b = button(tab).querySelector('[data-badge]') as HTMLElement;
      return !b.hidden && b.classList.contains('nav-dot');
    },
    setOpen(tab, open, fresh = false) {
      const b = button(tab);
      if (b.hidden === !open) return;
      b.hidden = !open;
      if (open && fresh) {
        b.classList.remove('nav-new');
        void b.offsetWidth;
        b.classList.add('nav-new');
      }
    },
  };
  for (const id of TABS)
    button(id).addEventListener('click', () => {
      const again = current === id;
      nav.mark(id);
      onSelect(id, again);
    });
  nav.mark(current);
  return nav;
}
