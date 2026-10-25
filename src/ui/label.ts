// What: the milestone label of the producer link ("M0 · 2026-10-13 · 1a2b3c4"), bottom-left corner; only when __BUILD_LABEL__ is set.
// Called by: src/main.ts, only with ?debug=1 (UB-07).
// Keep: empty label → no element at all (releases); a tap over it goes to onTap (M6-20 secret) and still reaches the tab bar under it.

export function renderBuildLabel(parent: HTMLElement, text: string, onTap?: () => void): void {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'build-label';
  el.dataset.buildLabel = text;
  el.textContent = text;
  if (onTap)
    parent.ownerDocument.addEventListener(
      'pointerdown',
      (e) => {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) onTap();
      },
      { capture: true, passive: true },
    );
  parent.appendChild(el);
}
