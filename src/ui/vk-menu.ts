// What: the start menu of the VK and OK build (V-04): «Играть · Звук · Помощь» (and the settings), open at launch and from the top bar's menu button on any screen; «Помощь» — how to play, the community (VK) or group (OK) as the support channel, the terms and privacy.
// Called by: src/main.ts (vk build only, behind __PLATFORM__ === 'vk').
// Keep: texts from content/vk.json by site (OK never names VK and back); the menu holds the `menu` pause reason while open; no external link — the documents live next to the game.

import type { PauseManager } from '../core/pause.ts';
import type { VkSite } from '../platform/types.ts';
import * as vkContent from '../content/vk.ts';
import { vkText } from '../content/vk.ts';
import { esc } from './kit.ts';
import { createOverlay, dismissAll, type Overlay } from './overlay.ts';
import './vk.css';

export { vkContent };

/** V-10: the terms and the privacy page live on the same site, one level over the game (Pages: /legal/ next to /vk/). */
export function legalBase(): string {
  return '../legal/';
}

/** V-04: the top bar's gear becomes the menu button (three lines) — the way back to the menu from any screen. */
export function menuButton(b: HTMLButtonElement, label: string): void {
  b.dataset.action = 'menu';
  b.removeAttribute('data-i18n');
  b.removeAttribute('data-i18n-attr');
  b.setAttribute('aria-label', label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
}

/** V-07: «Загрузка N%» under the spinner of the preloader. */
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
  p.textContent = vkText(site, 'boot.loading', { n: Math.round(n) });
}

export interface VkMenuDeps {
  site: VkSite;
  pause: PauseManager;
  sound(): boolean;
  setSound(on: boolean): void;
  openSettings(): void;
  /** The platform's «join» window (the gift is given by the caller); null — the community id is not filled yet. */
  join: (() => Promise<void>) | null;
  /** The documents next to the game (../legal/ of the Pages site). */
  legalBase: string;
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
      // Two columns sideways (a phone lying in a browser is 290 px high): how to play | support, documents, back.
      overlay.card.innerHTML =
        `<h2>${vt('help.title')}</h2><div class="menu-cols"><ul class="menu-how">${how}</ul><div class="menu-side">` +
        `<p class="mu-meta">${vt('help.support')}</p>` +
        (d.join ? `<button type="button" class="mu-btn" data-action="menu-join">${vt('join.button')}</button>` : '') +
        `<p class="menu-legal"><a href="${d.legalBase}terms.html" target="_blank" rel="noopener" data-action="menu-terms">${vt('help.terms')}</a>` +
        `<a href="${d.legalBase}privacy.html" target="_blank" rel="noopener" data-action="menu-privacy">${vt('help.privacy')}</a></p>` +
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
    on('menu-join', () => void d.join?.());
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
