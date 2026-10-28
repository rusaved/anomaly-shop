import { expect, test, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state, translated } from './helpers.ts';

/** UB-06: the first minute by taps only (phone, both orientations) and one hint for each tab on its first visit. */
type S = Awaited<ReturnType<typeof state>> & { stats: { deals: number }; incubators?: unknown; ftue: string | null };
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets());
/** What the hint points at now: no hint, a scene ring, or a button — and whether that button is a closed (locked) thing. */
const pointed = (page: Page) =>
  page.evaluate(() => {
    const hint = document.querySelector<HTMLElement>('.hint');
    if (!hint || hint.hidden) return { shown: false, locked: false, count: 0 };
    const glow = [...document.querySelectorAll<HTMLElement>('.is-hinted')];
    return { shown: true, locked: glow.some((el) => el.closest('.locked') !== null || el.getAttribute('aria-disabled') === 'true'), count: document.querySelectorAll('.hint:not([hidden])').length };
  });

test('UB-06 first minute by taps only: egg → To the shop → a letter → Sell with no counter → a new egg, within 60 s; no hint at a closed thing', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '?mock_device=mobile');
  const start = Date.now();
  const check = async () => expect((await pointed(page)).locked).toBe(false);
  await check();
  // The egg: one tap opens it (UB-03); the strip, then «To the shop».
  const egg = (await targets(page)).incubators[0]!;
  if (page.viewportSize()!.width < 900) await page.touchscreen.tap(egg.x, egg.y);
  else await page.mouse.click(egg.x, egg.y);
  await page.locator('[data-overlay=hatch] [data-action=hatch-shop]').click({ timeout: 10_000 });
  await check();
  // A buyer writes: the Chats tab gets a badge; the hint leads there (no «Feed» over an offer).
  await expect(page.locator('[data-tab=chats] [data-badge]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => ((await state(page)) as S).ftue).toBe('sell');
  await check();
  await page.locator('[data-tab=chats]').click();
  await check();
  await page.locator('[data-sheet=chats] .chat-row:not(.closed)').first().click();
  // The first deal has no haggling: «Sell» and «Decline», no counter offer.
  await expect(page.locator('[data-action=chat-sell]')).toBeVisible();
  await expect(page.locator('[data-action=chat-counter]')).toHaveCount(0);
  await check();
  await page.locator('[data-action=chat-sell]').click();
  await expect.poll(async () => ((await state(page)) as S).stats.deals).toBe(1);
  // A new egg: the hint at the free gift egg, then «Забрать».
  await page.locator('[data-tab=eggs]').click();
  await expect.poll(async () => ((await state(page)) as S).ftue).toBe('buyEgg');
  await check();
  // Круг правок FB-3 п. 6: the hint leads to the free gift egg (the first deal may pay less than an egg costs) — take it.
  await page.locator('[data-sheet=eggs] [data-action=egg-free-egg_gift]').click();
  await expect.poll(async () => ((await state(page)) as S).ftue).toBe('hatchRare');
  expect(Date.now() - start).toBeLessThan(60_000);
  expect(errors).toEqual([]);
});

test('UB-06 each tab gets one hint on its first visit, none on the next; never at a closed thing', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await open(page, '?mock_device=mobile');
  // MU-02: «Лавка» is home; every other tab (the eggs included) has its first hint; «Season» is no tab.
  await expect(page.locator('[data-tab=season]')).toHaveCount(0);
  for (const tab of ['market', 'inventory', 'sales', 'chats', 'shop', 'eggs']) {
    await page.locator(`[data-tab=${tab}]`).click();
    // PH-03 (Q-084 A): the first «Магазин» with no room off the words of the list — the frame alone, no bubble.
    await page.waitForTimeout(200);
    if (tab === 'shop' && !(await page.locator('.hint:not([hidden])').count())) await expect(page.locator('[data-sheet=shop] .is-hinted')).toHaveCount(1);
    else {
      await expect(page.locator('.hint:not([hidden]) [data-hint-text]'), tab).toHaveText(await translated(page, `ftue.tab.${tab}`));
      const p = await pointed(page);
      expect(p.count, tab).toBe(1);
      expect(p.locked, tab).toBe(false);
    }
    await page.waitForTimeout(350);
    await page.locator('[data-tab=home]').click();
    await expect(page.locator('.hint')).toBeHidden();
    await page.locator(`[data-tab=${tab}]`).click();
    await page.waitForTimeout(300);
    // PH-01 (проход штаба 28.10): a buyer waiting — «Чаты» frame the chat at once, on any visit.
    if (tab === 'chats' && (await page.locator('.hint[data-hint=sell]:not([hidden])').count())) await expect(page.locator('[data-sheet=chats] .is-hinted').first()).toBeVisible();
    else await expect(page.locator('.hint'), `${tab} second visit`).toBeHidden();
    await page.locator('[data-tab=home]').click();
  }
  expect(errors).toEqual([]);
});
