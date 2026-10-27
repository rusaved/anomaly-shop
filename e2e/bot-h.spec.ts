import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/**
 * H-08 («Ресейл 18», from P-08): a bot plays the first five minutes of a fresh game on the phone sideways like a player who follows what calls:
 * the hinted button, the green ring, the finger, the main button of the top window or of the open tab, a tab with a count; with nothing
 * calling it feeds the pet on the shelf.
 * It measures the share of the time «Вылупился!» is on screen (the hatch show), the longest stretch with nothing new (no egg, pet, buyer,
 * sale, hint or window), how many taps on a thing that calls got no answer (nothing changed in 0.7 s) and the haggles: in a chat with
 * «Поднять цену» the bot raises every other time (a curious player), then sells. H_BOT_OUT=<label> writes the line to
 * docs/evidence/H/bot.txt (the table of the milestone's summary: before and after). Runs against any build (no «Поднять цену» — no haggle).
 */
const SIZES = [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
  { width: 812, height: 330 },
];
type T = { __TEST__: { targets(): { slots: Array<{ x: number; y: number }> } | null } };
type S = Awaited<ReturnType<typeof state>> & Record<string, unknown> & { windows: string[] };
const out = process.env.H_BOT_OUT ? resolve(import.meta.dirname, '../docs/evidence/H/bot.txt') : null;
const RUN_MS = 300_000;

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
    // H-08: a chat with «Поднять цену» — the bot's choice (raise or sell) is made by the test.
    const raise = document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-action=chat-raise]:not([aria-disabled=true])');
    const sellBtn = document.querySelector<HTMLElement>('.sheet:not([hidden]) [data-action=chat-sell]:not([aria-disabled=true])');
    if (vis(raise) && vis(sellBtn)) return { ...at(sellBtn, 'tab-main:chat-sell'), raise: at(raise, 'raise') };
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
    const sheetMain = [...document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) .mu-btn.main:not([aria-disabled=true]):not(.off), .sheet:not([hidden]) .mu-btn.good:not([aria-disabled=true])')].find(vis);
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

    test(`H-08 bot: the first five minutes by what calls — hatch share, stalls, dead taps, haggles @full @ ${tag}`, async ({ page }) => {
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
      let hatchMs = 0;
      let lastAt = Date.now();
      let hatchOpen = false;
      let chatsSeen = 0;
      const haggle = { tries: 0, yes: 0, middle: 0, gone: 0 };
      const hatchNow = () => page.locator('[data-overlay=hatch]').isVisible();
      while (Date.now() - t0 < RUN_MS) {
        const before = (await state(page)) as S;
        let spot = Date.now() < restUntil ? null : await pick(page);
        if (spot && 'raise' in spot && spot.raise) {
          // Every other chat with «Поднять цену»: raise once, then whatever the buyer says, sell (or the buyer is gone).
          chatsSeen += 1;
          if (chatsSeen % 2 === 1) {
            const r = (spot as unknown as { raise: { x: number; y: number } }).raise;
            await page.touchscreen.tap(r.x, r.y);
            haggle.tries += 1;
            await page.waitForTimeout(1300);
            const last = await page.locator('.sheet:not([hidden]) .chat-lines .bubble').last().innerText().catch(() => '');
            const gone = !(await page.locator('.sheet:not([hidden]) [data-action=chat-sell]').isVisible());
            if (gone) haggle.gone += 1;
            else if (/\d/.test(last)) haggle.middle += 1;
            else haggle.yes += 1;
            spot = gone ? null : await pick(page);
          }
        }
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
        // The hatch show's share: the time since the last look counts as hatching when the window was open at both ends.
        const open = await hatchNow();
        if (open && hatchOpen) hatchMs += now - lastAt;
        hatchOpen = open;
        lastAt = now;
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
      const line = `${process.env.H_BOT_OUT ?? ''} · ${tag} · вылупление ${((hatchMs / RUN_MS) * 100).toFixed(0)} % времени · первая продажа ${firstDeal === null ? 'нет' : `${firstDeal.toFixed(0)} с`} · торг ${haggle.tries} (да ${haggle.yes}, середина ${haggle.middle}, ушёл ${haggle.gone}) · самый длинный простой ${(longest / 1000).toFixed(0)} с (${longestWhat}) · тапов без отклика ${dead.length}${uniq ? ` (${uniq})` : ''} · продаж ${(st.stats as { deals: number }).deals}, монет ${st.coins} · в конце: шаг ${String(st.ftue)}, подсказка «${String(st.hint)}», вкладка ${String(st.tab)}, окна ${st.windows.join(',') || '—'}`;
      await page.screenshot({ path: `test-results/bot-h-${tag}.png` });
      console.log(line);
      if (out) {
        mkdirSync(resolve(out, '..'), { recursive: true });
        appendFileSync(out, line + '\n');
      }
      expect(firstDeal, 'a sale within five minutes').not.toBeNull();
      expect(errors).toEqual([]);
    });
  });
}
