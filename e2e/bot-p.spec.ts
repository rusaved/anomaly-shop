import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/**
 * P-08 («Ресейл 17»): a bot plays the first two minutes of a fresh game on the phone sideways like a player who follows what calls:
 * the hinted button, the green ring, the finger, the main button of the top window or of the open tab, a tab with a count; with nothing
 * calling it feeds the pet on the shelf.
 * It measures the time to the first sale, the longest stretch with nothing new (no egg, pet, buyer, sale, hint or window) and how many
 * taps on a thing that calls got no answer (nothing on screen or in the game changed in 0.7 s). P_BOT_OUT=<label> writes the line to
 * docs/evidence/P/bot.txt (the table of the milestone's summary: before and after).
 */
const SIZES = [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
  { width: 812, height: 330 },
];
type T = { __TEST__: { targets(): { slots: Array<{ x: number; y: number }> } | null } };
type S = Awaited<ReturnType<typeof state>> & Record<string, unknown> & { windows: string[] };
const out = process.env.P_BOT_OUT ? resolve(import.meta.dirname, '../docs/evidence/P/bot.txt') : null;
const RUN_MS = 120_000;

/** What a tap may change: the screen (windows, tab, hint, captions) and the game (coins, eggs, pets, buyers, sales). */
const answer = (s: S) =>
  JSON.stringify([s.windows, s.tab, s.hint, s.captions, s.coins, { ...(s.stats as object), taps: 0 }, s.incubators, (s.creatures as Array<{ xp?: number; level?: number }>).map((c) => [c.level, c.xp]), s.shelf, s.chats, s.queue]);
/** Something new for the player: an egg, a pet, a buyer, a sale, a new hint or window. */
const news = (s: S) => JSON.stringify([(s.stats as { hatched: number; deals: number }).hatched, (s.stats as { deals: number }).deals, (s.creatures as unknown[]).length, s.chats, s.queue, s.hint, s.windows, (s.incubators as Array<{ egg: unknown }>).filter((i) => i.egg).length]);

/** What calls the player now: the hinted button, the ring, the finger, the main button of the top window (null — nothing). */
function pick(page: Page) {
  return page.evaluate(() => {
    const vis = (e: Element | null): e is HTMLElement => {
      if (!e || (e as HTMLElement).offsetParent === null) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const at = (el: HTMLElement, why: string) => {
      const r = el.getBoundingClientRect();
      return { x: Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), y: Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)), why };
    };
    const hatch = document.querySelector<HTMLElement>('[data-overlay=hatch]:not([hidden])');
    if (hatch) {
      // The player taps the big main button (the strip, if it still runs, is skipped by any tap on the card).
      const shop = hatch.querySelector<HTMLElement>('[data-action=hatch-shop]');
      return vis(shop) ? at(shop, 'hatch-shop') : null;
    }
    const hinted = [...document.querySelectorAll<HTMLElement>('.is-hinted')].find(vis);
    if (hinted) return at(hinted, `hint:${hinted.dataset.action ?? hinted.dataset.tab ?? hinted.className.split(' ')[0]}`);
    const ring = document.querySelector<HTMLElement>('.hint-ring');
    if (vis(ring)) return at(ring, `ring:${document.querySelector<HTMLElement>('.hint')?.dataset.hint ?? ''}`);
    const finger = document.querySelector<HTMLElement>('.tap-finger:not([hidden])');
    if (vis(finger)) return at(finger, 'finger');
    const main = [...document.querySelectorAll<HTMLElement>('.overlay:not([hidden]):not(.under) .mu-btn.main, .overlay:not([hidden]):not(.under) .btn-primary')].find(vis);
    if (main) return at(main, `main:${main.dataset.action ?? ''}`);
    // The big orange button of the open tab («Продать за N» in a chat), then a tab with a count on it.
    const sheetMain = [...document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) .mu-btn.main:not([aria-disabled=true]):not(.off)')].find(vis);
    if (sheetMain) return at(sheetMain, `tab-main:${sheetMain.dataset.action ?? ''}`);
    const badge = [...document.querySelectorAll<HTMLElement>('#nav [data-tab]')].find((b) => vis(b.querySelector('[data-badge]')) && !b.classList.contains('active') && b.getAttribute('aria-selected') !== 'true');
    if (badge) return at(badge, `badge:${badge.dataset.tab ?? ''}`);
    return null;
  });
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`P-08 bot: the first two minutes by what calls — a sale, no long stall, few dead taps @full @ ${tag}`, async ({ page }) => {
      test.setTimeout(RUN_MS + 90_000);
      const errors = collectErrors(page);
      await open(page);
      const t0 = Date.now();
      let firstDeal: number | null = null;
      let lastNews = t0;
      let longest = 0;
      let longestWhat = '';
      let prevNews = news((await state(page)) as S);
      const dead: string[] = [];
      let streak = '';
      let streakN = 0;
      let restUntil = 0;
      while (Date.now() - t0 < RUN_MS) {
        const before = (await state(page)) as S;
        const spot = Date.now() < restUntil ? null : await pick(page);
        if (spot) {
          await page.touchscreen.tap(spot.x, spot.y);
          await page.waitForTimeout(700);
          const after = (await state(page)) as S;
          if (!('wait' in spot) && answer(after) === answer(before)) {
            dead.push(spot.why);
            streakN = streak === spot.why ? streakN + 1 : 1;
            streak = spot.why;
            // A player tries a thing twice, then does something else for a while.
            if (streakN >= 2) restUntil = Date.now() + 3000;
          } else streakN = 0;
        } else {
          const slots = (await page.evaluate(() => (window as unknown as T).__TEST__.targets()))?.slots ?? [];
          const shelf = (before.shelf as string[]).length;
          if (shelf > 0 && slots[0] && before.windows.length === 0) await page.touchscreen.tap(slots[0].x, slots[0].y);
          await page.waitForTimeout(350);
        }
        const s = (await state(page)) as S;
        const now = Date.now();
        if (firstDeal === null && (s.stats as { deals: number }).deals >= 1) firstDeal = (now - t0) / 1000;
        const n = news(s);
        if (n !== prevNews) {
          if (now - lastNews > longest) {
            longest = now - lastNews;
            longestWhat = `${((lastNews - t0) / 1000).toFixed(0)}–${((now - t0) / 1000).toFixed(0)} с, ${String(s.hint || s.ftue || s.windows.join(',') || '—')}`;
          }
          lastNews = now;
          prevNews = n;
        }
      }
      if (Date.now() - lastNews > longest) {
        longest = Date.now() - lastNews;
        longestWhat = `${((lastNews - t0) / 1000).toFixed(0)}–${RUN_MS / 1000} с, до конца прогона`;
      }
      const st = (await state(page)) as S;
      const uniq = [...new Set(dead)].map((w) => `${w}×${dead.filter((d) => d === w).length}`).join(', ');
      const line = `${process.env.P_BOT_OUT ?? ''} · ${tag} · первая продажа ${firstDeal === null ? 'нет' : `${firstDeal.toFixed(0)} с`} · самый длинный простой ${(longest / 1000).toFixed(0)} с (${longestWhat}) · тапов без отклика ${dead.length}${uniq ? ` (${uniq})` : ''} · продаж ${(st.stats as { deals: number }).deals}, монет ${st.coins} · в конце: шаг ${String(st.ftue)}, подсказка «${String(st.hint)}», вкладка ${String(st.tab)}, окна ${st.windows.join(',') || '—'}`;
      await page.screenshot({ path: `test-results/bot-p-${tag}.png` });
      console.log(line);
      if (out) {
        mkdirSync(resolve(out, '..'), { recursive: true });
        appendFileSync(out, line + '\n');
      }
      expect(firstDeal, 'a sale within two minutes').not.toBeNull();
      expect(errors).toEqual([]);
    });
  });
}
