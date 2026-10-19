// What: the tap finger (FB-08): a hand that taps a ready egg the first hatches after the first minute — on the shop or its «Открыть».
// Called by: src/main.ts every frame with the ready egg's spot (scene anchor or a button), or null.
// Keep: never blocks taps (pointer-events: none); DOM is touched only when the spot changes; no text (one caption at a time).

export interface Finger {
  root: HTMLElement;
  /** A point in the parent's coordinates, a button to tap, or null to hide. */
  point(at: { x: number; y: number } | HTMLElement | null): void;
}

export function createFinger(parent: HTMLElement): Finger {
  const root = document.createElement('div');
  root.className = 'tap-finger';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<svg viewBox="0 0 48 48" width="44" height="44"><path d="M19 6c2 0 3.5 1.6 3.5 3.6V22l2-.4V14c0-1.9 1.5-3.4 3.4-3.4s3.4 1.5 3.4 3.4v8.3l1.6.2v-5.6c0-1.8 1.5-3.2 3.3-3.2s3.3 1.4 3.3 3.2V31c0 6.6-5.3 12-12 12h-2.7c-3.4 0-6.6-1.6-8.6-4.4L8.6 29.4c-1-1.4-.8-3.4.6-4.5 1.4-1.1 3.4-.9 4.5.5l2 2.4V9.6C15.7 7.6 17.1 6 19 6z" fill="#fff7ea" stroke="#2b1b3d" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  parent.appendChild(root);
  let key = '';
  return {
    root,
    point(at) {
      let x = 0;
      let y = 0;
      if (at instanceof HTMLElement) {
        const base = parent.getBoundingClientRect();
        const b = at.getBoundingClientRect();
        x = b.left + b.width / 2 - base.left;
        y = b.top + b.height / 2 - base.top;
      } else if (at) ({ x, y } = at);
      const next = at ? `${Math.round(x)}:${Math.round(y)}` : '';
      if (next === key) return;
      key = next;
      root.hidden = !at;
      if (at) root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    },
  };
}
