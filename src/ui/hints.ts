// What: first-minute hints (docs/01, section 4; 07 rule 16): a bubble of up to 6 words next to the target, the target in a green ring or frame.
// Called by: src/main.ts every frame with ftueHint(state, view); the shop anchors give scene targets, panel buttons are found by data-action.
// Keep: hints never block taps (pointer-events: none) — but the ring of «Покупатель уже идёт», which answers its own tap (P-03); DOM is touched only when the hint or its spot changes.

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
  /** PT-05: seconds without a touch after which a target scrolled out of sight is scrolled back (ftue.json hintRepullSec). */
  repullSec?: number;
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
  /** The usability review (the round of fixes): a bubble over a tab of the bar takes a band at the bottom of the open screen — its list ends above. */
  let lowered: HTMLElement | null = null;
  const lower = (sheet: HTMLElement | null, h = 0): void => {
    if (lowered && lowered !== sheet) {
      lowered.style.removeProperty('--hint-bottom');
      lowered.classList.remove('hint-band');
    }
    lowered = sheet;
    sheet?.style.setProperty('--hint-bottom', `${Math.ceil(h)}px`);
    // W-05: the list over the band ends without its fade (the bubble is its edge) — a short screen keeps two rows in sight.
    sheet?.classList.add('hint-band');
  };

  const setGlow = (el: HTMLElement | null): void => {
    if (glow === el) return;
    glow?.classList.remove('is-hinted');
    glow = el;
    glow?.classList.add('is-hinted');
  };

  /** The hint whose target was scrolled into sight (once). */
  let scrolledFor = '';
  /** PT-05: the last touch, wheel or drag of the player (a list the player scrolls stays put until the player lets it be). */
  let lastTouch = performance.now();
  const touched = (): void => {
    lastTouch = performance.now();
  };
  for (const type of ['pointerdown', 'wheel', 'touchmove'] as const) window.addEventListener(type, touched, { capture: true, passive: true });
  const hide = (): void => {
    lower(null);
    scrolledFor = '';
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
    update(hint, _quiet = false) {
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
        // N-03 (предприёмка штаба 19: the coins of the top bar open «Магазин», the ring «Тапни яйцо» hung over its empty list): a scene
        // spot under a sheet or a window shows nothing until it is in sight again.
        if (document.elementsFromPoint(x + base.left, y + base.top).find((e) => !e.closest('.hint-ring, .hint, .tap-finger'))?.closest('.sheet:not([data-sheet="home"]), .overlay')) {
          hide();
          return;
        }
      } else {
        hide();
        return;
      }
      const text = deps.t(hint.key ?? `ftue.${hint.step}`);
      // P-03: the ring knows its step — «Покупатель уже идёт» answers a tap (src/main.ts), the others let taps through.
      ring.dataset.step = hint.step;
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
      // MU-12 (07 rule 16): inside a tab screen the target wears the green frame and the bubble stands next to it in its own layer
      // (круг правок FB п. 7: its tail on the target, «Купи новое яйцо» on «10») — under it, or over it when the screen ends;
      // nothing in the list moves when it goes (no band), the bubble follows the target when the list scrolls.
      const sheet = button?.closest<HTMLElement>('.sheet') ?? null;
      if (button && sheet && !button.closest('#nav')) {
        lower(null);
        if (_quiet) {
          root.hidden = true;
          lastKey = '';
          setGlow(button);
          return;
        }
        const s = sheet.getBoundingClientRect();
        let b = button.getBoundingClientRect();
        // The target in sight first (the screen just opened, no finger yet) — once per hint: N-07 (RD-02), a call that stands (the
        // upgrade) never pulls the list back while the player scrolls it.
        const scrollKey = `${hint.key ?? hint.step}:${sheet.dataset.sheet}`;
        // A list the player already scrolled stays where it is.
        const fresh = (button.closest<HTMLElement>('.sheet-body')?.scrollTop ?? 0) < 1;
        if ((b.top < s.top || b.bottom > s.bottom) && scrolledFor !== scrollKey && fresh) {
          scrolledFor = scrollKey;
          button.scrollIntoView({ block: 'nearest' });
          b = button.getBoundingClientRect();
        }
        // PT-05 (проход штаба 20: no hint on «Яйца» for 45–91 s — an earlier hint had scrolled the list, the next target lay out of sight):
        // the player let the list be for repullSec — the target comes back into sight.
        if ((b.bottom <= s.top + 4 || b.top >= s.bottom - 4) && performance.now() - lastTouch >= (deps.repullSec ?? 6) * 1000) {
          button.scrollIntoView({ block: 'nearest' });
          b = button.getBoundingClientRect();
        }
        // Scrolled away by the player: the bubble waits until the target is back in sight (never over the list's edge).
        if (b.bottom <= s.top + 4 || b.top >= s.bottom - 4) {
          root.hidden = true;
          lastKey = '';
          setGlow(button);
          return;
        }
        const key = `room:${hint.key ?? hint.step}:${text}:${sheet.dataset.sheet}:${Math.round(b.left)}:${Math.round(b.top)}:${Math.round(b.width)}`;
        setGlow(button);
        // N-03: a ring of the scene left from the hint before never hangs over the tab.
        ring.hidden = true;
        if (key === lastKey) return;
        lastKey = key;
        outside = false;
        label.textContent = text;
        root.hidden = false;
        root.dataset.hint = hint.step;
        root.classList.remove('side', 'right');
        root.style.maxWidth = '';
        root.classList.add('roomed');
        const w = root.offsetWidth;
        const hh = root.offsetHeight;
        const under = b.bottom + 12 + hh <= s.bottom - 4 || b.top - 12 - hh < s.top;
        const left = Math.max(16, Math.min(base.width - w - 16, b.left + b.width / 2 - base.left - w / 2));
        // N-01, N-02 (предприёмка штаба 19: «Выставь питомца» lay on «Снять с витрины», «Купи улучшение» on the next price): the bubble
        // never lies on another button of the screen — under, over, else left of the target with its arrow at it.
        // PT-02 (проход штаба 20: «Купи улучшение» lay on the upgrade's name and use, at 880×405 almost whole): the upgrade's call keeps
        // off the words of the list too.
        const upgradeCall = hint.key === 'ftue.upgrade';
        const others = [...sheet.querySelectorAll<HTMLElement>(upgradeCall ? 'button, [data-action], .mu-name, .mu-meta' : 'button, [data-action]')].filter((e) => e.offsetParent !== null && !e.contains(button) && !button.contains(e));
        const clear = (l: number, t: number, ww: number, h: number): boolean =>
          t + base.top >= s.top &&
          t + h + base.top <= s.bottom &&
          !others.some((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.bottom > s.top && r.top < s.bottom && r.left < l + ww + base.left && r.right > l + base.left && r.top < t + h + base.top && r.bottom > t + base.top;
          });
        const vert = (down: boolean, l = left) => ({ down, top: down ? b.bottom - base.top + 12 : b.top - base.top - 12 - hh, left: l });
        // A wide target (a section head) lets the bubble slide along it — its arrow still on the target.
        const lefts = [b.left - base.left + 8, b.right - base.left - w - 8, b.left - base.left + (b.width - w) / 4].filter(
          (l) => l >= 8 && l + w <= base.width - 8 && b.left - base.left + 14 <= l + w - 14 && b.right - base.left - 14 >= l + 14,
        );
        const spots = [vert(under), vert(!under), ...lefts.flatMap((l) => [vert(under, l), vert(!under, l)])];
        const pick = spots.find((p) => clear(p.left, p.top, w, hh));
        // PT-02: no free spot in the list — the upgrade's call stands off the list: sideways over the scene left of it (its arrow at the
        // target's row), upright over the scene above it.
        const list = s;
        if (!pick && upgradeCall) {
          const hud = deps.topInset();
          if (list.left - base.left >= 160 + 22) {
            root.classList.add('side');
            root.classList.remove('below');
            root.style.maxWidth = `${Math.floor(Math.min(list.left - base.left - 22, 260))}px`;
            const sw = root.offsetWidth;
            const sh = root.offsetHeight;
            const top = Math.max(hud - base.top + 4, b.top + b.height / 2 - base.top - sh / 2);
            root.style.left = `${list.left - base.left - 14 - sw}px`;
            root.style.top = `${top}px`;
            root.style.setProperty('--arrow-y', `${Math.max(14, Math.min(sh - 14, b.top + b.height / 2 - base.top - top))}px`);
            return;
          }
          if (list.top - hud >= hh + 16) {
            root.classList.remove('below');
            const l = Math.max(8, Math.min(base.width - w - 8, b.left + b.width / 2 - base.left - w / 2));
            root.style.left = `${l}px`;
            root.style.top = `${list.top - base.top - 12 - hh}px`;
            root.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, b.left + b.width / 2 - base.left - l))}px`);
            return;
          }
        }
        const room = b.left - base.left - 14 - 8;
        if (!pick && room >= 110) {
          root.classList.add('side');
          root.classList.remove('below');
          root.style.maxWidth = `${Math.floor(Math.min(room, 260))}px`;
          const sw = root.offsetWidth;
          const sh = root.offsetHeight;
          const top = Math.max(s.top - base.top, b.top + b.height / 2 - base.top - sh / 2);
          root.style.left = `${b.left - base.left - 14 - sw}px`;
          root.style.top = `${top}px`;
          root.style.setProperty('--arrow-y', `${Math.max(14, Math.min(sh - 14, b.top + b.height / 2 - base.top - top))}px`);
          return;
        }
        const at = pick ?? spots[0]!;
        root.classList.toggle('below', at.down);
        root.style.left = `${at.left}px`;
        root.style.top = `${at.top}px`;
        root.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, b.left + b.width / 2 - base.left - at.left))}px`);
        return;
      }
      root.classList.remove('roomed');
      outside = false;
      // Above the target; below it when the HUD is in the way. A button in the upper half of a screen (the first card under
      // a tab title, UB-06) gets its bubble below, so the title stays readable; a tab of the bar — above.
      const inBar = button !== null && button.closest('#nav') !== null;
      // A place of the «Витрина» strip (portrait): the bubble under it, on the free floor — the «ВИТРИНА» head stays readable.
      const above = inBar || (y - r - 56 > deps.topInset() && (button === null || y > base.height * 0.45) && !(target.kind === 'slot' && base.height > base.width));
      const openSheet = inBar ? deps.panel.querySelector<HTMLElement>('.sheet[data-kind="dock"]:not([hidden]):not([data-sheet="home"])') : null;
      const key = `${hint.key ?? hint.step}:${Math.round(x)}:${Math.round(y)}:${Math.round(r)}:${above}:${text}:${openSheet?.dataset.sheet ?? ''}`;
      if (key === lastKey) return;
      lastKey = key;
      root.classList.remove('side', 'right');
      root.style.maxWidth = '';
      label.textContent = text;
      root.hidden = false;
      root.dataset.hint = hint.step;
      root.classList.toggle('below', !above);
      const w = root.offsetWidth;
      // W: on a short screen sideways (815×290) the band is the bubble and its gap only — the list keeps its rows.
      lower(openSheet, root.offsetHeight + (parent.closest('.short') ? 14 : 24));
      // Sideways a bubble of the scene stays over the scene — never on the list right of it.
      const stageW = !button && base.width > base.height ? parseFloat(getComputedStyle(parent).getPropertyValue('--stage-w')) || base.width : base.width;
      let left = Math.max(8, Math.min(stageW - w - 8, x - w / 2));
      const top0 = above ? y - r - 12 - root.offsetHeight : (button ? bottom : y + r) + 12;
      // Круг правок FB (сверка с макетом, правило 3): a bubble of the scene never lies on the places of the shelf — it moves aside
      // while its arrow still reaches the target.
      if (!button && a && a.slots.length) {
        // The frame of the shelf: its places, the 8 px around them and the outline.
        const pad = 12;
        const fx = Math.min(...a.slots.map((s) => s.x)) - pad + (canvas.left - base.left);
        const fy = Math.min(...a.slots.map((s) => s.y)) - pad + (canvas.top - base.top);
        const fr = Math.max(...a.slots.map((s) => s.x + s.w)) + pad + (canvas.left - base.left);
        const fb = Math.max(...a.slots.map((s) => s.y + s.h)) + pad + (canvas.top - base.top);
        if (fx < left + w && fr > left && fy < top0 + root.offsetHeight && fb > top0) {
          const right = fr + 8;
          const leftOf = fx - 8 - w;
          if (x >= right + 14 && right + w <= stageW - 8) left = right;
          else if (x <= leftOf + w - 14 && leftOf >= 8) left = leftOf;
        }
      }
      // Круг правок FB-3 п. 6: a place of the shelf — the bubble right of the shelf's frame, its arrow left at the pet: under the shelf it
      // would lie on the incubators («Покорми его тапами» over the egg). Too narrow a room keeps the old place.
      if (target.kind === 'slot' && a && a.slots.length) {
        const fr = Math.max(...a.slots.map((s) => s.x + s.w)) + 12 + (canvas.left - base.left);
        const from = fr + 14;
        const room = stageW - 8 - from;
        if (room >= 110) {
          root.classList.add('side', 'right');
          root.classList.remove('below');
          root.style.maxWidth = `${Math.floor(room)}px`;
          const hh = root.offsetHeight;
          const top = Math.max(deps.topInset() + 4, y - hh / 2);
          root.style.left = `${from}px`;
          root.style.top = `${top}px`;
          root.style.setProperty('--arrow-y', `${Math.max(14, Math.min(hh - 14, y - top))}px`);
          ring.hidden = r === 0;
          if (r > 0) {
            ring.style.left = `${x - r}px`;
            ring.style.top = `${y - r}px`;
            ring.style.width = ring.style.height = `${r * 2}px`;
          }
          setGlow(button);
          return;
        }
      }
      root.style.left = `${left}px`;
      root.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, x - left))}px`);
      let top = top0;
      // MU-12 (the usability recheck): a bubble over a tab of the bar never lies on the scene buttons above it
      // («Улучшения», «Подработка», the next goal) — it rises over them, the arrow still points down to the tab.
      if (inBar)
        for (let pass = 0; pass < 2; pass++)
          for (const el of parent.querySelectorAll<HTMLElement>('.stage-actions .stage-btn, .home-next .next')) {
            if (el.offsetParent === null) continue;
            const e = el.getBoundingClientRect();
            const t = top + base.top;
            if (e.left - base.left < left + w && e.right - base.left > left && e.top < t + root.offsetHeight && e.bottom > t) top = Math.min(top, e.top - base.top - 8 - root.offsetHeight);
          }
      root.style.top = `${top}px`;
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
