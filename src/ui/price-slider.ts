// What: the price slider (docs/01 §3 p. 13; MU-06 by s3-price and docs/07 «Ползунок цены»): four colored zones «Быстро» → «Максимум», the big price and the zone chip with the wait.
// Called by: src/ui/sales.ts (the «Цена» page of a pet).
// Keep: a native range input over the track (tap and drag on phones and with a mouse); zones, colors and waits come from market.json and style.json, never from code.

import { priceZone } from '../sim/rules.ts';
import { COIN } from './kit.ts';

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
  /** The zone colors, green to red (style.json priceZones), as many as slider.delay. */
  colors: readonly string[];
  /** The mean wait of a buyer at the market price, seconds (market.json replySec). */
  baseWaitSec: number;
}

export function createPriceSlider(parent: HTMLElement, data: SliderData, look: SliderLookups, onChange: (share: number) => void): PriceSlider {
  const n = data.delay.length;
  const root = document.createElement('div');
  root.className = 'price-slider';
  root.innerHTML =
    `<div class="price-now"><b class="price-big">${COIN}<span data-price-coins></span></b><span class="price-chip" data-price-zone></span></div>` +
    `<div class="price-track">${look.colors.map((c, i) => `<i data-zone-bar="${i}" style="background:${c}"></i>`).join('')}` +
    `<input type="range" class="price-range" data-action="price-slider" min="${data.min}" max="${data.max}" step="0.01" aria-label="${look.t('price.title')}"></div>` +
    `<div class="price-scale">${Array.from({ length: n }, (_, i) => `<span data-zone-label="${i}">${look.t(`price.zone.${i}`)}</span>`).join('')}</div>` +
    `<p class="price-hint" data-price-hint>${look.t('price.hint')}</p>`;
  parent.appendChild(root);
  const input = root.querySelector('input') as HTMLInputElement;
  const coinsEl = root.querySelector('[data-price-coins]') as HTMLElement;
  const zoneEl = root.querySelector('[data-price-zone]') as HTMLElement;
  let base = 1;
  const wait = (zone: number): string => {
    const sec = look.baseWaitSec * (data.delay[zone] ?? 1);
    return sec < 60 ? look.t('price.wait.sec', { n: Math.max(1, Math.round(sec)) }) : look.t('price.wait.min', { n: Math.max(1, Math.round(sec / 60)) });
  };
  const paint = (share: number): void => {
    const zone = priceZone(share, data);
    const color = look.colors[zone] ?? '';
    coinsEl.textContent = new Intl.NumberFormat(look.lang()).format(Math.max(1, Math.round(base * share)));
    zoneEl.textContent = `${look.t(`price.zone.${zone}`)} · ${wait(zone)}`;
    root.style.setProperty('--zc', color);
    root.dataset.zone = String(zone);
    root.querySelectorAll<HTMLElement>('[data-zone-bar]').forEach((el) => el.classList.toggle('on', el.dataset.zoneBar === String(zone)));
    root.querySelectorAll<HTMLElement>('[data-zone-label]').forEach((el) => el.classList.toggle('on', el.dataset.zoneLabel === String(zone)));
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
