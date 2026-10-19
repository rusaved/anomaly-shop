// What: the bottom of a list (FB-14, 07 rules 6 and 15): a card the edge of its screen cuts shows only its picture — a name or a price is never cut by the line.
// Called by: src/main.ts once; it follows every scrolling screen of a tab (the list and its inner pages) on render and on scroll.
// Keep: only a class on the card (CSS hides its text); the first card of a list is never hidden; no layout writes besides the class.

const LISTS = '.sheet:not([hidden]) > .sheet-body, .sheet:not([hidden]) .sheet-detail';

export interface Peek {
  run(): void;
}

export function installPeek(root: HTMLElement): Peek {
  let queued = false;
  const run = (): void => {
    queued = false;
    for (const list of root.querySelectorAll<HTMLElement>(LISTS)) {
      if (list.offsetParent === null) continue;
      const bottom = list.getBoundingClientRect().bottom;
      const cards = list.querySelectorAll<HTMLElement>('.mu-card');
      cards.forEach((card, i) => {
        const r = card.getBoundingClientRect();
        const cut = i > 0 && r.top < bottom - 1 && r.bottom > bottom + 1;
        if (card.classList.contains('peek') !== cut) card.classList.toggle('peek', cut);
      });
    }
  };
  const later = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  document.addEventListener('scroll', later, { capture: true, passive: true });
  window.addEventListener('resize', later);
  new MutationObserver((list) => {
    // Its own class changes are not a new render.
    if (list.every((m) => m.type === 'attributes' && m.attributeName === 'class' && (m.target as Element).classList?.contains('mu-card'))) return;
    later();
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  return { run };
}
