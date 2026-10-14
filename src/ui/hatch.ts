// What: the hatch show as a case (docs/01 §3 p. 12; M3-05, UB-03): portraits run under a marker 4–5 s; «Hatched!» with the range, Take / Sell now / To the shop.
// Called by: src/main.ts on a hatched event the player tapped (by: 'tap'); hatches by themselves (helpers, time away) skip the show.
// Keep: the result is the game's roll (the uid from the event); the strip around it is decoration (Math.random is fine in ui); a tap skips to the end.

import type { RarityName } from '../content/schemas.ts';
import type { CreatureView, Game } from '../sim/game.ts';
import { button, createOverlay } from './overlay.ts';

export interface HatchLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  /** What the egg can hatch, with chances (rules.eggOdds). */
  odds(egg: string): Array<{ species: string; rarity: RarityName; chance: number }>;
  portrait(species: string, rarity: RarityName): string;
  rarityColor(r: RarityName): string;
  speciesName(id: string): string;
  /** Seconds of the run (feel.json hatchShowSec, 4–5). */
  spinSec(): number;
  onResult?(): void;
  /** The result shows (UB-03: the rare sound plays here, not when the egg cracks — no spoiler). */
  onReveal?(rarity: RarityName): void;
  /** UB-10: «To the shop» put it on sale (the price slider may open). */
  onListed?(uid: string): void;
}

export interface HatchShow {
  play(e: { uid: string; species: string; rarity: RarityName; egg: string }): void;
  isOpen(): boolean;
  /** Game-free timing for tests: when the last run started and when its result showed (performance.now ms). */
  timing(): { start: number; result: number };
}

/** Portraits in the strip and where the result stands; the strip stops with it under the marker. */
const STRIP = 36;
const TARGET = 30;
const ITEM = 76;

export function createHatchShow(parent: HTMLElement, game: Game, look: HatchLookups): HatchShow {
  // UB-02: a tap outside skips the run; after the result it keeps the creature («Take»); a tab tap does the same.
  const overlay = createOverlay(parent, 'hatch', () => (done ? keepIt() : skip()), { dismiss: () => keepIt() });
  overlay.card.classList.add('card-hatch');
  overlay.card.innerHTML =
    '<h2 data-hatch-title></h2><div class="hatch-window" data-action="hatch-skip"><div class="hatch-strip" data-hatch-strip></div><i class="hatch-marker" aria-hidden="true"></i></div>' +
    '<p class="hatch-skip" data-hatch-skip data-i18n="hatch.skip"></p>' +
    '<div class="hatch-result" data-hatch-result hidden><img alt="" data-hatch-pic><h3 data-hatch-name></h3><p class="hatch-rarity"><i class="rarity-dot" data-hatch-dot></i><span data-hatch-rarity></span></p>' +
    '<p class="hatch-range"><span data-i18n="hatch.range"></span> <b data-hatch-range></b></p><div class="hatch-buttons"></div></div>';
  const q = <T extends HTMLElement>(sel: string): T => overlay.card.querySelector(sel) as T;
  const title = q('[data-hatch-title]');
  const strip = q('[data-hatch-strip]');
  const result = q('[data-hatch-result]');
  const skipHint = q('[data-hatch-skip]');
  const keep = button('hatch-keep', 'hatch.keep');
  const sell = button('hatch-sell', 'hatch.sell');
  const toShop = button('hatch-shop', 'hatch.toShop', 'btn-primary');
  q('.hatch-buttons').append(keep, sell, toShop);
  let uid = '';
  let raf = 0;
  let start = 0;
  let resultAt = 0;
  let endX = 0;
  let done = true;

  const close = (): void => {
    cancelAnimationFrame(raf);
    overlay.hide();
    look.onResult?.();
  };
  // UB-03: the creature already waits in the inventory: «Take» just closes.
  const keepIt = (): void => close();
  keep.addEventListener('click', keepIt);
  toShop.addEventListener('click', () => {
    const listed = game.list(uid);
    close();
    if (listed) look.onListed?.(uid);
  });
  sell.addEventListener('click', () => {
    game.sellNow(uid);
    close();
  });
  // UB-10: the tap that cracked the egg is not a skip (touch: its click lands on the strip that just opened under the finger).
  q('[data-action="hatch-skip"]').addEventListener('click', () => {
    if (performance.now() - start >= 400) skip();
  });

  function showResult(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    strip.style.transform = `translateX(${endX}px)`;
    resultAt = performance.now();
    // UB-05: a tapped egg's creature waits in the inventory for the player's choice.
    const view = game.view();
    const cr: CreatureView | undefined = [...view.inventory, ...view.creatures].find((c) => c.uid === uid);
    title.textContent = look.t('hatch.done');
    result.hidden = false;
    skipHint.hidden = true;
    overlay.card.classList.add('shown');
    if (!cr) {
      sell.hidden = true;
      return;
    }
    look.onReveal?.(cr.rarity);
    const fmt = new Intl.NumberFormat(look.lang());
    q<HTMLImageElement>('[data-hatch-pic]').src = look.portrait(cr.species, cr.rarity);
    q('[data-hatch-name]').textContent = look.speciesName(cr.species);
    q('[data-hatch-rarity]').textContent = look.t(`rarity.${cr.rarity}`);
    q('[data-hatch-dot]').style.background = look.rarityColor(cr.rarity);
    // UB-10: a valuable one and above is an event — the card glows in its rarity color, the rarity grows, the picture pops.
    overlay.card.style.setProperty('--rc', look.rarityColor(cr.rarity));
    overlay.card.classList.toggle('hatch-rare', cr.rarity !== 'common' && cr.rarity !== 'good');
    q('[data-hatch-range]').textContent = `${fmt.format(cr.low)} – ${fmt.format(cr.high)}`;
    sell.hidden = false;
    sell.textContent = look.t('hatch.sellFor', { n: fmt.format(cr.low) });
    sell.dataset.price = String(cr.low);
  }
  function skip(): void {
    if (!done) showResult();
  }

  return {
    play(e) {
      uid = e.uid;
      done = false;
      result.hidden = true;
      skipHint.hidden = false;
      skipHint.textContent = look.t('hatch.skip');
      overlay.card.classList.remove('shown', 'hatch-rare');
      title.textContent = look.t('hatch.title');
      const odds = look.odds(e.egg);
      const total = odds.reduce((s, o) => s + o.chance, 0) || 1;
      const roll = (): { species: string; rarity: RarityName } => {
        let x = Math.random() * total;
        for (const o of odds) if ((x -= o.chance) <= 0) return o;
        return odds[odds.length - 1] ?? { species: e.species, rarity: e.rarity };
      };
      strip.replaceChildren(
        ...Array.from({ length: STRIP }, (_, i) => {
          const it = i === TARGET ? { species: e.species, rarity: e.rarity } : roll();
          const el = document.createElement('span');
          el.className = 'hatch-item';
          el.innerHTML = `<img alt="" src="${look.portrait(it.species, it.rarity)}"><i style="background:${look.rarityColor(it.rarity)}"></i>`;
          return el;
        }),
      );
      overlay.show();
      const windowW = (q('.hatch-window') as HTMLElement).clientWidth || 300;
      // A little off the centre of the target, like a real wheel; the target still ends under the marker.
      const jitter = (Math.random() - 0.5) * ITEM * 0.5;
      endX = windowW / 2 - (TARGET * ITEM + ITEM / 2) + jitter;
      const startX = windowW / 2 - ITEM / 2;
      const dur = Math.max(0.5, look.spinSec()) * 1000;
      start = performance.now();
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const step = (now: number): void => {
        const k = Math.min(1, (now - start) / dur);
        const ease = 1 - Math.pow(1 - k, 4);
        strip.style.transform = `translateX(${startX + (endX - startX) * ease}px)`;
        if (k >= 1) showResult();
        else raf = requestAnimationFrame(step);
      };
      if (reduced) showResult();
      else raf = requestAnimationFrame(step);
    },
    isOpen: () => overlay.isOpen(),
    timing: () => ({ start, result: resultAt }),
  };
}
