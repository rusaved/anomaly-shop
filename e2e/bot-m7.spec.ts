import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { closeHatch, collectErrors, listFromInventory, mockViolations, open, playToFirstDeal, state } from './helpers.ts';

/**
 * M7-05: a bot plays a fresh game for 10 real minutes like a player: the first minute by the hints, then hatches, feeds, lists,
 * sells in the chats, buys eggs and upgrades, closes whatever pops up. No console errors, no SDK limit broken, no dead end: the
 * deals keep coming. The minutes go to docs/evidence/M7/bot-session.txt (M7_BOT_OUT=1).
 */
type S = { coins: number; controllable: boolean; stats: { deals: number; hatched: number }; windows: string[] };
type T = { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } | null } };
const out = process.env.M7_BOT_OUT ? resolve(import.meta.dirname, '../docs/evidence/M7/bot-session.txt') : null;

const tryDo = async (fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
};
const visible = (page: Page, sel: string) => page.locator(sel).first().isVisible().catch(() => false);

async function round(page: Page): Promise<void> {
  await closeHatch(page).catch(() => false);
  for (const sel of ['[data-action=away-ok]', '[data-action=merchant-close]', '[data-action=rebirth-later]', '[data-overlay=rate] [data-action$=-close]', '[data-action=gifts-close]', '[data-action=settings-close]', '[data-action=pause-close]']) {
    if (await visible(page, sel)) await tryDo(() => page.locator(sel).first().click({ timeout: 2000 }));
  }
  await tryDo(() => page.locator('[data-tab=home]').click({ timeout: 2000 }));
  const t = await page.evaluate(() => (window as unknown as T).__TEST__.targets());
  for (const p of t?.incubators ?? []) await page.mouse.click(p.x, p.y);
  await closeHatch(page).catch(() => false);
  for (const p of (t?.slots ?? []).slice(0, 3)) for (let i = 0; i < 4; i++) await page.mouse.click(p.x, p.y);
  if (await tryDo(() => page.locator('[data-tab=sales]').click({ timeout: 2000 }))) {
    if (await visible(page, '[data-sheet=sales] [data-action=sale-add]')) await tryDo(() => listFromInventory(page));
  }
  if (await tryDo(() => page.locator('[data-tab=chats]').click({ timeout: 2000 }))) {
    const sell = page.locator('[data-sheet=chats] [data-action=chat-sell]');
    if (!(await sell.isVisible().catch(() => false))) await tryDo(() => page.locator('[data-sheet=chats] .chat-row:not(.closed)').last().click({ timeout: 2000 }));
    if (await sell.isVisible().catch(() => false)) await tryDo(() => sell.click({ timeout: 2000 }));
  }
  if (await tryDo(() => page.locator('[data-tab=eggs]').click({ timeout: 2000 }))) {
    const buy = page.locator('[data-sheet=eggs] [data-action^=egg-buy-]:not(.off)');
    if ((await buy.count()) > 0) await tryDo(() => buy.first().click({ timeout: 2000 }));
  }
  if (await tryDo(() => page.locator('[data-tab=shop]').click({ timeout: 2000 }))) {
    const up = page.locator('[data-action=buy-upgrade]:not(.off):visible');
    if ((await up.count()) > 0) await tryDo(() => up.first().click({ timeout: 2000 }));
  }
}

test('M7-05 bot: 10 minutes of a fresh game — no console errors, no SDK violations, the deals keep coming @full', async ({ page }) => {
  test.setTimeout(14 * 60_000);
  const errors = collectErrors(page);
  await open(page);
  const start = Date.now();
  await playToFirstDeal(page);
  const minutes: string[] = [];
  const deals: number[] = [];
  let next = 60_000;
  while (Date.now() - start < 10 * 60_000) {
    await round(page);
    if (Date.now() - start >= next) {
      const s = (await state(page)) as unknown as S;
      deals.push(s.stats.deals);
      minutes.push(`min ${next / 60_000}: coins ${Math.floor(s.coins)}, deals ${s.stats.deals}, hatched ${s.stats.hatched}, controllable ${s.controllable}, windows [${s.windows.join(',')}]`);
      next += 60_000;
    }
  }
  const end = (await state(page)) as unknown as S;
  const violations = await mockViolations(page);
  if (out) {
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, `M7-05 bot session ${new Date().toISOString().slice(0, 16)}, 1280×720, fresh game, real time\n`);
    appendFileSync(out, `${minutes.join('\n')}\nend: deals ${end.stats.deals}, hatched ${end.stats.hatched}; console errors ${errors.length}; SDK violations ${violations.length}\n`);
  }
  expect(end.controllable).toBe(true);
  // No dead end: deals in the first half and in the second half of the session.
  expect(deals.length).toBeGreaterThanOrEqual(8);
  expect(deals[4]! - deals[0]!).toBeGreaterThan(0);
  expect(end.stats.deals - deals[4]!).toBeGreaterThan(0);
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});
