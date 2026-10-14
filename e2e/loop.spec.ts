import { expect, test, type Page } from '@playwright/test';
import { closeHatch, collectErrors, mockViolations, open, state } from './helpers.ts';

/** M1 loop on the desktop project: F5 after a deal (SAV), an upgrade survives a reload (M1-08), English texts in the panel. */
type S = Awaited<ReturnType<typeof state>> & { ftue: string | null; stats: { deals: number }; upgrades: Record<string, number>; incubators: unknown[] };
const st = (page: Page) => state(page) as Promise<S>;
const targets = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }>; slots: Array<{ x: number; y: number }> } } }).__TEST__.targets());

async function playToFirstDeal(page: Page): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (await closeHatch(page)) continue;
    const s = await st(page);
    if (s.stats.deals >= 1) return;
    const t = await targets(page);
    if (s.ftue === 'tapEgg') await page.mouse.click(t.incubators[0]!.x, t.incubators[0]!.y);
    else if (s.ftue === 'feed') await page.mouse.click(t.slots[0]!.x, t.slots[0]!.y);
    else if (s.ftue === 'sell') await page.locator('[data-action=sell]').click();
    await page.waitForTimeout(200);
  }
  throw new Error('no deal within the time');
}

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
  await page.locator('[data-action=upgrades]').click();
  await expect(page.locator('[data-overlay=upgrades] .shop-item')).toHaveCount(2);
  await page.locator('[data-upgrade=incubator] [data-action=buy-upgrade]').click();
  await page.locator('[data-overlay=upgrades] [data-action=back]').click();
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

test('LOC-03 English: the deal card, the action buttons and the upgrade shop have no Russian text', async ({ page }) => {
  await open(page, '?mock_lang=en');
  await playToFirstDeal(page);
  const panel = await page.locator('#panel').innerText();
  expect(panel.replace(/ВКонтакте/g, '')).not.toMatch(/[Ѐ-ӿ]/);
  await page.locator('[data-action=upgrades]').click();
  expect(await page.locator('[data-overlay=upgrades]').innerText()).not.toMatch(/[Ѐ-ӿ]/);
});
