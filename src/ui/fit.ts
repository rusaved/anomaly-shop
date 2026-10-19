// What: whole words in tight labels (FB-14, 07 rule 6): a tab label, a segment, a gift day or a card name whose word does not fit gets a smaller font, never below 12 px.
// Called by: src/main.ts once (layout, language, and any font change of those labels — a system font of 130 % included).
// Keep: words never break inside (CSS keep-all on these labels); only a label that overflows changes; a font change of its own is not a new change.

const MIN_PX = 12;
const SELECTOR = '.nav-label, .mu-seg > button, .day > b, .day > span, .mu-name';

/** Shrinks one label until its longest word fits its box (0.5 px steps), not below MIN_PX; true when it changed. */
function fit(el: HTMLElement): boolean {
  if (el.offsetParent === null || el.clientWidth <= 0) return false;
  let size = parseFloat(getComputedStyle(el).fontSize);
  let changed = false;
  while (el.scrollWidth > el.clientWidth + 1 && size > MIN_PX) {
    size = Math.max(MIN_PX, size - 0.5);
    el.style.fontSize = `${size}px`;
    changed = true;
  }
  return changed;
}

export interface Fitter {
  /** Fits every label now (after a layout or a language change). */
  run(): void;
}

export function installFit(root: HTMLElement): Fitter {
  let busy = false;
  const run = (): void => {
    if (busy) return;
    busy = true;
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) fit(el);
    busy = false;
  };
  // A label whose font size grows (the system font, a new text) is fitted again; its own shrinking does not loop (it fits then).
  new MutationObserver((list) => {
    if (busy) return;
    if (list.some((m) => m.target instanceof HTMLElement && (m.target.matches(SELECTOR) || m.target.querySelector(SELECTOR)))) requestAnimationFrame(run);
  }).observe(root, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], childList: true, characterData: true });
  return { run };
}
