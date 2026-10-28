import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, state } from './helpers.ts';

/**
 * PH-04 («Ресейл 22», the staff's strict bot of passes 19–21): the first five minutes of a fresh game in the VK stand-in
 * (?mock=vk&fresh=1 over build:vk-e2e) by hints only — the hinted button, the green ring, the finger, the main button of the top window
 * (the hatch show watched to its end), else a tab with a dot or a count; nothing else, no feeding or tab of its own; a tab the bot stood on less than 15 s ago is not
 * opened again (it waits). The permanent run: 405×720 upright, 3+ upgrade levels in five minutes (PH-01: the chain of hints after the
 * first sale tore upright — 1 sale, 0 upgrades). PH_BOT_SIZES=405x880,815x290 — other sizes (@full), PH_BOT_OUT=<label> writes
 * docs/evidence/PH/bot.txt. Run: npx playwright test bot-ph --project=vk.
 */
const SIZES = (process.env.PH_BOT_SIZES ? process.env.PH_BOT_SIZES.split(',') : ['405x720']).map((t) => {
  const [width = 0, height = 0] = t.split('x').map(Number);
  return { width, height };
});
type S = Awaited<ReturnType<typeof state>> & Record<string, unknown> & { windows: string[] };
const out = process.env.PH_BOT_OUT ? resolve(import.meta.dirname, '../docs/evidence/PH/bot.txt') : null;
const RUN_MS = Number(process.env.PH_BOT_MS) || 300_000;
const BACK_MS = 15_000;

const answer = (s: S) =>
  JSON.stringify([s.windows, s.tab, s.hint, s.captions, s.coins, { ...(s.stats as object), taps: 0 }, s.incubators, (s.creatures as Array<{ xp?: number; level?: number }>).map((c) => [c.level, c.xp]), s.shelf, s.chats, s.queue]);
const news = (s: S) => JSON.stringify([(s.stats as { hatched: number; deals: number }).hatched, (s.stats as { deals: number }).deals, (s.creatures as unknown[]).length, s.chats, s.queue, s.hint, s.windows, (s.incubators as Array<{ egg: unknown }>).filter((i) => i.egg).length]);

/** What a hint calls to now (null — nothing calls); tab — the tab a hinted tab button opens. */
function pick(page: Page, recent: string[]) {
  return page.evaluate((recent) => {
    const vis = (e: Element | null): e is HTMLElement => {
      if (!e || (e as HTMLElement).offsetParent === null) return false;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)) return false;
      if (getComputedStyle(e).pointerEvents === 'none' || !e.matches('button, [data-action], [data-tab]')) return true;
      const hit = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)));
      return Boolean(hit && (e.contains(hit) || hit.contains(e) || hit.closest('.hint, .hint-ring, .tap-finger, .toast')));
    };
    const at = (el: HTMLElement, why: string, tab = '') => {
      const r = el.getBoundingClientRect();
      return { x: Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), y: Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)), why, tab };
    };
    const hatch = document.querySelector<HTMLElement>('[data-overlay=hatch]:not([hidden])');
    if (hatch) {
      const card = hatch.querySelector<HTMLElement>('.card-hatch');
      if (!card?.classList.contains('shown') || card.classList.contains('hatch-locked')) return { x: 0, y: 0, why: 'watch', tab: '', wait: true };
      const shop = hatch.querySelector<HTMLElement>('[data-action=hatch-shop]');
      return vis(shop) ? at(shop, 'hatch-shop') : null;
    }
    const main = [...document.querySelectorAll<HTMLElement>('.overlay:not([hidden]):not(.under) .mu-btn.main, .overlay:not([hidden]):not(.under) .btn-primary')].find(vis);
    const hinted = [...document.querySelectorAll<HTMLElement>('.is-hinted')].find(vis);
    if (hinted) return at(hinted, `hint:${hinted.dataset.action ?? hinted.dataset.tab ?? hinted.className.split(' ')[0]}`, hinted.dataset.tab ?? '');
    const ring = document.querySelector<HTMLElement>('.hint-ring');
    if (vis(ring)) return at(ring, `ring:${document.querySelector<HTMLElement>('.hint')?.dataset.hint ?? ''}`);
    const finger = document.querySelector<HTMLElement>('.tap-finger:not([hidden])');
    if (vis(finger)) return at(finger, 'finger');
    if (main) return at(main, `main:${main.dataset.action ?? ''}`);
    // A tab with a dot or a count calls too (the lowest call; the 15 s rule keeps the bot from bouncing between two of them).
    const badge = [...document.querySelectorAll<HTMLElement>('#nav [data-tab]')].find((t) => vis(t.querySelector('[data-badge]')) && t.getAttribute('aria-selected') !== 'true' && !t.classList.contains('active') && !recent.includes(t.dataset.tab ?? ''));
    if (badge) return at(badge, `badge:${badge.dataset.tab ?? ''}`, badge.dataset.tab ?? '');
    return null;
  }, recent);
}

for (const size of SIZES) {
  const tag = `${size.width}x${size.height}`;
  const full = tag === '405x720' && !process.env.PH_BOT_SIZES ? '' : ' @full';
  test.describe(tag, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test(`PH-04 strict bot: five minutes by hints only, back to a tab not before 15 s — 3+ upgrades${full} @ ${tag}`, async ({ page }) => {
      test.setTimeout(RUN_MS + 90_000);
      const errors = collectErrors(page);
      await page.addInitScript(() => {
        const log = { toasts: 0, overButton: [] as string[] };
        (window as unknown as { __toastLog: typeof log }).__toastLog = log;
        const seen = new WeakSet<Element>();
        const marked = new WeakSet<Element>();
        setInterval(() => {
          for (const t of document.querySelectorAll('.toast:not(.out)')) {
            if (!seen.has(t)) {
              seen.add(t);
              log.toasts += 1;
            }
            const b = t.getBoundingClientRect();
            if (b.width === 0 || marked.has(t)) continue;
            const hit = [...document.querySelectorAll<HTMLElement>('button, [data-action]')].find((e) => {
              if (t.contains(e) || e.offsetParent === null) return false;
              let r = e.getBoundingClientRect();
              for (let p = e.parentElement; p; p = p.parentElement) {
                if (getComputedStyle(p).overflowY === 'visible') continue;
                const c = p.getBoundingClientRect();
                r = new DOMRect(Math.max(r.left, c.left), Math.max(r.top, c.top), Math.min(r.right, c.right) - Math.max(r.left, c.left), Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
              }
              return r.width > 0 && r.height > 0 && r.top < b.bottom - 1 && r.bottom > b.top + 1 && r.left < b.right - 1 && r.right > b.left + 1;
            });
            if (hit) {
              marked.add(t);
              log.overButton.push(`${(t as HTMLElement).dataset.text ?? t.textContent ?? ''} → ${hit.dataset.action ?? hit.className.split(' ')[0] ?? ''}`);
            }
          }
        }, 100);
      });
      await open(page, '?mock=vk&fresh=1');
      const t0 = Date.now();
      const sec = () => ((Date.now() - t0) / 1000).toFixed(0);
      const trace: string[] = [];
      const bought: string[] = [];
      const sales: string[] = [];
      let levels = 0;
      let deals = 0;
      let lastHint = '';
      let lastNews = t0;
      let longest = 0;
      let longestWhat = '';
      let prevNews = news((await state(page)) as S);
      const dead: string[] = [];
      let streak = '';
      let streakN = 0;
      let restUntil = 0;
      let skipped = 0;
      // The last moment the bot stood on each tab.
      const onTab = new Map<string, number>();
      while (Date.now() - t0 < RUN_MS) {
        const before = (await state(page)) as S;
        onTab.set(String(before.tab), Date.now());
        if (before.hint !== lastHint) trace.push(`${sec()}s ${String(before.tab)} «${String(before.hint)}» ◉${before.coins}`);
        lastHint = String(before.hint);
        let spot = Date.now() < restUntil ? null : await pick(page, [...onTab].filter(([tab, at]) => tab !== before.tab && Date.now() - at < BACK_MS).map(([tab]) => tab));
        if (spot?.tab && spot.tab !== before.tab && Date.now() - (onTab.get(spot.tab) ?? -Infinity) < BACK_MS) {
          skipped += 1;
          spot = null;
        }
        if (spot && 'wait' in spot) await page.waitForTimeout(250);
        else if (spot) {
          await page.touchscreen.tap(spot.x, spot.y);
          trace.push(`${sec()}s   tap ${spot.why} · витрина ${(before.shelf as unknown[]).length}, питомцев ${(before.creatures as unknown[]).length}, окна ${before.windows.join(',')}`);
          await page.waitForTimeout(700);
          const after = (await state(page)) as S;
          if (answer(after) === answer(before)) {
            dead.push(spot.why);
            streakN = streak === spot.why ? streakN + 1 : 1;
            streak = spot.why;
            if (streakN >= 2) restUntil = Date.now() + 3000;
          } else streakN = 0;
        } else await page.waitForTimeout(500);
        const s = (await state(page)) as S;
        const now = Date.now();
        const lv = Object.values((s as { upgrades?: Record<string, number> }).upgrades ?? {}).reduce((a, n) => a + n, 0);
        for (; levels < lv; levels += 1) bought.push(`${sec()} с`);
        for (; deals < (s.stats as { deals: number }).deals; deals += 1) sales.push(sec());
        const n = news(s);
        if (n !== prevNews) {
          if (now - lastNews > longest) {
            longest = now - lastNews;
            longestWhat = `${((lastNews - t0) / 1000).toFixed(0)}–${sec()} с, «${String(s.hint) || '—'}»`;
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
      const tl = await page.evaluate(() => (window as unknown as { __toastLog: { toasts: number; overButton: string[] } }).__toastLog);
      const uniq = [...new Set(dead)].map((w) => `${w}×${dead.filter((d) => d === w).length}`).join(', ');
      const ups = Object.entries((st as { upgrades?: Record<string, number> }).upgrades ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
      const line = `${process.env.PH_BOT_OUT ?? ''} · строгий · ${tag} · продаж ${sales.length}${sales.length ? ` (${sales.slice(0, 6).join(', ')}${sales.length > 6 ? ', …' : ''} с)` : ''} · улучшений ${bought.length}${bought.length ? ` (${bought.join(', ')}: ${ups})` : ''} · самый длинный простой ${(longest / 1000).toFixed(0)} с (${longestWhat}) · тапов без отклика ${dead.length}${uniq ? ` (${uniq})` : ''} · вкладка раньше 15 с пропущена ${skipped} раз · тостов ${tl.toasts}, на кнопках ${tl.overButton.length}${tl.overButton.length ? ` (${[...new Set(tl.overButton)].slice(0, 3).join(' | ')})` : ''} · монет ${st.coins} · в конце: подсказка «${String(st.hint)}», вкладка ${String(st.tab)}`;
      mkdirSync(resolve(import.meta.dirname, '../test-results'), { recursive: true });
      await page.screenshot({ path: `test-results/bot-ph-${tag}.png` });
      appendFileSync(resolve(import.meta.dirname, `../test-results/bot-ph-trace-${tag}.txt`), trace.join('\n') + '\n');
      console.log(line);
      if (out) {
        mkdirSync(resolve(out, '..'), { recursive: true });
        appendFileSync(out, line + '\n');
      }
      expect(errors).toEqual([]);
      expect(bought.length, 'upgrade levels in five minutes by hints only').toBeGreaterThanOrEqual(3);
    });
  });
}
