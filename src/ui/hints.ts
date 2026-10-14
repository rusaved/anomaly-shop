// What: first-minute hints (docs/01, section 4): a bubble of up to 6 words with an arrow at the target, a pulsing ring or a glowing button.
// Called by: src/main.ts every frame with ftueHint(state, view); the shop anchors give scene targets, panel buttons are found by data-action.
// Keep: hints never block taps (pointer-events: none); DOM is touched only when the hint or its spot changes.

import type { FtueHint } from '../sim/ftue.ts';
import type { ShopAnchors } from '../scene/shop.ts';

export interface HintDeps {
  t(key: string): string;
  anchors(): ShopAnchors | null;
  canvas: HTMLElement;
  /** Where the buttons live (data-action targets): the whole UI layer. */
  panel: HTMLElement;
  /** Top of the free stage area (below the HUD). */
  topInset(): number;
  /** The card of the window open now (UB-02: a hint never lies over a window, only inside it when its target is there). */
  window(): HTMLElement | null;
}

export interface Hints {
  root: HTMLElement;
  update(hint: FtueHint | null): void;
  /** The text on screen now ('' when hidden): test API. */
  text(): string;
}

export function createHints(parent: HTMLElement, deps: HintDeps): Hints {
  const root = document.createElement('div');
  root.className = 'hint';
  root.hidden = true;
  root.innerHTML = '<span class="hint-text" data-hint-text></span><span class="hint-arrow" aria-hidden="true"></span>';
  const ring = document.createElement('div');
  ring.className = 'hint-ring';
  ring.hidden = true;
  parent.append(ring, root);
  const label = root.querySelector('[data-hint-text]') as HTMLElement;
  let lastKey = '';
  let glow: HTMLElement | null = null;

  const setGlow = (el: HTMLElement | null): void => {
    if (glow === el) return;
    glow?.classList.remove('is-hinted');
    glow = el;
    glow?.classList.add('is-hinted');
  };

  const hide = (): void => {
    if (lastKey === '') return;
    lastKey = '';
    root.hidden = true;
    ring.hidden = true;
    setGlow(null);
  };

  return {
    root,
    text: () => (root.hidden ? '' : label.textContent ?? ''),
    update(hint) {
      if (!hint) {
        hide();
        return;
      }
      const base = parent.getBoundingClientRect();
      const canvas = deps.canvas.getBoundingClientRect();
      let x = 0;
      let y = 0;
      let r = 0;
      let button: HTMLElement | null = null;
      const a = deps.anchors();
      const target = hint.target;
      const win = deps.window();
      if (target.kind === 'button') {
        // «a|b»: the first of the hooks that is on screen now (UB-01: a card button, else the tile that opens it).
        button =
          target.action
            .split('|')
            .map((action) => deps.panel.querySelector<HTMLElement>(`[data-action="${action}"]`))
            .find((el) => el !== null && el.offsetParent !== null && (!win || win.contains(el))) ?? null;
        if (!button) {
          hide();
          return;
        }
        const b = button.getBoundingClientRect();
        x = b.left + b.width / 2 - base.left;
        y = b.top - base.top;
      } else if (a && !win) {
        if (target.kind === 'incubator') {
          const s = a.incubators[target.index];
          if (!s) return;
          x = s.x;
          y = s.y;
          r = s.r * 1.15;
        } else if (target.kind === 'slot') {
          const s = a.slots[target.index];
          if (!s) return;
          x = s.x + s.w / 2;
          y = s.y + s.h / 2;
          r = s.w * 0.62;
        } else {
          const s = a.queue[0];
          if (!s) return;
          x = s.x;
          y = s.y - s.r * 2;
          r = s.r * 1.6;
        }
        x += canvas.left - base.left;
        y += canvas.top - base.top;
      } else {
        hide();
        return;
      }
      const text = deps.t(`ftue.${hint.step}`);
      // Above the target; below it when the HUD is in the way.
      const above = button !== null || y - r - 56 > deps.topInset();
      const key = `${hint.step}:${Math.round(x)}:${Math.round(y)}:${Math.round(r)}:${above}:${text}`;
      if (key === lastKey) return;
      lastKey = key;
      label.textContent = text;
      root.hidden = false;
      root.dataset.hint = hint.step;
      root.classList.toggle('below', !above);
      const w = root.offsetWidth;
      const left = Math.max(8, Math.min(base.width - w - 8, x - w / 2));
      root.style.left = `${left}px`;
      root.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, x - left))}px`);
      root.style.top = above ? `${y - r - 12 - root.offsetHeight}px` : `${y + r + 12}px`;
      ring.hidden = r === 0;
      if (r > 0) {
        ring.style.left = `${x - r}px`;
        ring.style.top = `${y - r}px`;
        ring.style.width = ring.style.height = `${r * 2}px`;
      }
      setGlow(button);
    },
  };
}
