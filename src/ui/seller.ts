// What: a market lot card (docs/01 §3 p. 14; M3-09): the creature, its market value and verdict, «Take it now»; the seller chat grows here in M3-10.
// Called by: src/ui/market.ts (openLot) through src/main.ts.
// Keep: commands only through the game (buyLot); seller lines come from customers.json (character lines and hobbies).

import type { CharacterData, RarityName } from '../content/schemas.ts';
import type { Game, LotView } from '../sim/game.ts';

export interface SellerLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): 'ru' | 'en';
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  character(id: string): CharacterData | undefined;
  person(i: number): { name: string; f: boolean };
}

export function renderLot(body: HTMLElement, lot: LotView, game: Game, look: SellerLookups, back: () => void): void {
  const fmt = new Intl.NumberFormat(look.lang());
  const p = look.person(lot.person);
  const ch = look.character(lot.character);
  const who = `${p.name} · ${ch ? (p.f && ch.nameF ? ch.nameF : ch.name)[look.lang()] : ''}`;
  body.innerHTML =
    `<button type="button" class="eggs-back" data-action="lot-back">‹ ${look.t('eggs.back')}</button>` +
    `<div class="egg-hero"><img alt="" src="${look.portrait(lot.species, lot.rarity)}"><div><h3 class="egg-name"></h3>` +
    `<p class="card-sub"><i class="rarity-dot" style="background:${look.rarityColor(lot.rarity)}"></i> ${look.t(`rarity.${lot.rarity}`)} · ${look.t('card.level', { n: lot.level })}</p>` +
    `<p class="card-sub">${look.t('price.marketIs', { n: fmt.format(lot.value) })} · <span class="verdict v-${lot.verdict}">${look.t(`market.${lot.verdict}`)}</span></p></div></div>` +
    `<p class="card-sub" data-seller></p>` +
    `<div class="egg-buy"><button type="button" class="btn btn-primary" data-action="lot-buy">${look.t('market.take', { n: fmt.format(lot.price) })}</button></div>`;
  (body.querySelector('.egg-name') as HTMLElement).textContent = look.speciesName(lot.species);
  (body.querySelector('[data-seller]') as HTMLElement).textContent = look.t('market.seller', { who });
  body.querySelector('[data-action="lot-back"]')?.addEventListener('click', back);
  body.querySelector('[data-action="lot-buy"]')?.addEventListener('click', () => {
    if (game.buyLot(lot.id)) back();
  });
}
