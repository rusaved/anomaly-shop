// What: the Chats tab (docs/01 §3 p. 13; M3-08): a messenger — the list of buyers who wrote, a dialog with the creature card and answer buttons.
// Called by: src/main.ts (create once into its sheet; render on every commit while the sheet is open); the nav badge counts unread chats.
// Keep: buyers' lines come from customers.json (character lines by context), the player's from i18n; commands only through the game.

import type { CharacterData, RarityName } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import type { Chat, ChatLine } from '../sim/state.ts';
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
}

export interface ChatsTab {
  render(): void;
  /** Opens one chat (by the creature it is about), or the list with null. */
  show(uid: string | null): void;
}

export function createChatsTab(sheet: Sheet, game: Game, look: ChatsLookups): ChatsTab {
  const root = document.createElement('div');
  root.className = 'chats';
  sheet.body.appendChild(root);
  let open: number | null = null;
  let key = '';

  const fmt = (): Intl.NumberFormat => new Intl.NumberFormat(look.lang());
  const who = (c: Chat): string => {
    // The golden buyer of the event has no name of their own (UB-05: they write like everyone else).
    if (c.person < 0) return look.t('customer.golden');
    const p = look.person(c.person);
    const ch = look.character(c.character);
    const type = ch ? (p.f && ch.nameF ? ch.nameF : ch.name)[look.lang()] : '';
    return `${p.name} · ${type}`;
  };
  const text = (c: Chat, l: ChatLine): string => {
    const n = l.n !== undefined ? fmt().format(l.n) : '';
    if (l.from === 'me') return look.t(`chats.me.${l.ctx}`, { n });
    const pool = (look.character(c.character)?.lines as Record<string, Array<Record<'ru' | 'en', string>>> | undefined)?.[l.ctx];
    return (pool?.[l.i] ?? pool?.[0])?.[look.lang()]?.replace('{n}', n) ?? '';
  };
  const avatar = (c: Chat): string => `<span class="chat-avatar" style="background:${look.avatarColor(Math.max(0, c.person))}">${who(c).slice(0, 1)}</span>`;

  function renderList(): void {
    const chats = game.chats();
    const next = `l:${look.lang()}:${chats.map((c) => `${c.id}.${c.state}.${c.unread}.${c.lines.length}`).join(',')}`;
    if (next === key) return;
    key = next;
    if (!chats.length) {
      root.innerHTML = `<p class="empty">${look.t('chats.empty')}</p>`;
      return;
    }
    root.replaceChildren(
      ...chats.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `chat-row${c.unread ? ' unread' : ''}${c.state === 'open' ? '' : ' closed'}`;
        b.dataset.chat = String(c.id);
        b.innerHTML = `${avatar(c)}<span class="chat-main"><b class="chat-who"></b><span class="chat-last"></span></span><img alt="" src="${look.portrait(c.species, look.rarity(c.species))}">`;
        (b.querySelector('.chat-who') as HTMLElement).textContent = who(c);
        const last = c.lines[c.lines.length - 1];
        (b.querySelector('.chat-last') as HTMLElement).textContent = c.state === 'sold' ? look.t('chats.sold') : last ? text(c, last) : '';
        b.addEventListener('click', () => {
          open = c.id;
          key = '';
          game.chatRead(c.id);
          tab.render();
        });
        return b;
      }),
    );
  }

  function renderDialog(id: number): void {
    const c = game.chats().find((x) => x.id === id);
    if (!c) {
      open = null;
      key = '';
      renderList();
      return;
    }
    // Q-025: the creature of an open chat is off the shelf («talking»); a closed one may be back on the shelf or in the inventory.
    const view = game.view();
    const cr = [...view.talking, ...view.creatures, ...view.inventory].find((x) => x.uid === c.uid);
    const next = `d:${id}:${look.lang()}:${c.state}:${c.lines.length}:${c.offer}:${cr?.ask ?? ''}`;
    if (next === key) return;
    key = next;
    const f = fmt();
    const rarity = look.rarity(c.species);
    root.innerHTML =
      `<button type="button" class="eggs-back" data-action="chat-back">‹ ${look.t('eggs.back')}</button>` +
      `<div class="chat-head">${avatar(c)}<b class="chat-who"></b></div>` +
      `<div class="chat-item"><span class="card-pic"><img alt="" src="${look.portrait(c.species, rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(rarity)}"></i></span>` +
      `<span><b class="chat-item-name"></b><br><span class="card-sub">${cr ? look.t('chats.ask', { n: f.format(cr.ask) }) : ''}</span></span></div>` +
      `<div class="chat-lines">${c.lines.map((l) => `<p class="bubble ${l.from === 'me' ? 'me' : 'them'}"></p>`).join('')}</div>` +
      '<div class="chat-buttons"></div>';
    (root.querySelector('.chat-who') as HTMLElement).textContent = who(c);
    (root.querySelector('.chat-item-name') as HTMLElement).textContent = look.speciesName(c.species);
    root.querySelectorAll<HTMLElement>('.bubble').forEach((el, i) => {
      el.textContent = text(c, c.lines[i]!);
    });
    root.querySelector('[data-action="chat-back"]')?.addEventListener('click', () => {
      open = null;
      key = '';
      tab.render();
    });
    const buttons = root.querySelector('.chat-buttons') as HTMLElement;
    if (c.state !== 'open') {
      buttons.innerHTML = `<p class="card-sub">${look.t(c.state === 'sold' ? 'chats.sold' : 'chats.gone')}</p>`;
      return;
    }
    const add = (action: string, label: string, cls: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.dataset.action = action;
      b.textContent = label;
      b.addEventListener('click', fn);
      buttons.appendChild(b);
    };
    add('chat-sell', look.t('chats.sell', { n: f.format(c.offer) }), 'btn-primary', () => game.chatSell(c.id));
    // UB-06: no counter price in the first deal (customers.json chat.firstCounter) nor with the golden buyer.
    if (game.canCounter(c.id) && cr && cr.ask > c.offer) add('chat-counter', look.t('chats.counter', { n: f.format(cr.ask) }), 'btn-alt', () => game.chatCounter(c.id));
    add('chat-decline', look.t('chats.decline'), 'btn-alt', () => game.chatDecline(c.id));
  }

  const tab: ChatsTab = {
    render() {
      sheet.setTitle(look.t('nav.chats'));
      if (open !== null) {
        game.chatRead(open);
        renderDialog(open);
      } else renderList();
    },
    show(uid) {
      open = uid ? (game.chats().find((c) => c.uid === uid && c.state === 'open')?.id ?? null) : null;
      key = '';
      tab.render();
    },
  };
  return tab;
}
