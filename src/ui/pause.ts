// What: the pause window: Resume, Settings and (by placement) the community buttons; holds the `menu` pause reason while open.
// Called by: src/main.ts (HUD pause button, Escape), src/ui/settings.ts (Back returns here).
// Keep: opening and closing go through open()/close() only, so the pause reason is always released.

import type { PauseManager } from '../core/pause.ts';
import { button, closeX, createOverlay, type Overlay } from './overlay.ts';
import { renderCommunity, type CommunityLinks } from './community.ts';

export interface PauseWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
  toggle(): void;
}

export function createPauseWindow(parent: HTMLElement, pause: PauseManager, links: CommunityLinks | null, onSettings: () => void): PauseWindow {
  // UB-02: a popup; a tap outside or a tab tap resumes the game (the pause reason is always released).
  const overlay = createOverlay(parent, 'pause', () => win.close(), { dismiss: () => win.close() });
  const title = document.createElement('h2');
  title.dataset.i18n = 'pause.title';
  const resume = button('resume', 'pause.resume', 'btn-primary');
  const settings = button('settings', 'pause.settings');
  overlay.card.append(title, resume, settings);
  renderCommunity(overlay.card, links, 'pause');

  const win: PauseWindow = {
    overlay,
    open() {
      if (overlay.isOpen()) return;
      pause.pause('menu');
      overlay.show();
    },
    close() {
      overlay.root.classList.remove('under');
      overlay.hide();
      pause.resume('menu');
    },
    toggle() {
      if (overlay.isOpen()) win.close();
      else win.open();
    },
  };
  resume.addEventListener('click', win.close);
  // MU-09 (s6-pause): the ✕ resumes as well.
  closeX(overlay.card, '✕', () => win.close(), 'pause-close');
  // Settings open over the pause (it stays open underneath, hidden, holding the game).
  settings.addEventListener('click', () => {
    overlay.root.classList.add('under');
    onSettings();
  });
  return win;
}
