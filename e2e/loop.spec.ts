import { expect, test, type Page } from '@playwright/test';
import { collectErrors, mockViolations, open, playToFirstDeal, state } from './helpers.ts';

/** M1 loop on the desktop project: F5 after a deal (SAV), an upgrade survives a reload (M1-08), English texts in the panel. */
type S = Awaited<ReturnType<typeof state>> & { ftue: string | null; stats: { deals: number }; upgrades: Record<string, number>; incubators: unknown[] };
const st = (page: Page) => state(page) as Promise<S>;

test('SAV-01 F5 after a deal: coins, the deal count and the creatures come back', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await playToFirstDeal(page);
  const before = await st(page);
  expect(before.coins).toBeGreaterThanOrEqual(10);
  await expect(page.locator('[data-hud=coins]')).toContainText(String(before.coins));
  await page.waitForTimeout(600);
  await page.reload();
  await open(page);
  const after = await st(page);
  expect(after.coins).toBe(before.coins);
  expect(after.stats.deals).toBe(1);
  expect(after.creatures).toHaveLength(before.creatures.length);
  expect(after.ftue).toBe('buyEgg');
  await expect(page.locator('[data-hud=coins]')).toContainText(String(before.coins));
  expect(await mockViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('M1-08 the upgrade shop: buying the second incubator changes the shop and survives F5', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await page.evaluate(() => (window as unknown as { __TEST__: { grant(n: number): void } }).__TEST__.grant(60));
  await page.locator('[data-tab=shop]').click();
  await expect(page.locator('[data-sheet=shop] [data-section=upgrades] .shop-item')).toHaveCount(2);
  await page.locator('[data-sheet=shop] [data-upgrade=incubator] [data-action=buy-upgrade]').click();
  await page.locator('[data-tab=home]').click();
  const s = await st(page);
  expect(s.incubators).toHaveLength(2);
  expect(s.coins).toBe(10);
  await page.waitForTimeout(600);
  await page.reload();
  await open(page);
  const back = await st(page);
  expect(back.incubators).toHaveLength(2);
  expect(back.upgrades).toEqual({ incubator: 1 });
  expect(errors).toEqual([]);
});

test('LOC-03 English: the home screen, the chats, the tab bar and the upgrade shop have no Russian text', async ({ page }) => {
  await open(page, '?mock_lang=en');
  await playToFirstDeal(page);
  expect(await page.locator('.home-ui').innerText()).not.toMatch(/[Ѐ-ӿ]/);
  await page.locator('[data-tab=eggs]').click();
  expect(await page.locator('[data-sheet=eggs]').innerText()).not.toMatch(/[Ѐ-ӿ]/);
  expect(await page.locator('#nav').innerText()).not.toMatch(/[Ѐ-ӿ]/);
  await page.locator('[data-tab=chats]').click();
  expect(await page.locator('[data-sheet=chats]').innerText()).not.toMatch(/[Ѐ-ӿ]/);
  // Q-026 B: the Shop tab opens once an upgrade is affordable.
  await page.evaluate(() => (window as unknown as { __TEST__: { grant(n: number): void } }).__TEST__.grant(100));
  await page.locator('[data-tab=shop]').click();
  expect(await page.locator('[data-sheet=shop]').innerText()).not.toMatch(/[Ѐ-ӿ]/);
});
