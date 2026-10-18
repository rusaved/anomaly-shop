// What: a market lot with its seller chat (docs/01 §3 p. 14; M3-09, M3-10; MU-11 in the chat style of s2): «What about it?», «How are you?» + hobby discount, bargain slider, take it, bye.
// Called by: src/ui/market.ts (openLot) through src/main.ts.
// Keep: commands only through the game (buyLot, lotHobby, lotBargain); seller lines come from customers.json (character lines, hobbies) and i18n.

import type { CharacterData, HobbyData, RarityName } from '../content/schemas.ts';
import type { Game, LotView } from '../sim/game.ts';
import { esc, iconize, money, rarityBadge } from './kit.ts';

export interface SellerLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): 'ru' | 'en';
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  character(id: string): CharacterData | undefined;
  hobby(id: string): HobbyData | undefined;
  person(i: number): { name: string; f: boolean };
  /** The lowest «I'll take it for…» as a share of the asking price (market.json bargainFloor). */
  bargainFloor: number;
  /** M4-23: the market's mood chip for a species ('' when none). */
  mood(species: string): string;
}

/** Generic seller answers to «What about it?» (i18n seller.item.N). */
const ITEM_LINES = 3;

export function renderLot(body: HTMLElement, first: LotView, game: Game, look: SellerLookups, back: () => void): void {
  const lines: Array<{ me: boolean; text: string }> = [];
  const ch = look.character(first.character);
  const hobby = look.hobby(first.hobby);
  const say = (ctx: keyof CharacterData['lines'], n?: number): string => {
    const pool = ch?.lines[ctx] ?? [];
    const line = pool[Math.floor(Math.random() * pool.length)]?.[look.lang()] ?? '';
    return n === undefined ? line : line.replaceAll('{n}', `◉ ${new Intl.NumberFormat(look.lang()).format(n)}`);
  };
  let asked = false;
  let bargaining = false;
  let done: 'bought' | 'left' | null = null;
  lines.push({ me: false, text: say('greet') }, { me: false, text: look.t('seller.ask', { n: `◉ ${new Intl.NumberFormat(look.lang()).format(first.price)}` }) });

  const lot = (): LotView | undefined => game.market().lots.find((l) => l.id === first.id);
  // M4-09: like a buyer's chat (UB-10), the seller's opens on its latest lines — above the answers, not under them.
  function draw(): void {
    drawPage();
    const scroller = body.closest<HTMLElement>('.sheet-detail') ?? body;
    scroller.scrollTop = scroller.scrollHeight;
    const linesEl = body.querySelector<HTMLElement>('.chat-lines');
    if (linesEl) linesEl.scrollTop = linesEl.scrollHeight;
  }
  function drawPage(): void {
    const l = lot() ?? first;
    const fmt = new Intl.NumberFormat(look.lang());
    const p = look.person(l.person);
    const who = `${p.name} · ${ch ? (p.f && ch.nameF ? ch.nameF : ch.name)[look.lang()] : ''}`;
    // MU-11: the lot page like a chat (s2-chat-dialog): «‹ seller», the pet in its rarity, the lines, the answers at the bottom.
    body.innerHTML =
      `<div class="mu-back"><button type="button" class="mu-round" data-action="lot-back" aria-label="${esc(look.t('eggs.back'))}">‹</button><span class="chat-main"><b class="chat-who">${esc(who)}</b><span class="chat-last">${esc(look.t('market.seller', { who: p.name }))}</span></span></div>` +
      `<div class="price-pet lot-pet"><span class="mu-pic"><img alt="" src="${look.portrait(l.species, l.rarity)}"></span><div class="price-pet-text"><b class="mu-name">${esc(look.speciesName(l.species))}</b>` +
      `<span>${rarityBadge(l.rarity, look.t(`rarity.${l.rarity}`))}</span><span class="mu-meta">${esc(look.t('card.level', { n: l.level }))} · ${esc(look.t('price.marketWord'))} ${money(l.value, fmt)} · ${esc(look.t(`market.${l.verdict}`).toLowerCase())} ${look.mood(l.species)}</span></div></div>` +
      `<div class="chat-lines">${lines.map((x) => `<p class="bubble ${x.me ? 'me' : 'them'}">${iconize(x.text)}</p>`).join('')}</div><div class="chat-buttons lot-buttons"></div>`;
    body.querySelector('[data-action="lot-back"]')?.addEventListener('click', back);
    const buttons = body.querySelector('.chat-buttons') as HTMLElement;
    const add = (action: string, label: string, cls: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mu-btn ${cls}`;
      b.dataset.action = action;
      b.textContent = label;
      b.addEventListener('click', fn);
      buttons.appendChild(b);
    };
    if (done) {
      add('lot-back2', look.t('eggs.back'), '', back);
      return;
    }
    if (bargaining) {
      const min = Math.max(1, Math.floor(l.price * look.bargainFloor));
      const box = document.createElement('div');
      box.className = 'bargain';
      box.innerHTML = `<b data-bargain-n></b><input type="range" class="price-range" data-action="lot-slider" min="${min}" max="${l.price}" step="1" value="${Math.round((min + l.price) / 2)}">`;
      buttons.appendChild(box);
      const range = box.querySelector('input') as HTMLInputElement;
      const n = box.querySelector('[data-bargain-n]') as HTMLElement;
      const paint = (): void => {
        n.textContent = fmt.format(Number(range.value));
      };
      paint();
      range.addEventListener('input', paint);
      add('lot-offer', look.t('seller.offer'), 'main', () => {
        const want = Number(range.value);
        lines.push({ me: true, text: look.t('seller.me.take', { n: `◉ ${fmt.format(want)}` }) });
        const r = game.lotBargain(l.id, want);
        bargaining = false;
        if (r === 'yes') {
          lines.push({ me: false, text: say('accept') });
          done = 'bought';
        } else if (r === 'coins') lines.push({ me: false, text: look.t('seller.coins') });
        else lines.push({ me: false, text: say('refuse') });
        draw();
      });
      return;
    }
    add('lot-buy', look.t('market.take', { n: fmt.format(l.price) }), 'main', () => {
      if (game.buyLot(l.id)) {
        lines.push({ me: true, text: look.t('seller.me.now') }, { me: false, text: say('thanks') });
        done = 'bought';
      } else lines.push({ me: false, text: look.t('seller.coins') });
      draw();
    });
    add('lot-item', look.t('seller.me.item'), '', () => {
      lines.push({ me: true, text: look.t('seller.me.item') }, { me: false, text: look.t(`seller.item.${Math.floor(Math.random() * ITEM_LINES)}`) });
      draw();
    });
    if (!asked)
      add('lot-how', look.t('seller.me.how'), '', () => {
        asked = true;
        lines.push({ me: true, text: look.t('seller.me.how') }, { me: false, text: hobby?.line[look.lang()] ?? say('greet') });
        draw();
      });
    else if (!l.hobbyDone && hobby)
      add('lot-hobby', look.t('seller.me.hobby', { hobby: hobby.name[look.lang()].toLowerCase() }), '', () => {
        lines.push({ me: true, text: look.t('seller.me.hobby', { hobby: hobby.name[look.lang()].toLowerCase() }) });
        const off = game.lotHobby(l.id);
        const now = lot()?.price ?? l.price;
        lines.push({ me: false, text: off > 0 ? look.t('seller.discount', { n: `◉ ${fmt.format(now)}` }) : say('greet') });
        draw();
      });
    if (!l.bargained)
      add('lot-bargain', look.t('seller.me.bargain'), '', () => {
        bargaining = true;
        draw();
      });
    add('lot-bye', look.t('seller.me.bye'), '', () => {
      lines.push({ me: true, text: look.t('seller.me.bye') }, { me: false, text: say('bye') });
      done = 'left';
      draw();
    });
  }
  draw();
}
