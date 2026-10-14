// What: the bottom tab bar of the genre standard (docs/01 §1а, §6; M3-03): Market · Inventory · My sales · Eggs (center) · Chats · Shop · Season.
// Called by: src/main.ts (create once; badges on every commit); a tap opens the tab's sheet, a second tap on the open tab closes it.
// Keep: tab ids are stable data-tab hooks for e2e; labels are nav.<id> keys in i18n; icons are inline SVG in currentColor (no files, no links).

export const TABS = ['market', 'inventory', 'sales', 'eggs', 'chats', 'shop', 'season'] as const;
export type TabId = (typeof TABS)[number];

const ICONS: Record<TabId, string> = {
  market: '<path d="M4 10h16v10H4z"/><path d="M3 10l2-6h14l2 6"/><path d="M9 20v-5h6v5"/>',
  inventory: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  sales: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.6"/>',
  eggs: '<path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z"/><path d="M8.5 13l2 1.6 2-2.2 2.5 1.8"/>',
  chats: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  shop: '<path d="M4 4h2l2 11h10l2-8H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  season: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4"/><path d="M17 6h3a3 3 0 0 1-3 4"/><path d="M12 14v4M8 20h8"/>',
};

export interface Nav {
  root: HTMLElement;
  /** The open tab, or null on the shop (the panel with the counter). */
  active(): TabId | null;
  /** Marks a tab open (or none) without calling back. */
  mark(tab: TabId | null): void;
  /** A dot (true) or a number on the tab; false or 0 hides it. */
  badge(tab: TabId, value: boolean | number): void;
}

export function createNav(parent: HTMLElement, onSelect: (tab: TabId | null) => void): Nav {
  const root = document.createElement('nav');
  root.id = 'nav';
  root.className = 'nav';
  root.innerHTML = TABS.map(
    (id) =>
      `<button type="button" class="nav-tab" data-tab="${id}" data-action="${id === 'shop' ? 'upgrades' : `tab-${id}`}">` +
      `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg></span>` +
      `<span class="nav-label" data-i18n="nav.${id}"></span><span class="nav-badge" data-badge hidden></span></button>`,
  ).join('');
  parent.appendChild(root);
  let current: TabId | null = null;
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
  };
  for (const id of TABS)
    button(id).addEventListener('click', () => {
      const next = current === id ? null : id;
      nav.mark(next);
      onSelect(next);
    });
  return nav;
}
