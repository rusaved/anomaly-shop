// What: the «Рынок» tab (docs/01 §3 p. 14; M3-09, M3-10; MU-10 by s8-market): lots of seller-characters 2 in a row, «price · verdict», the refresh timer.
// Called by: src/main.ts (create once into its sheet; render on every commit and each second while open).
// Keep: commands only through the game (buyLot); the lot page hosts the seller chat (src/ui/seller.ts); «Не ждать» comes back with the ads milestone (docs/допущения.md).

import type { RarityName } from '../content/schemas.ts';
import type { Game, LotView } from '../sim/game.ts';
import { esc, money, rarityBadge } from './kit.ts';
import type { Sheet } from './sheet.ts';

export interface MarketLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  /** The price range of the market as shares of the value (market.json price). */
  range: { min: number; max: number };
  /** Opens the seller chat for a lot (M3-10) inside the body (UB-02: the lot panel). */
  openLot(body: HTMLElement, lot: LotView, back: () => void): void;
}

export interface MarketTab {
  render(): void;
}

export function createMarketTab(sheet: Sheet, game: Game, look: MarketLookups): MarketTab {
  const root = document.createElement('div');
  root.className = 'market';
  sheet.body.appendChild(root);
  // The lot is an inner page of the tab with the seller chat: «‹» back to the lots.
  const close = (): void => {
    open = null;
    panel.hide();
  };
  const panel = sheet.detail('lot', close);
  let open: number | null = null;
  let key = '';
  const openLot = (l: LotView): void => {
    open = l.id;
    panel.show();
    look.openLot(panel.card, l, close);
  };

  function renderList(): void {
    const mk = game.market();
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const s = Math.ceil(mk.refreshIn);
    const timer = look.t('market.refresh', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    const next = `${look.lang()}:${timer}:${mk.lots.map((l) => `${l.id}.${l.sold}.${l.price}`).join(',')}:${Math.floor(coins)}`;
    if (next === key) return;
    key = next;
    // MU-10 (s8-market): lots 2 in a row in their rarity frames; «price · verdict» one plain line; «Купить» below or at the market, «Торг» above it.
    root.innerHTML =
      `<div class="mu-head"><h3>${esc(look.t('nav.market'))}</h3><span data-market-timer>${esc(timer)}</span></div>` +
      `<div class="mu-grid">${mk.lots
        .map((l) => {
          const haggle = l.verdict === 'above';
          const btn = l.sold
            ? `<button type="button" class="mu-btn off" aria-disabled="true">${esc(look.t('market.sold'))}</button>`
            : `<button type="button" class="mu-btn" data-action="${haggle ? 'lot-haggle' : 'lot-quick'}-${l.id}" aria-disabled="${!haggle && coins + 1e-9 < l.price}">${esc(look.t(haggle ? 'market.haggle' : 'market.buy'))}</button>`;
          return (
            `<div class="mu-card rar card-lot${l.sold ? ' sold mu-dim' : ''}" data-rarity="${l.rarity}" data-lot="${l.id}" data-verdict="${l.verdict}"><button type="button" class="mu-pic-btn" data-action="lot-open-${l.id}"><span class="mu-pic"><img alt="" src="${look.portrait(l.species, l.rarity)}"></span></button>` +
            `<span class="mu-name">${esc(look.speciesName(l.species))}</span><span>${rarityBadge(l.rarity, look.t(`rarity.${l.rarity}`))}</span>` +
            `<span class="mu-meta">${money(l.price, fmt)} · ${esc(look.t(`market.${l.verdict}`).toLowerCase())}</span>${btn}</div>`
          );
        })
        .join('')}</div>`;
    for (const l of mk.lots) {
      if (l.sold) continue;
      root.querySelector(`[data-action="lot-open-${l.id}"]`)?.addEventListener('click', () => openLot(l));
      root.querySelector(`[data-action="lot-haggle-${l.id}"]`)?.addEventListener('click', () => openLot(l));
      root.querySelector(`[data-action="lot-quick-${l.id}"]`)?.addEventListener('click', () => game.buyLot(l.id));
    }
  }

  const tab: MarketTab = {
    render() {
      sheet.setTitle(look.t('nav.market'));
      const mk = game.market();
      // A lot gone with the refresh: its page closes (a bought one stays to say so).
      if (open !== null && !mk.lots.some((l) => l.id === open) && panel.isOpen()) close();
      renderList();
    },
  };
  return tab;
}
