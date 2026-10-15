// What: the Market tab (docs/01 §3 p. 14; M3-09, M3-10): lots of seller-characters with «below / at / above the market» and a range bar, a refresh timer and «Don't wait».
// Called by: src/main.ts (create once into its sheet; render on every commit and each second while open).
// Keep: commands only through the game (refreshMarket, buyLot); the lot card hosts the seller chat (src/ui/seller.ts).

import type { RarityName } from '../content/schemas.ts';
import type { Game, LotView } from '../sim/game.ts';
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
  sheet.head.innerHTML = '<div class="market-head"><span data-market-timer></span><button type="button" class="btn btn-small" data-action="market-refresh"></button></div>';
  const timer = sheet.head.querySelector('[data-market-timer]') as HTMLElement;
  const refresh = sheet.head.querySelector('[data-action="market-refresh"]') as HTMLButtonElement;
  refresh.addEventListener('click', () => game.refreshMarket());
  const root = document.createElement('div');
  root.className = 'market cards';
  sheet.body.appendChild(root);
  // M4-00: a lot is an inner page of the tab with the seller chat — «Back» to the lots.
  const close = (): void => {
    open = null;
    panel.hide();
  };
  const panel = sheet.detail('lot', close);
  let open: number | null = null;
  let key = '';

  const bar = (l: LotView): string => {
    // Where the price stands between the cheapest and the dearest the market asks for this creature.
    const k = Math.min(1, Math.max(0, (l.price / Math.max(1, l.value) - look.range.min) / (look.range.max - look.range.min)));
    return `<span class="lot-bar"><i style="left:${(k * 100).toFixed(1)}%"></i></span>`;
  };

  function renderList(): void {
    const mk = game.market();
    const fmt = new Intl.NumberFormat(look.lang());
    const coins = game.state.coins;
    const next = `${look.lang()}:${mk.lots.map((l) => `${l.id}.${l.sold}.${l.price}`).join(',')}:${coins >= 0 ? Math.floor(coins) : ''}`;
    if (next === key) return;
    key = next;
    root.replaceChildren(
      ...mk.lots.map((l) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tile card-lot${l.sold ? ' sold' : ''}`;
        b.dataset.lot = String(l.id);
        b.dataset.verdict = l.verdict;
        b.innerHTML =
          `<span class="card-pic"><img alt="" src="${look.portrait(l.species, l.rarity)}"><i class="rarity-dash" style="background:${look.rarityColor(l.rarity)}"></i></span>` +
          `<span class="card-name"></span><span class="card-sub">${look.t('card.level', { n: l.level })}</span>` +
          `<span class="card-price${coins + 1e-9 < l.price ? ' dim' : ''}"><span class="coin coin-sm" aria-hidden="true"></span><b>${fmt.format(l.price)}</b></span>` +
          `<span class="verdict v-${l.verdict}">${look.t(l.sold ? 'market.sold' : `market.${l.verdict}`)}</span>${bar(l)}`;
        (b.querySelector('.card-name') as HTMLElement).textContent = look.speciesName(l.species);
        if (!l.sold)
          b.addEventListener('click', () => {
            open = l.id;
            panel.show();
            look.openLot(panel.card, l, close);
          });
        return b;
      }),
    );
  }

  const tab: MarketTab = {
    render() {
      sheet.setTitle(look.t('nav.market'));
      const mk = game.market();
      const s = Math.ceil(mk.refreshIn);
      timer.textContent = look.t('market.next', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
      refresh.textContent = look.t('market.now');
      // A lot gone with the refresh: its panel closes (a bought one stays to say so).
      if (open !== null && !mk.lots.some((l) => l.id === open) && panel.isOpen()) close();
      renderList();
    },
  };
  return tab;
}
