// What: the milestone label of the producer link ("M0 · 2026-10-13 · 1a2b3c4"), bottom-left corner; only when __BUILD_LABEL__ is set.
// Called by: src/main.ts.
// Keep: empty label → no element at all (releases).

export function renderBuildLabel(parent: HTMLElement, text: string): void {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'build-label';
  el.dataset.buildLabel = text;
  el.textContent = text;
  parent.appendChild(el);
}
