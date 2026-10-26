// What: the start menu of the VK and OK build (V-04): «Играть · Звук · Помощь» (and the settings), open at launch and from the top bar's menu button on any screen; «Помощь» — how to play, the community (VK) or group (OK) as the support channel.
// Called by: src/main.ts (vk build only, behind __PLATFORM__ === 'vk').
// Keep: texts from content/vk.json by site (OK never names VK and back); the menu holds the `menu` pause reason while open; no link at all (P-06: VK 4.2.3, OK 5.1 — the documents are VK's own, chosen in the VK panel).

import type { PauseManager } from '../core/pause.ts';
import type { VkSite } from '../platform/types.ts';
import * as vkContent from '../content/vk.ts';
import { vkText } from '../content/vk.ts';
import { esc } from './kit.ts';
import { createOverlay, dismissAll, type Overlay } from './overlay.ts';
import './vk.css';

export { vkContent };

/** V-04: the top bar's gear becomes the menu button (three lines) — the way back to the menu from any screen. */
export function menuButton(b: HTMLButtonElement, label: string): void {
  b.dataset.action = 'menu';
  b.removeAttribute('data-i18n');
  b.removeAttribute('data-i18n-attr');
  b.setAttribute('aria-label', label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
}

/**
 * P-01: the menu button over the dim of any window — one tap closes the window its own way and opens the menu (the top bar's own
 * button lies under the dim). Shown by vk.css only while a window other than the menu is open.
 */
export function floatMenuButton(parent: HTMLElement, from: HTMLButtonElement, open: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `${from.className} vk-menu-float`;
  b.dataset.action = 'menu-float';
  b.setAttribute('aria-label', from.getAttribute('aria-label') ?? '');
  b.innerHTML = from.innerHTML;
  b.addEventListener('click', open);
  parent.appendChild(b);
  return b;
}

/**
 * V-07, P-01: «Загрузка N%» under the spinner. The loader of index.html (vite.config.ts, vkBootPlugin) counts the bytes of the code
 * from the first one up to __BOOT_BASE__ %; the start of the game (n of 100) fills the rest. The number never goes back.
 */
export function bootProgress(site: VkSite, n: number): void {
  const pre = document.getElementById('preloader');
  if (!pre) return;
  let p = pre.querySelector<HTMLElement>('[data-boot-progress]');
  if (!p) {
    p = document.createElement('p');
    p.dataset.bootProgress = '';
    p.className = 'boot-progress';
    pre.appendChild(p);
  }
  const base = (window as { __BOOT_BASE__?: number }).__BOOT_BASE__ ?? 0;
  const pct = Math.round(base + (n * (100 - base)) / 100);
  if (pct < Number(p.dataset.bootProgress || 0)) return;
  p.dataset.bootProgress = String(pct);
  p.textContent = vkText(site, 'boot.loading', { n: pct });
}

export interface VkMenuDeps {
  site: VkSite;
  pause: PauseManager;
  sound(): boolean;
  setSound(on: boolean): void;
  openSettings(): void;
  /** The platform's «join» window (the gift is given by the caller); null — the community id is not filled yet. */
  join: (() => Promise<void>) | null;
  /** P-01: the gift for joining is taken — «Уже в сообществе (группе)» instead of the button. */
  joined(): boolean;
}

export interface VkMenu {
  overlay: Overlay;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function createVkMenu(parent: HTMLElement, d: VkMenuDeps): VkMenu {
  const vt = (key: string): string => esc(vkText(d.site, key));
  const overlay = createOverlay(parent, 'menu', () => menu.close(), { dismiss: () => menu.close() });
  overlay.card.classList.add('card-menu');
  let page: 'main' | 'help' = 'main';

  const render = (): void => {
    if (page === 'main') {
      overlay.card.innerHTML =
        `<h2>${vt('menu.title')}</h2>` +
        `<button type="button" class="mu-btn main" data-action="menu-play">${vt('menu.play')}</button>` +
        `<div class="menu-row"><button type="button" class="mu-btn" data-action="menu-sound" aria-pressed="${d.sound()}">${vt(d.sound() ? 'menu.soundOn' : 'menu.soundOff')}</button>` +
        `<button type="button" class="mu-btn" data-action="menu-help">${vt('menu.help')}</button>` +
        `<button type="button" class="mu-btn" data-action="menu-settings">${vt('menu.settings')}</button></div>`;
    } else {
      const how = ['help.how1', 'help.how2', 'help.how3', 'help.how4'].map((k) => `<li>${vt(k)}</li>`).join('');
      // Two columns sideways (a phone lying in a browser is 290 px high): how to play | support, back.
      overlay.card.innerHTML =
        `<h2>${vt('help.title')}</h2><div class="menu-cols"><ul class="menu-how">${how}</ul><div class="menu-side">` +
        `<p class="mu-meta">${vt('help.support')}</p>` +
        (d.join
          ? d.joined()
            ? `<button type="button" class="mu-btn off" data-action="menu-joined" aria-disabled="true">${vt('join.done')}</button>`
            : `<button type="button" class="mu-btn" data-action="menu-join">${vt('join.button')}</button>`
          : '') +
        `<button type="button" class="mu-btn main" data-action="menu-back">${vt('help.back')}</button></div></div>`;
    }
    const on = (action: string, fn: () => void): void => overlay.card.querySelector(`[data-action="${action}"]`)?.addEventListener('click', fn);
    on('menu-play', () => menu.close());
    on('menu-sound', () => {
      d.setSound(!d.sound());
      render();
    });
    on('menu-help', () => {
      page = 'help';
      overlay.card.dataset.page = 'help';
      render();
    });
    on('menu-settings', () => {
      menu.close();
      d.openSettings();
    });
    on('menu-join', () => void d.join?.().then(render));
    on('menu-back', () => {
      page = 'main';
      delete overlay.card.dataset.page;
      render();
    });
  };

  const menu: VkMenu = {
    overlay,
    open() {
      if (overlay.isOpen()) return;
      // From any screen: whatever is open closes its own way, the menu stands alone.
      dismissAll();
      page = 'main';
      delete overlay.card.dataset.page;
      render();
      d.pause.pause('menu');
      overlay.show();
    },
    close() {
      if (!overlay.isOpen()) return;
      overlay.hide();
      d.pause.resume('menu');
    },
    isOpen: () => overlay.isOpen(),
  };
  return menu;
}
