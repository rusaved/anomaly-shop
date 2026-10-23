// What: «Магазин → Акции» (M5-04, M5-05): deals (the starter one with a 48 h timer, season, mega), coin packs, «Без рекламы», the note on game money.
// Called by: src/main.ts (only with caps.payments: the section «deals» of the store tab); restore() once at start (IAP-01 getPurchases).
// Keep: prices from the platform catalog (its currency), the data price only without one; goods only after «ok»; a consumable is consumed after the grant.

import type { ShopData } from '../content/schemas.ts';
import type { Game, PackGive } from '../sim/game.ts';
import type { Payments } from '../platform/types.ts';
import { esc, iconize } from './kit.ts';

export interface StoreLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  shop: ShopData;
  payments: Payments;
  now(): number;
  /** Seconds of play this visit: no windows with purchases in the first shop.firstSec (docs/03 §2). */
  playSec(): number;
  eggName(id: string): string;
  icon(thing: string): string;
  eggPicture(id: string): string;
  track(event: string, params?: Record<string, string | number>): void;
  note(text: string, good: boolean): void;
  /** «No ads» was just bought or restored: the banner goes. */
  noAdsChanged(): void;
}

export interface ShopStore {
  render(box: HTMLElement): void;
  /** At start: «no ads» stays, a purchase paid but not granted (a crash) is granted now. */
  restore(): Promise<void>;
  /** The store may open now (not in the first minutes). */
  open(): boolean;
}

type Item = ShopData['deals'][number];

export function createShopStore(game: Game, look: StoreLookups): ShopStore {
  const prices = new Map<string, string>();
  let busy = false;
  let key = '';
  let shown = false;
  void look.payments.catalog().then((list) => {
    for (const p of list) prices.set(p.id, p.price);
    key = '';
  });
  const price = (product: string, yan: number): string => prices.get(product) ?? look.t('store.yan', { n: yan });
  const fmt = (): Intl.NumberFormat => new Intl.NumberFormat(look.lang());
  /** What a pack gives, short: «◉ 1 200 · 2 × Золотое яйцо · ◆ 20». */
  const contents = (give: PackGive): string => {
    const parts: string[] = [];
    // The coins as the game will give them: minutes of the player's income (the same rule as the gifts).
    if (give.coinsMin) parts.push(`◉ ${fmt().format(game.rewardFor({ incomeMin: give.coinsMin }).coins ?? 0)}`);
    for (const [id, n] of Object.entries(give.eggs ?? {})) parts.push(`${n} × ${look.eggName(id)}`);
    if (give.crystals) parts.push(`◆ ${fmt().format(give.crystals)}`);
    return parts.join(' · ');
  };
  const left = (ms: number): string => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const starterLive = (): boolean => {
    const st = game.state.shop;
    if ((st?.bought.starter ?? 0) > 0) return false;
    return !st?.starterEnds || st.starterEnds > look.now();
  };

  async function buy(item: Item | 'no_ads'): Promise<void> {
    if (busy) return;
    const product = item === 'no_ads' ? look.shop.noAds.product : item.product;
    busy = true;
    key = '';
    look.track('gamePurchaseStart', { product });
    const r = await look.payments.buy(product);
    busy = false;
    key = '';
    if (r.result === 'ok') {
      if (item === 'no_ads') {
        game.shopMark({ bought: 'no_ads', noAds: true });
        look.noAdsChanged();
        look.note(look.t('store.noAdsDone'), true);
      } else {
        game.grantPack(item.give);
        game.shopMark({ bought: item.id });
        await look.payments.consume(r.token);
        look.note(look.t('store.done'), true);
      }
      look.track('gamePurchaseSuccess', { product });
    } else {
      look.track('gamePurchaseError', { product, result: r.result });
      if (r.result === 'error') look.note(look.t('store.failed'), false);
    }
  }

  const card = (item: Item, extra = ''): string =>
    `<div class="mu-card store-item" data-store="${item.id}"><span class="mu-pic"><img alt="" src="${item.give.eggs ? look.eggPicture(Object.keys(item.give.eggs)[0]!) : look.icon('chest')}"></span>` +
    `<span class="day-text"><b class="mu-name">${esc(look.t(`store.${item.id}`))}</b><span class="mu-meta">${iconize(esc(contents(item.give)))}</span>${extra}</span>` +
    `<button type="button" class="mu-btn${busy ? ' off' : ''}" data-action="store-buy-${item.id}" aria-disabled="${busy}">${esc(price(item.product, item.price))}</button></div>`;

  const store: ShopStore = {
    open: () => look.playSec() >= look.shop.firstSec,
    render(box) {
      const st = game.state.shop;
      const live = starterLive();
      const ends = st?.starterEnds ?? 0;
      const next = `${look.lang()}|${busy}|${live}|${live && ends ? Math.floor((ends - look.now()) / 1000) : ''}|${st?.noAds}|${prices.size}|${Math.floor(game.state.stats.income ?? 0)}|${store.open()}`;
      if (next === key && box.firstChild) return;
      key = next;
      if (!store.open()) {
        box.innerHTML = `<p class="mu-meta store-soon">${esc(look.t('store.soon'))}</p>`;
        return;
      }
      // The starter deal's 48 h start at its first show (the genre's «offer for a newcomer»).
      if (live && !ends) game.shopMark({ starterEnds: look.now() + (look.shop.deals.find((d) => d.id === 'starter')?.hours ?? 48) * 3600_000 });
      if (!shown) {
        shown = true;
        look.track('gameOfferView', { offer: 'store' });
      }
      const deals = look.shop.deals.filter((d) => d.id !== 'starter' || live);
      box.innerHTML =
        `<div class="mu-head"><h3>${esc(look.t('store.deals'))}</h3><span></span></div>` +
        deals.map((d) => card(d, d.id === 'starter' && game.state.shop?.starterEnds ? `<span class="mu-meta store-timer" data-store-timer>${esc(look.t('store.left', { t: left(game.state.shop.starterEnds - look.now()) }))}</span>` : '')).join('') +
        `<div class="mu-head"><h3>${esc(look.t('store.coins'))}</h3><span></span></div>` +
        look.shop.coins.map((c) => card(c)).join('') +
        `<div class="mu-head"><h3>${esc(look.t('store.noAds'))}</h3><span></span></div>` +
        `<div class="mu-card store-item" data-store="no_ads"><span class="day-text"><b class="mu-name">${esc(look.t('store.noAds'))}</b><span class="mu-meta">${esc(look.t('store.noAdsText'))}</span></span>` +
        (st?.noAds
          ? `<span class="mu-meta day-got">${esc(look.t('store.owned'))}</span>`
          : `<button type="button" class="mu-btn${busy ? ' off' : ''}" data-action="store-buy-no_ads" aria-disabled="${busy}">${esc(price(look.shop.noAds.product, look.shop.noAds.price))}</button>`) +
        '</div>' +
        `<p class="mu-meta store-note">${esc(look.t('store.note'))}</p>`;
      for (const item of [...deals, ...look.shop.coins])
        box.querySelector(`[data-action="store-buy-${item.id}"]`)?.addEventListener('click', () => void buy(item).then(() => store.render(box)));
      box.querySelector('[data-action="store-buy-no_ads"]')?.addEventListener('click', () => void buy('no_ads').then(() => store.render(box)));
    },
    async restore() {
      const owned = await look.payments.owned();
      for (const p of owned) {
        if (p.id === look.shop.noAds.product) {
          if (!game.state.shop?.noAds) {
            game.shopMark({ noAds: true });
            look.noAdsChanged();
          }
          continue;
        }
        const item = [...look.shop.deals, ...look.shop.coins].find((x) => x.product === p.id);
        if (!item) continue;
        game.grantPack(item.give);
        game.shopMark({ bought: item.id });
        await look.payments.consume(p.token);
      }
    },
  };
  return store;
}
