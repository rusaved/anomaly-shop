// What: the price slider (docs/01 §3 p. 13; M3-06): six zones in the rarity colors from grey to red, «below / market / above» and the number.
// Called by: src/ui/sales.ts (the card of a creature on sale).
// Keep: a native range input (tap and drag work on phones and with a mouse); the zone and the speed hint come from rules.priceZone over market.json.

import { priceZone } from '../sim/rules.ts';

export interface SliderData {
  min: number;
  max: number;
  delay: readonly number[];
}

export interface PriceSlider {
  root: HTMLElement;
  /** Shows the share and the coins for it (appraisal = the market price). */
  set(share: number, appraisal: number): void;
}

export interface SliderLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** Six zone colors, grey to red (style.json rarity). */
  colors: readonly string[];
}

/** Zones 0–1 below the market, 2–3 the market, 4–5 above it. */
const ZONE_WORD = ['below', 'below', 'market', 'market', 'above', 'above'] as const;

export function createPriceSlider(parent: HTMLElement, data: SliderData, look: SliderLookups, onChange: (share: number) => void): PriceSlider {
  const root = document.createElement('div');
  root.className = 'price-slider';
  const stops = look.colors.map((c, i) => `${c} ${((i * 100) / look.colors.length).toFixed(2)}% ${(((i + 1) * 100) / look.colors.length).toFixed(2)}%`).join(', ');
  root.innerHTML =
    '<div class="price-now"><b data-price-coins></b><span data-price-zone></span></div>' +
    `<input type="range" class="price-range" data-action="price-slider" min="${data.min}" max="${data.max}" step="0.01" style="background:linear-gradient(to right, ${stops})">` +
    `<div class="price-scale"><span>${look.t('price.below')}</span><span>${look.t('price.market')}</span><span>${look.t('price.above')}</span></div>` +
    '<p class="price-hint" data-price-hint></p>';
  parent.appendChild(root);
  const input = root.querySelector('input') as HTMLInputElement;
  const coinsEl = root.querySelector('[data-price-coins]') as HTMLElement;
  const zoneEl = root.querySelector('[data-price-zone]') as HTMLElement;
  const hintEl = root.querySelector('[data-price-hint]') as HTMLElement;
  let base = 1;
  const paint = (share: number): void => {
    const zone = priceZone(share, data);
    coinsEl.textContent = new Intl.NumberFormat(look.lang()).format(Math.max(1, Math.round(base * share)));
    zoneEl.textContent = look.t(`price.${ZONE_WORD[zone] ?? 'market'}`);
    zoneEl.style.borderColor = look.colors[zone] ?? '';
    root.dataset.zone = String(zone);
    hintEl.textContent = look.t(`price.speed${zone < 2 ? 0 : zone < 4 ? 1 : 2}`);
  };
  input.addEventListener('input', () => {
    const share = Number(input.value);
    paint(share);
    onChange(share);
  });
  return {
    root,
    set(share, appraisal) {
      base = appraisal;
      if (document.activeElement !== input) input.value = String(share);
      paint(Number(input.value));
    },
  };
}
