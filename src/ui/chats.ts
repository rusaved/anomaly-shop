// What: the Chats tab (docs/01 §3 p. 13; MU-05 by s2-chat-list, s2-chat-dialog, l2): rows of 60 px, a dialog on the whole screen with «Продать за N» over the tab bar.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open); the nav badge counts unread chats.
// Keep: buyers' lines come from customers.json (character lines by context), the player's from i18n; commands only through the game; one way back («‹»).

import type { CharacterData, RarityName } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import type { Chat, ChatLine } from '../sim/state.ts';
import { esc, iconize, money, ringPic } from './kit.ts';
import type { Sheet } from './sheet.ts';

export interface ChatsLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): 'ru' | 'en';
  character(id: string): CharacterData | undefined;
  person(i: number): { name: string; f: boolean };
  speciesName(id: string): string;
  rarity(species: string): RarityName;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  /** A color for the buyer's avatar (style.json people outfits). */
  avatarColor(i: number): string;
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
  /** l2: sideways the list and the dialog stand side by side. */
  wide(): boolean;
}

export interface ChatsTab {
  render(): void;
  /** Opens one chat (by the creature it is about), or the list with null. */
  show(uid: string | null): void;
}

export function createChatsTab(sheet: Sheet, game: Game, look: ChatsLookups): ChatsTab {
  const root = document.createElement('div');
  root.className = 'chats';
  root.innerHTML = '<div class="chat-list" data-chat-list></div><div class="chat-dialog" data-chat-dialog></div>';
  sheet.body.appendChild(root);
  sheet.root.classList.add('sheet-fixed');
  const listEl = root.querySelector('[data-chat-list]') as HTMLElement;
  const dialogEl = root.querySelector('[data-chat-dialog]') as HTMLElement;
  let open: number | null = null;
  let listKey = '';
  let dialogKey = '';

  const fmt = (): Intl.NumberFormat => new Intl.NumberFormat(look.lang());
  const who = (c: Chat): string => {
    // The golden buyer of the event has no name of their own (UB-05: they write like everyone else).
    if (c.person < 0) return look.t('customer.golden');
    const p = look.person(c.person);
    const ch = look.character(c.character);
    const type = ch ? (p.f && ch.nameF ? ch.nameF : ch.name)[look.lang()] : '';
    return `${p.name} · ${type}`;
  };
  /** A line with the coin picture before every sum (07 «Знаки»: the coin icon in chat lines too). */
  const text = (c: Chat, l: ChatLine): string => {
    const n = l.n !== undefined ? `◉ ${fmt().format(l.n)}` : '';
    if (l.from === 'me') return iconize(look.t(`chats.me.${l.ctx}`, { n }));
    const pool = (look.character(c.character)?.lines as Record<string, Array<Record<'ru' | 'en', string>>> | undefined)?.[l.ctx];
    return iconize((pool?.[l.i] ?? pool?.[0])?.[look.lang()]?.replaceAll('{n}', n) ?? '');
  };
  const avatar = (c: Chat, size: number): string =>
    `<span class="chat-avatar" style="background:${look.avatarColor(Math.max(0, c.person))};width:${size}px;height:${size}px">${esc(who(c).slice(0, 1))}</span>`;

  function renderList(): void {
    const chats = game.chats();
    const next = `l:${look.lang()}:${open}:${chats.map((c) => `${c.id}.${c.state}.${c.unread}.${c.lines.length}`).join(',')}`;
    if (next === listKey) return;
    listKey = next;
    const fresh = chats.filter((c) => c.unread).length;
    const head = `<div class="mu-head"><h3>${esc(look.t('nav.chats'))}</h3><span>${fresh ? esc(look.t(`chats.new.${new Intl.PluralRules(look.lang()).select(fresh)}`, { n: fresh })) : ''}</span></div>`;
    if (!chats.length) {
      listEl.innerHTML = `${head}<p class="empty">${esc(look.t('chats.empty'))}</p>`;
      return;
    }
    listEl.innerHTML =
      head +
      chats
        .map((c) => {
          const last = c.lines[c.lines.length - 1];
          const line = c.state === 'sold' ? `${esc(look.t('chats.sold'))}${last?.n !== undefined ? ` · ${money(last.n, fmt())}` : ''}` : last ? text(c, last) : '';
          const r = look.rarity(c.species);
          return (
            `<button type="button" class="chat-row${c.unread ? ' unread' : ''}${c.state === 'open' ? '' : ' closed'}${c.id === open ? ' active' : ''}" data-chat="${c.id}">` +
            `${avatar(c, 44)}<span class="chat-main"><b class="chat-who">${esc(who(c))}</b><span class="chat-last">${line}</span></span>${ringPic(look.portrait(c.species, r), r, 52, 'chat-pet')}</button>`
          );
        })
        .join('');
    listEl.querySelectorAll<HTMLElement>('[data-chat]').forEach((b) =>
      b.addEventListener('click', () => {
        open = Number(b.dataset.chat);
        game.chatRead(open);
        listKey = '';
        dialogKey = '';
        tab.render();
      }),
    );
  }

  function renderDialog(id: number): void {
    const c = game.chats().find((x) => x.id === id);
    if (!c) {
      open = null;
      dialogEl.innerHTML = '';
      return;
    }
    // Q-025: the creature of an open chat is off the shelf («talking»); a closed one may be back on the shelf or in the inventory.
    const view = game.view();
    const cr = [...view.talking, ...view.creatures, ...view.inventory].find((x) => x.uid === c.uid);
    const next = `d:${id}:${look.lang()}:${c.state}:${c.lines.length}:${c.offer}:${cr?.ask ?? ''}`;
    if (next === dialogKey) return;
    dialogKey = next;
    const f = fmt();
    const rarity = look.rarity(c.species);
    const canCounter = c.state === 'open' && game.canCounter(c.id) && cr !== undefined && cr.ask > c.offer;
    let buttons: string;
    if (c.state !== 'open') buttons = `<p class="mu-meta chat-end">${esc(look.t(c.state === 'sold' ? 'chats.sold' : 'chats.gone'))}</p>`;
    else
      buttons =
        `<button type="button" class="mu-btn main" data-action="chat-sell">${iconize(look.t('chats.sell', { n: `◉ ${f.format(c.offer)}` }))}</button>` +
        // UB-06: no counter price in the first deal (customers.json chat.firstCounter) nor with the golden buyer.
        `<div class="chat-row2">${canCounter ? `<button type="button" class="mu-btn" data-action="chat-counter">${iconize(look.t('chats.counter', { n: `◉ ${f.format(cr.ask)}` }))}</button>` : ''}` +
        `<button type="button" class="mu-btn" data-action="chat-decline">${esc(look.t('chats.decline'))}</button></div>`;
    dialogEl.innerHTML =
      `<div class="mu-back chat-top">${look.wide() ? '' : `<button type="button" class="mu-round" data-action="chat-back" aria-label="${esc(look.t('eggs.back'))}">‹</button>`}` +
      `${avatar(c, 44)}<span class="chat-main"><b class="chat-who">${esc(who(c))}</b><span class="chat-last">${esc(look.t('chats.wants', { name: look.speciesName(c.species) }))}</span></span>` +
      `<span class="chat-ask" data-rarity="${rarity}">${ringPic(look.portrait(c.species, rarity), rarity, 28)}${cr ? money(cr.ask, f) : ''}</span></div>` +
      `<div class="chat-lines">${c.lines.map((l) => `<p class="bubble ${l.from === 'me' ? 'me' : 'them'}">${text(c, l)}</p>`).join('')}</div>` +
      `<div class="chat-buttons" data-hint-glow>${buttons}</div>`;
    dialogEl.querySelector('[data-action="chat-back"]')?.addEventListener('click', () => tab.show(null));
    dialogEl.querySelector('[data-action="chat-sell"]')?.addEventListener('click', () => game.chatSell(c.id));
    dialogEl.querySelector('[data-action="chat-counter"]')?.addEventListener('click', () => game.chatCounter(c.id));
    dialogEl.querySelector('[data-action="chat-decline"]')?.addEventListener('click', () => game.chatDecline(c.id));
    // UB-10: a chat opens on its latest lines.
    const lines = dialogEl.querySelector('.chat-lines') as HTMLElement;
    lines.scrollTop = lines.scrollHeight;
  }

  const tab: ChatsTab = {
    render() {
      sheet.setTitle(look.t('nav.chats'));
      // l2: sideways the newest open chat stands open next to the list.
      if (open === null && look.wide()) open = game.chats().find((c) => c.state === 'open')?.id ?? game.chats()[0]?.id ?? null;
      root.classList.toggle('has-open', open !== null);
      if (open !== null) {
        game.chatRead(open);
        renderDialog(open);
      } else {
        dialogEl.innerHTML = '';
        dialogKey = '';
      }
      renderList();
    },
    show(uid) {
      open = uid ? (game.chats().find((c) => c.uid === uid && c.state === 'open')?.id ?? null) : null;
      listKey = '';
      dialogKey = '';
      tab.render();
    },
  };
  return tab;
}
