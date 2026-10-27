// What: the settings window: sound, music (P-07) and the buzz on/off (switches), language (Русский / English, LOC-05), the shop name (M6-23), promo code, community, Back.
// Called by: src/main.ts; opened from the pause window and returns to it.
// Keep: sound and language live in the save (settings.sound, settings.lang); the window never holds a pause reason of its own.

import type { GameStore } from '../sim/store.ts';
import type { I18n } from './i18n.ts';
import type { LangName } from '../content/schemas.ts';
import { button, closeX, createOverlay, type Overlay } from './overlay.ts';
import { renderCommunity, type CommunityLinks } from './community.ts';

export interface SettingsWindow {
  overlay: Overlay;
  open(): void;
  close(): void;
}

/** M6-23: the shop's name field. */
export interface ShopNameField {
  name(): string;
  save(text: string): 'ok' | 'empty' | 'long' | 'blocked';
  maxLength: number;
}

export function createSettingsWindow(
  parent: HTMLElement,
  store: GameStore,
  i18n: I18n,
  links: CommunityLinks | null,
  onBack: () => void,
  redeem?: (code: string) => 'ok' | 'used' | 'unknown',
  shopName?: ShopNameField,
): SettingsWindow {
  const overlay = createOverlay(parent, 'settings', () => win.close(), { over: ['pause'], dismiss: () => overlay.hide() });
  const title = document.createElement('h2');
  title.dataset.i18n = 'settings.title';

  // Круг правок FB п. 5: sound and the buzz are the same on/off switch (role switch), not a filled slab; the label names it.
  const toggleRow = (action: string, labelKey: string, on: boolean, flip: (next: boolean) => void): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'row row-switch';
    const label = document.createElement('span');
    label.dataset.i18n = labelKey;
    const sw = button(action, labelKey, 'btn-switch');
    sw.dataset.i18nAttr = 'aria-label';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(on));
    sw.addEventListener('click', () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      flip(next);
    });
    row.append(label, sw);
    return row;
  };
  const soundRow = toggleRow('sound', 'settings.sound', store.state.settings.sound, (next) => {
    store.state.settings.sound = next;
    store.commit();
  });
  // P-07: the music on and off apart from the sounds.
  const musicRow = toggleRow('music', 'settings.music', store.state.settings.music !== false, (next) => {
    store.state.settings.music = next;
    store.commit();
  });
  // One row «Звук · Музыка»: the window keeps its height on a short screen (812×330, the 130 % font).
  soundRow.classList.add('row-pair');
  soundRow.append(...musicRow.childNodes);
  // FB-13: the buzz of the main buttons (Android; a phone without it never shows the row).
  const vibRow = toggleRow('vibrate', 'settings.vibrate', store.state.settings.vibrate !== false, (next) => {
    store.state.settings.vibrate = next;
    store.commit();
  });
  vibRow.hidden = typeof navigator.vibrate !== 'function';

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

  // Promo code (M3-13): a field and «Apply»; a wrong code gets a soft answer.
  const codeRow = document.createElement('div');
  codeRow.className = 'row code-row';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.className = 'code-input';
  codeInput.dataset.action = 'code-input';
  codeInput.maxLength = 20;
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  codeInput.dataset.i18n = 'code.placeholder';
  codeInput.dataset.i18nAttr = 'placeholder';
  const codeApply = button('code-apply', 'code.apply');
  const codeAnswer = document.createElement('p');
  codeAnswer.className = 'code-answer';
  codeAnswer.dataset.codeAnswer = '';
  codeApply.addEventListener('click', () => {
    if (!redeem || !codeInput.value.trim()) return;
    const r = redeem(codeInput.value);
    codeAnswer.textContent = i18n.t(`code.${r}`);
    codeAnswer.dataset.codeAnswer = r;
    if (r === 'ok') codeInput.value = '';
  });
  codeRow.append(codeInput, codeApply);

  // M6-23 (01b §5.8): the shop's name — a field («Shop name» inside it), «Save» and a soft answer; the name lives in the save.
  const nameRow = document.createElement('div');
  nameRow.className = 'row code-row name-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'code-input';
  nameInput.dataset.action = 'shopname-input';
  nameInput.maxLength = (shopName?.maxLength ?? 20) + 10;
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.dataset.i18n = 'shopname.placeholder';
  nameInput.dataset.i18nAttr = 'placeholder';
  const nameSave = button('shopname-save', 'shopname.save');
  const nameAnswer = document.createElement('p');
  nameAnswer.className = 'code-answer';
  nameAnswer.dataset.nameAnswer = '';
  nameSave.addEventListener('click', () => {
    if (!shopName) return;
    const r = shopName.save(nameInput.value);
    nameAnswer.textContent = i18n.t(`shopname.${r}`, { n: shopName.maxLength });
    nameAnswer.dataset.nameAnswer = r;
  });
  nameRow.append(nameInput, nameSave);
  // Sideways the window has no room for one more row (круг правок FB п. 5: no scroll at 812×330): «✎ Shop name» by the title swaps
  // the communities for the field while the player types (CSS .naming); upright the field is simply there and this button is hidden.
  const nameEdit = button('shopname-edit', 'shopname.edit', 'name-edit');
  nameEdit.addEventListener('click', () => {
    overlay.card.classList.toggle('naming');
    if (overlay.card.classList.contains('naming')) nameInput.focus();
  });

  // MU-09: no second main button — «Назад» is dark, the ✕ does the same.
  const back = button('back', 'settings.back');
  // V-04: one language (VK and OK: Russian only) — no language row.
  langRow.hidden = __GAME__.languages.length < 2;
  overlay.card.append(title, soundRow, vibRow, langRow);
  if (shopName) overlay.card.append(nameEdit, nameRow, nameAnswer);
  if (redeem) overlay.card.append(codeRow, codeAnswer);
  renderCommunity(overlay.card, links, 'settings');

  const win: SettingsWindow = {
    overlay,
    open() {
      overlay.card.classList.remove('naming');
      // V-04: the sound may have changed elsewhere (the VK menu) — the switch shows the saved state.
      soundRow.querySelector('[data-action=sound]')?.setAttribute('aria-checked', String(store.state.settings.sound));
      soundRow.querySelector('[data-action=music]')?.setAttribute('aria-checked', String(store.state.settings.music !== false));
      if (shopName) {
        nameInput.value = shopName.name();
        nameAnswer.textContent = '';
        nameAnswer.dataset.nameAnswer = '';
      }
      overlay.show();
    },
    close() {
      overlay.hide();
      onBack();
    },
  };
  back.addEventListener('click', win.close);
  closeX(overlay.card, '✕', () => win.close(), 'settings-close');
  return win;
}
