// What: the pause window: Resume, Settings and (by placement) the community buttons; holds the `menu` pause reason while open.
// Called by: src/main.ts (HUD pause button, Escape), src/ui/settings.ts (Back returns here).
// Keep: opening and closing go through open()/close() only, so the pause reason is always released.

import type { PauseManager } from '../core/pause.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';
import { renderCommunity, type CommunityLinks } from './community.ts';

export interface PauseWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
  toggle(): void;
}

export function createPauseWindow(parent: HTMLElement, pause: PauseManager, links: CommunityLinks | null, onSettings: () => void): PauseWindow {
  const overlay = createOverlay(parent, 'pause');
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
      overlay.hide();
      pause.resume('menu');
    },
    toggle() {
      if (overlay.isOpen()) win.close();
      else win.open();
    },
  };
  resume.addEventListener('click', win.close);
  settings.addEventListener('click', () => {
    overlay.hide();
    onSettings();
  });
  return win;
}
