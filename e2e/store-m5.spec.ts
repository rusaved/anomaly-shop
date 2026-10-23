import { expect, test, type Page } from '@playwright/test';
import { collectErrors, events, mockCalls, open, readability, seedSave } from './helpers.ts';

// M5-04, M5-05: «Магазин → Акции» behind the payments flag (?payments=1 in test builds): deals with the starter timer, coins,
// «Без рекламы», the note on game money; purchases on the mock — buy, cancel, error, restore «no ads» after a reload.
type T = { __TEST__: { runSim(s: number): number } };
const runSim = (page: Page, s: number): Promise<number> => page.evaluate((x) => (window as unknown as T).__TEST__.runSim(x), s);
const saved = (page: Page): Promise<{ coins: number; shop?: { noAds: boolean; bought: Record<string, number>; starterEnds: number }; myEggs?: Record<string, number> }> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('anomaly-shop:save') ?? '{}'));

async function openDeals(page: Page): Promise<void> {
  await runSim(page, 181);
  await page.locator('[data-tab=shop]').click();
  await page.locator('[data-sheet=shop] [data-sub=deals]').click();
  await expect(page.locator('[data-section=deals] [data-store=starter]')).toBeVisible();
}

test.describe('M5-04 store', () => {
  test('payments off (game.json): «Акции» stays off, no store at all', async ({ page }) => {
    await seedSave(page);
    await open(page);
    await page.locator('[data-tab=shop]').click();
    await expect(page.locator('[data-sheet=shop] [data-sub=deals]')).toHaveAttribute('aria-disabled', 'true');
    expect(await mockCalls(page)).not.toContain('getPayments');
  });

  test('not in the first 3 minutes; then deals with the 48 h timer, coins, «Без рекламы», the note; prices from the catalog', async ({ page }) => {
    const errors = collectErrors(page);
    await seedSave(page);
    await open(page, '?payments=1&mock_catalog=pack_starter:49,no_ads:99');
    await page.locator('[data-tab=shop]').click();
    await page.locator('[data-sheet=shop] [data-sub=deals]').click();
    await expect(page.locator('[data-section=deals] .store-soon')).toBeVisible();
    await openDeals(page);
    const box = page.locator('[data-section=deals]');
    await expect(box.locator('[data-store-timer]')).toHaveText(/4[78]:\d\d:\d\d/);
    for (const id of ['season', 'mega', 'coins_s', 'coins_m', 'coins_l', 'no_ads']) await expect(box.locator(`[data-store=${id}]`)).toBeVisible();
    await expect(box.locator('[data-action=store-buy-starter]')).toHaveText('49 YAN');
    await expect(box.locator('[data-action=store-buy-season]')).toHaveText('79 ян');
    await expect(box.locator('.store-note')).toContainText('не обмениваются на деньги');
    expect((await events(page)).some((e) => e.name === 'gameOfferView')).toBe(true);
    const r = await readability(page);
    // The tab badge «1» of the bar is 11 px on a computer since MU (not this screen).
    expect([...r.small, ...r.tiny, ...r.covered, ...r.cut].filter((x) => !x.startsWith('span.nav-badge'))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a purchase on the mock: the pack comes and is consumed; the starter deal goes once bought', async ({ page }) => {
    await seedSave(page);
    await open(page, '?payments=1');
    await openDeals(page);
    const before = await saved(page);
    await page.locator('[data-action=store-buy-starter]').click();
    await expect(page.locator('.toast')).toContainText('Покупка в лавке');
    const after = await saved(page);
    expect(after.coins).toBeGreaterThan(before.coins);
    expect(after.shop?.bought.starter).toBe(1);
    await expect(page.locator('[data-section=deals] [data-store=starter]')).toHaveCount(0);
    const calls = await mockCalls(page);
    expect(calls).toContain('payments.purchase');
    expect(calls).toContain('payments.consumePurchase');
    expect((await events(page)).filter((e) => e.name === 'gamePurchaseSuccess')).toHaveLength(1);
  });

  test('cancel gives nothing and says nothing; an error says the money was not taken', async ({ page }) => {
    await seedSave(page);
    await open(page, '?payments=1&mock_pay=cancel');
    await openDeals(page);
    const before = await saved(page);
    await page.locator('[data-action=store-buy-coins_s]').click();
    await page.waitForTimeout(300);
    expect((await saved(page)).coins).toBe(before.coins);
    await page.goto('/?payments=1&mock_pay=error');
    await page.waitForFunction(() => (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable);
    await openDeals(page);
    await page.locator('[data-action=store-buy-coins_s]').click();
    await expect(page.locator('.toast')).toContainText('не списаны');
  });

  test('«Без рекламы»: bought, then restored after a reload from the platform purchases (getPurchases)', async ({ page }) => {
    await seedSave(page);
    await open(page, '?payments=1&mock_banner=1');
    await openDeals(page);
    await expect(page.locator('#__ya_mock_banner__')).toBeVisible();
    await page.locator('[data-action=store-buy-no_ads]').click();
    await expect(page.locator('[data-store=no_ads] .day-got')).toBeVisible();
    await expect(page.locator('#__ya_mock_banner__')).toHaveCount(0);
    // A new device: the save is fresh, the purchase lives on the platform.
    await page.evaluate(() => localStorage.removeItem('anomaly-shop:save'));
    await page.evaluate(() => localStorage.removeItem('__yasdk_mock_player__'));
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable);
    await expect.poll(async () => (await saved(page)).shop?.noAds).toBe(true);
  });

  test('M5-06 the review window asks once: from the 3rd session after 5 minutes of play, the chest after the platform window', async ({ page }) => {
    await seedSave(page, { stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1, sessions: 2 } });
    await open(page);
    await page.waitForTimeout(5500);
    await expect(page.locator('[data-overlay=rate]')).toBeHidden();
    await runSim(page, 301);
    await expect(page.locator('[data-overlay=rate]')).toBeVisible({ timeout: 8000 });
    expect((await events(page)).some((e) => e.name === 'review_ask')).toBe(true);
    await page.locator('[data-overlay=rate] [data-action=rate-send]').click();
    await expect(page.locator('[data-overlay=rate]')).toBeHidden();
    expect(await mockCalls(page)).toContain('feedback.requestReview');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as { __TEST__?: { state(): { controllable: boolean } } }).__TEST__?.state().controllable);
    await runSim(page, 301);
    await page.waitForTimeout(5500);
    await expect(page.locator('[data-overlay=rate]')).toBeHidden();
  });

  test('M5-06 the 1st session without a purchase: no review window', async ({ page }) => {
    await seedSave(page);
    await open(page);
    await runSim(page, 301);
    await page.waitForTimeout(5500);
    await expect(page.locator('[data-overlay=rate]')).toBeHidden();
  });
});
