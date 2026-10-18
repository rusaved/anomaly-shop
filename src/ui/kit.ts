// What: the MU kit (docs/07-mobile-ui.md): the rarity component (frame, badge, ring, word), the coin and crystal icons, money, safe text.
// Called by: every screen and window module that shows a pet, a price or a reward (inventory, sales, market, chats, eggs, hatch, gifts, shop).
// Keep: one look for one thing — rarity by word and color through data-rarity (mu.css), prices with the one coin picture; HTML is escaped here.

import type { RarityName } from '../content/schemas.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text safe for innerHTML. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

export const COIN = '<span class="mu-coin" aria-hidden="true"></span>';
export const GEM = '<span class="mu-gem" aria-hidden="true"></span>';

/** Escaped text where ◉ becomes the coin picture and ◆ the crystal one (07: no font glyph for money). */
export function iconize(text: string): string {
  return esc(text).replaceAll('◉', COIN).replaceAll('◆', GEM);
}

/** «◉ 1 200» or «◆ 3» as one unbreakable piece. */
export function money(n: number, fmt: Intl.NumberFormat, crystals = false): string {
  return `<span class="mu-money">${crystals ? GEM : COIN}<b>${fmt.format(n)}</b></span>`;
}

/** The rarity badge: a dot and the word in the rarity color (docs/07, rarity). */
export function rarityBadge(rarity: RarityName, word: string): string {
  return `<span class="rar-badge" data-rarity="${rarity}">${esc(word)}</span>`;
}

/** The pet picture with the ring of its rarity (chats, rows, the showcase). */
export function ringPic(src: string, rarity: RarityName, size: number, cls = ''): string {
  return `<span class="rar-ring${cls ? ` ${cls}` : ''}" data-rarity="${rarity}" style="width:${size}px;height:${size}px"><img alt="" src="${src}"></span>`;
}

/** The rarity word of the hatch window: 15 px capitals in the rarity color. */
export function rarityWord(rarity: RarityName, word: string): string {
  return `<span class="rar-word" data-rarity="${rarity}">${esc(word)}</span>`;
}
