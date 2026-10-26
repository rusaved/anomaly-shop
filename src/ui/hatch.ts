// What: the hatch show as a case (docs/01 §3 p. 12; M3-05, UB-03; MU-09 by s6, r1, r2): portraits run under a marker 4–5 s; «Hatched!» — «На витрину», «На склад», «Продать сразу».
// Called by: src/main.ts on a hatched event the player tapped (by: 'tap'); hatches by themselves (helpers, time away) skip the show.
// Keep: the result is the game's roll (the uid from the event); the strip around it is decoration (Math.random is fine in ui); a tap skips to the end; the strip runs in the pet's place and the card keeps its top, the buttons wait lockSec (круг правок FB п. 1).

import type { RarityName } from '../content/schemas.ts';
import type { CreatureView, Game } from '../sim/game.ts';
import { button, createOverlay } from './overlay.ts';
import { COIN, esc, ringPic } from './kit.ts';

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
  /** Seconds the result's buttons wait before they take a press (feel.json hatchLockSec): a double tap of the skip never chooses. */
  lockSec(): number;
  /** M7: taps extend the wait only within this many seconds after the result (feel.json hatchLockMaxSec). */
  lockMaxSec(): number;
  onResult?(): void;
  /** M6-01: a portrait passes under the marker (the wheel's click; no more often than TICK_MS). */
  onTick?(): void;
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
/** M6-01: the wheel clicks no more often than this, ms (the strip starts fast). */
const TICK_MS = 45;

export function createHatchShow(parent: HTMLElement, game: Game, look: HatchLookups): HatchShow {
  // UB-02: a tap outside skips the run; after the result it keeps the creature («Take»); круг правок FB-3: a tab tap does nothing while it is open.
  // Круг правок FB-2 (ревизор удобства): after the result a tap on the dim does nothing — a run of taps that skipped the strip never
  // closes the window and lands on the shop under it; a tab tap still keeps the pet.
  const overlay = createOverlay(parent, 'hatch', () => (done ? undefined : skip()), { dismiss: () => keepIt() });
  overlay.card.classList.add('card-hatch');
  // MU-09 (s6-hatch-result, r1, r2): the pet, its rarity word over the name, the price range (and the chance from VIP up), three ways out.
  // The strip and «тап — пропустить» live in the result's frame (CSS: in its pet and rarity-word places) until it shows.
  overlay.card.innerHTML =
    '<h2 data-hatch-title></h2><div class="hatch-result" data-hatch-result>' +
    '<div class="hatch-window" data-action="hatch-skip"><div class="hatch-strip" data-hatch-strip></div><i class="hatch-marker" aria-hidden="true"></i></div>' +
    '<p class="hatch-skip" data-hatch-skip data-i18n="hatch.skip"></p>' +
    '<span class="mu-pic hatch-pic"><img alt="" data-hatch-pic></span><span class="rar-word" data-hatch-rarity></span><h3 data-hatch-name></h3>' +
    '<p class="hatch-range" data-hatch-range></p><div class="hatch-buttons"></div></div>';
  const q = <T extends HTMLElement>(sel: string): T => overlay.card.querySelector(sel) as T;
  const title = q('[data-hatch-title]');
  const strip = q('[data-hatch-strip]');
  const skipHint = q('[data-hatch-skip]');
  const keep = button('hatch-keep', 'hatch.keep', 'mu-btn');
  const sell = button('hatch-sell', 'hatch.sell', 'mu-btn quiet hatch-sell');
  const toShop = button('hatch-shop', 'hatch.toShop', 'mu-btn main');
  // Круг правок FB-2 п. 4: «Продать сразу» — irreversible — is a quiet line under «На склад», far from the strip and its hint
  // (a run of taps that skips the strip lands on the pet and its words, never on it); sideways it stands under the price.
  q('.hatch-buttons').append(toShop, keep);
  q('.hatch-buttons').after(sell);
  const choices = [toShop, keep, sell];
  let egg = '';
  let uid = '';
  let raf = 0;
  let start = 0;
  let resultAt = 0;
  let endX = 0;
  let done = true;
  let locked = false;
  let unlock = 0;
  const setLocked = (on: boolean): void => {
    locked = on;
    overlay.card.classList.toggle('hatch-locked', on);
    for (const b of choices) b.setAttribute('aria-disabled', String(on));
  };

  const close = (): void => {
    cancelAnimationFrame(raf);
    clearTimeout(unlock);
    setLocked(false);
    overlay.hide();
    look.onResult?.();
  };
  // UB-03: the creature already waits in the inventory: «Take» just closes.
  const keepIt = (): void => close();
  keep.addEventListener('click', () => !locked && keepIt());
  toShop.addEventListener('click', () => {
    if (locked) return;
    const listed = game.list(uid);
    close();
    if (listed) look.onListed?.(uid);
  });
  // FB-15 (the usability review): «Продать сразу» is irreversible — a second tap right after the skip (the result shows under the finger)
  // never sells; the strip is skipped by a tap anywhere on the card, not only on the strip.
  sell.addEventListener('click', () => {
    if (locked) return;
    game.sellNow(uid);
    close();
  });
  // Круг правок FB-2 (ревизор удобства), FB-3 п. 1: the buttons wake up after lockSec (0.8 s) with no taps — every tap while they wait starts
  // the wait again, so a run of skip taps (up to 0.5 s apart) never sells or closes the window, wherever its buttons land under the finger.
  overlay.root.addEventListener(
    'pointerdown',
    () => {
      // M7 (ревизор геймдизайна): only in the first lockMaxSec after the result — fast taps never lock the buttons for good.
      if (!done || !locked || performance.now() - resultAt > look.lockMaxSec() * 1000) return;
      clearTimeout(unlock);
      unlock = window.setTimeout(() => setLocked(false), Math.max(0, look.lockSec()) * 1000);
    },
    { capture: true },
  );
  // UB-10: the tap that cracked the egg is not a skip (touch: its click lands on the strip that just opened under the finger).
  overlay.card.addEventListener('click', () => {
    if (!done && performance.now() - start >= 400) skip();
  });

  // UB-05: a tapped egg's creature waits in the inventory for the player's choice.
  const creature = (): CreatureView | undefined => {
    const view = game.view();
    return [...view.inventory, ...view.creatures].find((c) => c.uid === uid);
  };
  function showResult(): void {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    strip.style.transform = `translateX(${endX}px)`;
    resultAt = performance.now();
    setLocked(true);
    clearTimeout(unlock);
    unlock = window.setTimeout(() => setLocked(false), Math.max(0, look.lockSec()) * 1000);
    const cr = creature();
    title.textContent = look.t('hatch.done');
    overlay.card.classList.add('shown');
    if (!cr) {
      sell.hidden = true;
      return;
    }
    fill(cr);
    // Круг правок FB-2 п. 4: a full shelf makes «На склад» the main choice («На витрину» would only say the shelf is full).
    const full = game.freeSlots() <= 0;
    toShop.classList.toggle('main', !full);
    keep.classList.toggle('main', full);
    look.onReveal?.(cr.rarity);
    // MU-01: the card wears the frame of the rarity (premium glows, VIP shines, exclusive pulses); a valuable one and above also flashes.
    const rare = cr.rarity !== 'common' && cr.rarity !== 'good';
    overlay.card.classList.add('rar');
    overlay.card.dataset.rarity = cr.rarity;
    overlay.card.style.setProperty('--rc', look.rarityColor(cr.rarity));
    overlay.card.classList.toggle('hatch-rare', rare);
  }
  /** The result's words and picture (filled at the start too, so the card knows its final height and keeps its top). */
  function fill(cr: CreatureView): void {
    const fmt = new Intl.NumberFormat(look.lang());
    q<HTMLImageElement>('[data-hatch-pic]').src = look.portrait(cr.species, cr.rarity);
    q('[data-hatch-name]').textContent = look.speciesName(cr.species);
    const word = q('[data-hatch-rarity]');
    word.dataset.rarity = cr.rarity;
    word.textContent = `${look.t(`rarity.${cr.rarity}`)}${cr.mark ? ` · ${look.t(`mark.${cr.mark}`)}` : ''}`;
    const chance = cr.rarity === 'vip' || cr.rarity === 'exclusive' ? look.odds(egg).find((o) => o.species === cr.species)?.chance ?? 0 : 0;
    q('[data-hatch-range]').innerHTML =
      `${esc(look.t('hatch.range'))} ${COIN}<b>${fmt.format(cr.low)}–${fmt.format(cr.high)}</b>` +
      (chance > 0 ? ` · <span class="nowrap">${esc(look.t('hatch.chance', { n: fmt.format(Math.max(1, Math.round(100 / chance))) }))}</span>` : '');
    // M4-07: the anomaly of the day settles in first — no «sell now».
    sell.hidden = cr.hold > 0;
    sell.innerHTML = `${esc(look.t('hatch.sell'))} <span class="nowrap">${COIN}${fmt.format(cr.low)}</span>`;
    sell.dataset.price = String(cr.low);
  }
  function skip(): void {
    if (!done) showResult();
  }
  /** The card's top is where the result's top will be (the result centred between the bars): the pet lands where the strip ran. */
  function anchor(): void {
    const card = overlay.card;
    card.style.marginTop = '';
    card.style.maxHeight = '';
    const cs = getComputedStyle(overlay.root);
    const room = overlay.root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const shown = card.classList.contains('shown');
    card.classList.add('shown');
    // Круг правок FB-3 (ревизор удобства): a card that does not fit (130 %, a long chance line) closes its gaps before it would scroll.
    card.classList.remove('hatch-tight');
    if (card.offsetHeight > room || card.scrollHeight > card.clientHeight + 1) card.classList.add('hatch-tight');
    const full = card.offsetHeight;
    card.classList.toggle('shown', shown);
    // W-10: a phone sideways (≤ 520 px high) keeps the window at the top — «Продать сразу» under the tile stays out of the lower third.
    const high = overlay.root.closest('.landscape') !== null && window.innerHeight <= 520;
    const top = high ? 0 : Math.max(0, Math.floor((room - full) / 2));
    card.style.marginTop = `${top}px`;
    card.style.maxHeight = `${Math.max(0, room - top)}px`;
  }
  // A font that grows while the window is open (130 %) never cuts the buttons: the card moves up only when it no longer fits.
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() => {
      if (overlay.isOpen() && overlay.card.scrollHeight > overlay.card.clientHeight) anchor();
    }).observe(q('[data-hatch-result]'));

  return {
    play(e) {
      uid = e.uid;
      egg = e.egg;
      done = false;
      clearTimeout(unlock);
      setLocked(false);
      skipHint.textContent = look.t('hatch.skip');
      overlay.card.classList.remove('shown', 'hatch-rare', 'rar');
      delete overlay.card.dataset.rarity;
      title.textContent = look.t('hatch.title');
      const cr = creature();
      sell.hidden = !cr;
      if (cr) fill(cr);
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
          el.innerHTML = ringPic(look.portrait(it.species, it.rarity), it.rarity, 64);
          return el;
        }),
      );
      overlay.show();
      anchor();
      const windowW = (q('.hatch-window') as HTMLElement).clientWidth || 300;
      // A little off the centre of the target, like a real wheel; the target still ends under the marker.
      const jitter = (Math.random() - 0.5) * ITEM * 0.5;
      endX = windowW / 2 - (TARGET * ITEM + ITEM / 2) + jitter;
      const startX = windowW / 2 - ITEM / 2;
      const dur = Math.max(0.5, look.spinSec()) * 1000;
      start = performance.now();
      let passed = 0;
      let tickAt = -1e9;
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const step = (now: number): void => {
        const k = Math.min(1, (now - start) / dur);
        const ease = 1 - Math.pow(1 - k, 4);
        const x = startX + (endX - startX) * ease;
        strip.style.transform = `translateX(${x}px)`;
        const n = Math.floor((startX - x) / ITEM);
        if (n > passed) {
          passed = n;
          if (now - tickAt >= TICK_MS) {
            tickAt = now;
            look.onTick?.();
          }
        }
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
