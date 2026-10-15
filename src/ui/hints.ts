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
  /** quiet: a toast is over the shop — a bubble that would stand outside a tab (over the shop) waits (one caption, M4-00). */
  update(hint: FtueHint | null, quiet?: boolean): void;
  /** The text on screen now ('' when hidden): test API. */
  text(): string;
  /** M4-09: the bubble of a tab's target stands outside the tab, over the shop (the shop's own captions keep quiet). */
  outside(): boolean;
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
  let outside = false;

  const setGlow = (el: HTMLElement | null): void => {
    if (glow === el) return;
    glow?.classList.remove('is-hinted');
    glow = el;
    glow?.classList.add('is-hinted');
  };

  const hide = (): void => {
    if (lastKey === '') return;
    lastKey = '';
    outside = false;
    root.hidden = true;
    ring.hidden = true;
    setGlow(null);
  };

  return {
    root,
    text: () => (root.hidden ? '' : label.textContent ?? ''),
    outside: () => outside && !root.hidden,
    update(hint, quiet = false) {
      if (!hint) {
        hide();
        return;
      }
      const base = parent.getBoundingClientRect();
      const canvas = deps.canvas.getBoundingClientRect();
      let x = 0;
      let y = 0;
      let r = 0;
      let bottom = 0;
      let button: HTMLElement | null = null;
      const a = deps.anchors();
      const target = hint.target;
      const win = deps.window();
      if (target.kind === 'button' || target.kind === 'el') {
        // «a|b»: the first of the hooks that is on screen now (UB-01: a card button, else the tile that opens it);
        // never a closed thing (UB-06: a locked card, a button you cannot press yet) and never outside the open window (UB-02).
        const selectors = target.kind === 'button' ? target.action.split('|').map((action) => `[data-action="${action}"]`) : target.selectors;
        button =
          selectors
            .map((sel) => [...deps.panel.querySelectorAll<HTMLElement>(sel)].find((el) => el.offsetParent !== null && !el.closest('.locked') && el.getAttribute('aria-disabled') !== 'true' && (!win || win.contains(el))) ?? null)
            .find((el) => el !== null) ?? null;
        if (!button) {
          hide();
          return;
        }
        const b = button.getBoundingClientRect();
        x = b.left + b.width / 2 - base.left;
        y = b.top - base.top;
        bottom = b.bottom - base.top;
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
      const text = deps.t(hint.key ?? `ftue.${hint.step}`);
      // UB-10: inside an open window (or the answers of a chat, under the offer line) a bubble would cover the text — the target only glows.
      if (button && (win || button.closest('[data-hint-glow]'))) {
        const glowKey = `glow:${hint.key ?? hint.step}`;
        if (glowKey === lastKey) return;
        lastKey = glowKey;
        root.hidden = true;
        ring.hidden = true;
        root.dataset.hint = hint.step;
        label.textContent = text;
        outside = false;
        setGlow(button);
        return;
      }
      // M4-09: a target inside an open tab glows, and its bubble stands outside the tab — over the shop above the tab
      // (a phone upright) or to its left (sideways, a PC): inside it covered the title, prices and subsections.
      const sheet = button?.closest<HTMLElement>('.sheet') ?? null;
      if (button && sheet) {
        if (quiet) {
          hide();
          return;
        }
        const s = sheet.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const side = s.left - base.left > 40;
        const key = `tab:${hint.key ?? hint.step}:${Math.round(s.left)}:${Math.round(s.top)}:${Math.round(b.top)}:${Math.round(b.left)}:${text}`;
        setGlow(button);
        if (key === lastKey) return;
        lastKey = key;
        outside = true;
        label.textContent = text;
        root.hidden = false;
        ring.hidden = true;
        root.dataset.hint = hint.step;
        root.classList.remove('below');
        root.classList.toggle('side', side);
        const w = root.offsetWidth;
        const hh = root.offsetHeight;
        if (side) {
          const cy = b.top + b.height / 2 - base.top;
          const top = Math.max(deps.topInset() + 8, Math.min(base.height - hh - 8, cy - hh / 2));
          root.style.left = `${Math.max(8, s.left - base.left - w - 14)}px`;
          root.style.top = `${top}px`;
          root.style.setProperty('--arrow-y', `${Math.max(14, Math.min(hh - 14, cy - top))}px`);
        } else {
          const tx = Math.max(s.left + 20, Math.min(s.right - 20, b.left + b.width / 2)) - base.left;
          const left = Math.max(8, Math.min(base.width - w - 8, tx - w / 2));
          root.style.left = `${left}px`;
          root.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, tx - left))}px`);
          root.style.top = `${Math.max(deps.topInset() + 4, s.top - base.top - 12 - hh)}px`;
        }
        return;
      }
      outside = false;
      root.classList.remove('side');
      // Above the target; below it when the HUD is in the way. A button in the upper half of a screen (the first card under
      // a tab title, UB-06) gets its bubble below, so the title stays readable; a tab of the bar — above.
      const inBar = button !== null && button.closest('#nav') !== null;
      const above = inBar || (y - r - 56 > deps.topInset() && (button === null || y > base.height * 0.45));
      const key = `${hint.key ?? hint.step}:${Math.round(x)}:${Math.round(y)}:${Math.round(r)}:${above}:${text}`;
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
      root.style.top = above ? `${y - r - 12 - root.offsetHeight}px` : `${(button ? bottom : y + r) + 12}px`;
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
