// What: the settings window: sound on/off, language (Русский / English, LOC-05), community buttons by placement, Back.
// Called by: src/main.ts; opened from the pause window and returns to it.
// Keep: sound and language live in the save (settings.sound, settings.lang); the window never holds a pause reason of its own.

import type { GameStore } from '../sim/store.ts';
import type { I18n } from './i18n.ts';
import type { LangName } from '../content/schemas.ts';
import { button, createOverlay, type Overlay } from './overlay.ts';
import { renderCommunity, type CommunityLinks } from './community.ts';

export interface SettingsWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
}

export function createSettingsWindow(parent: HTMLElement, store: GameStore, i18n: I18n, links: CommunityLinks | null, onBack: () => void): SettingsWindow {
  const overlay = createOverlay(parent, 'settings', () => win.close());
  const title = document.createElement('h2');
  title.dataset.i18n = 'settings.title';

  const soundRow = document.createElement('div');
  soundRow.className = 'row';
  const soundLabel = document.createElement('span');
  soundLabel.dataset.i18n = 'settings.sound';
  const sound = button('sound', store.state.settings.sound ? 'settings.on' : 'settings.off', 'btn-toggle');
  sound.setAttribute('aria-pressed', String(store.state.settings.sound));
  sound.addEventListener('click', () => {
    const next = !store.state.settings.sound;
    store.state.settings.sound = next;
    store.commit();
    sound.dataset.i18n = next ? 'settings.on' : 'settings.off';
    sound.setAttribute('aria-pressed', String(next));
    i18n.apply(sound.parentElement ?? sound);
  });
  soundRow.append(soundLabel, sound);

  const langRow = document.createElement('div');
  langRow.className = 'row';
  const langLabel = document.createElement('span');
  langLabel.dataset.i18n = 'settings.language';
  const langGroup = document.createElement('div');
  langGroup.className = 'group';
  const langButtons = new Map<LangName, HTMLButtonElement>();
  for (const lang of __GAME__.languages) {
    const b = button(`lang-${lang}`, `lang.${lang}`, 'btn-toggle');
    b.addEventListener('click', () => i18n.setLanguage(lang));
    langButtons.set(lang, b);
    langGroup.appendChild(b);
  }
  const markLang = (): void => {
    for (const [lang, b] of langButtons) b.setAttribute('aria-pressed', String(lang === i18n.lang()));
  };
  markLang();
  i18n.onChange(markLang);
  langRow.append(langLabel, langGroup);

  const back = button('back', 'settings.back', 'btn-primary');
  overlay.card.append(title, soundRow, langRow);
  renderCommunity(overlay.card, links, 'settings');
  overlay.card.appendChild(back);

  const win: SettingsWindow = {
    overlay,
    open() {
      overlay.show();
    },
    close() {
      overlay.hide();
      onBack();
    },
  };
  back.addEventListener('click', win.close);
  return win;
}
