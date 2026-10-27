import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/**
 * S-06 («Ресейл 19», from H-08): the bot of H plus the first upgrade (its second), the toasts over buttons or windows and two at once.
 * H-08 («Ресейл 18», from P-08): a bot plays the first five minutes of a fresh game on the phone sideways like a player who follows what calls:
 * the hinted button, the green ring, the finger, the main button of the top window or of the open tab, a tab with a count; with nothing
 * calling it feeds the pet on the shelf.
 * It measures the share of the time «Вылупился!» is on screen (the hatch show), the longest stretch with nothing new (no egg, pet, buyer,
 * sale, hint or window), how many taps on a thing that calls got no answer (nothing changed in 0.7 s) and the haggles: in a chat with
 * «Поднять цену» the bot raises every other time (a curious player), then sells. S_BOT_OUT=<label> writes the line to
 * docs/evidence/S/bot.txt (the table of the milestone's summary: before and after). Runs against any build (no «Поднять цену» — no haggle).
 */
const SIZES = [
  { width: 815, height: 290 },
  { width: 880, height: 405 },
  { width: 812, height: 330 },
];
type T = { __TEST__: { targets(): { slots: Array<{ x: number; y: number }> } | null } };
type S = Awaited<ReturnType<typeof state>> & Record<string, unknown> & { windows: string[] };
const out = process.env.S_BOT_OUT ? resolve(import.meta.dirname, '../docs/evidence/S/bot.txt') : null;
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
      // H-08: the player watches the strip to its end (that is the time the hatch takes in five minutes), then taps the big main button
      // once it wakes (its pause muted).
      const card = hatch.querySelector<HTMLElement>('.card-hatch');
      if (!card?.classList.contains('shown') || card.classList.contains('hatch-locked')) return { x: 0, y: 0, why: 'watch', wait: true };
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

    test(`S-06 bot: the first five minutes by what calls — first upgrade, toasts, stalls, dead taps, haggles @full @ ${tag}`, async ({ page }) => {
      test.setTimeout(RUN_MS + 90_000);
      const errors = collectErrors(page);
      // S-06: every toast on screen is checked each 100 ms — over a button (a tap would close the toast, not press it), shown while a
      // window is open, out of the screen; and two toasts at once.
      await page.addInitScript(() => {
        const log = { toasts: 0, overButton: [] as string[], overWindow: [] as string[], outside: [] as string[], twoAtOnce: 0 };
        (window as unknown as { __toastLog: typeof log }).__toastLog = log;
        const seen = new WeakSet<Element>();
        const bad = new WeakMap<Element, Set<string>>();
        const mark = (el: Element, what: 'overButton' | 'overWindow' | 'outside', on = '') => {
          const s = bad.get(el) ?? new Set<string>();
          if (s.has(what)) return;
          s.add(what);
          bad.set(el, s);
          log[what].push(((el as HTMLElement).dataset.text ?? el.textContent ?? '') + (on ? ` → ${on}` : ''));
        };
        setInterval(() => {
          const shown = [...document.querySelectorAll('.toast')].filter((t) => !t.classList.contains('out'));
          if (shown.length > 1) log.twoAtOnce += 1;
          for (const t of shown) {
            if (!seen.has(t)) {
              seen.add(t);
              log.toasts += 1;
            }
            const b = t.getBoundingClientRect();
            if (b.width === 0) continue;
            if (b.top < -0.5 || b.left < -0.5 || b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5) mark(t, 'outside');
            if (document.querySelector('.overlay:not([hidden]):not(.under)')) mark(t, 'overWindow');
            const hit = [...document.querySelectorAll<HTMLElement>('button, [data-action]')].find((e) => {
              if (t.contains(e) || e.offsetParent === null) return false;
              // Only the part of the button in sight: a list clips what it scrolled under the top bar.
              let r = e.getBoundingClientRect();
              for (let p = e.parentElement; p; p = p.parentElement) {
                if (getComputedStyle(p).overflowY === 'visible') continue;
                const c = p.getBoundingClientRect();
                r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
              }
              return r.width > 0 && r.height > 0 && r.top < b.bottom - 1 && r.bottom > b.top + 1 && r.left < b.right - 1 && r.right > b.left + 1;
            });
            if (hit) mark(t, 'overButton', hit.dataset.action ?? hit.className.split(' ')[0] ?? '');
          }
        }, 100);
      });
      await open(page);
      const t0 = Date.now();
      let firstDeal: number | null = null;
      let firstUpgrade: number | null = null;
      const upgradeWords = await page.evaluate(() => (window as unknown as { __TEST__: { t(k: string): string } }).__TEST__.t('ftue.upgrade'));
      let upgradeCalls = 0;
      let lastHint = '';
      const trace: string[] = [];
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
        // S-06: how often «Купи улучшение» called (seen before the tap: the bot presses what calls at once).
        if (before.hint === upgradeWords && lastHint !== upgradeWords) upgradeCalls += 1;
        if (before.hint !== lastHint) trace.push(`${((Date.now() - t0) / 1000).toFixed(0)}s ${String(before.tab)} «${String(before.hint)}» ◉${before.coins}`);
        lastHint = String(before.hint);
        let spot = Date.now() < restUntil ? null : await pick(page);
        if (spot && 'raise' in spot && spot.raise) {
          // Every other chat with «Поднять цену»: raise once, then whatever the buyer says, sell (or the buyer is gone).
          chatsSeen += 1;
          if (chatsSeen % 2 === 1) {
            const r = (spot as unknown as { raise: { x: number; y: number } }).raise;
            await page.touchscreen.tap(r.x, r.y);
            haggle.tries += 1;
            await page.waitForTimeout(1300);
            // S-03: the buyer's answer names a price both for «да» (the asked one) and the middle — «да» is the price the player asked.
            const num = (s: string) => Number(s.replace(/[^\d]/g, '') || NaN);
            const asked = num(await page.locator('.sheet:not([hidden]) .chat-lines .bubble.me').last().innerText().catch(() => ''));
            const last = await page.locator('.sheet:not([hidden]) .chat-lines .bubble').last().innerText().catch(() => '');
            const gone = !(await page.locator('.sheet:not([hidden]) [data-action=chat-sell]').isVisible());
            if (gone) haggle.gone += 1;
            else if (/\d/.test(last) && num(last) !== asked) haggle.middle += 1;
            else haggle.yes += 1;
            spot = gone ? null : await pick(page);
          }
        }
        if (spot && 'wait' in spot) {
          await page.waitForTimeout(250);
          spot = null;
        } else if (spot) {
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
        if (firstUpgrade === null && Object.values((s as { upgrades?: Record<string, number> }).upgrades ?? {}).some((n) => n > 0)) firstUpgrade = (now - t0) / 1000;
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
      const tl = await page.evaluate(() => (window as unknown as { __toastLog: { toasts: number; overButton: string[]; overWindow: string[]; outside: string[]; twoAtOnce: number } }).__toastLog);
      const list = (xs: string[]) => (xs.length ? ` (${[...new Set(xs)].slice(0, 4).join(' | ')})` : '');
      const uniq = [...new Set(dead)].map((w) => `${w}×${dead.filter((d) => d === w).length}`).join(', ');
      const line = `${process.env.S_BOT_OUT ?? ''} · ${tag} · вылупление ${((hatchMs / RUN_MS) * 100).toFixed(0)} % времени · первая продажа ${firstDeal === null ? 'нет' : `${firstDeal.toFixed(0)} с`} · первое улучшение ${firstUpgrade === null ? 'нет' : `${firstUpgrade.toFixed(0)} с`} (зов «Купи улучшение» ${upgradeCalls}) · тостов ${tl.toasts}: поверх кнопок ${tl.overButton.length}${list(tl.overButton)}, при окне ${tl.overWindow.length}${list(tl.overWindow)}, за краем ${tl.outside.length}${list(tl.outside)}, два сразу ${tl.twoAtOnce} · торг ${haggle.tries} (да ${haggle.yes}, середина ${haggle.middle}, ушёл ${haggle.gone}) · самый длинный простой ${(longest / 1000).toFixed(0)} с (${longestWhat}) · тапов без отклика ${dead.length}${uniq ? ` (${uniq})` : ''} · продаж ${(st.stats as { deals: number }).deals}, монет ${st.coins} · в конце: шаг ${String(st.ftue)}, подсказка «${String(st.hint)}», вкладка ${String(st.tab)}, окна ${st.windows.join(',') || '—'}, инкубаторы ${(st.incubators as Array<{ egg: string | null; ready?: boolean }>).map((i) => (i.egg ? (i.ready ? 'готово' : 'греется') : 'пусто')).join('/')}, витрина ${(st.shelf as unknown[]).length}, склад ${(st.creatures as unknown[]).length}, мои яйца ${JSON.stringify((st as { myEggs?: unknown }).myEggs ?? {})}`;
      await page.screenshot({ path: `test-results/bot-s-${tag}.png` });
      mkdirSync(resolve(import.meta.dirname, '../test-results'), { recursive: true });
      appendFileSync(resolve(import.meta.dirname, `../test-results/bot-s-trace-${tag}.txt`), trace.join('\n') + '\n');
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
