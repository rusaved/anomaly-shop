import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** FB-07 (Q-041 B): «‹» on «Цена» goes back where it was opened from — «Склад», «Лавка» or «Продажи». */
test.use({ viewport: { width: 375, height: 650 }, hasTouch: true, isMobile: true });

const active = (page: import('@playwright/test').Page) => page.locator('[data-tab].active').first().getAttribute('data-tab');

test.beforeEach(async ({ page }) => {
  await seedSave(page, { coins: 0, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: [] });
  await open(page);
});

test('FB-07 from «Склад»: «На продажу» → «Цена» → «‹» back to «Склад»', async ({ page }) => {
  const errors = collectErrors(page);
  await page.locator('[data-tab=inventory]').click();
  await page.locator('[data-action=inv-list-e2e1]').click();
  await expect(page.locator('[data-detail=sale] [data-action=sale-go-e2e1]')).toBeVisible();
  await page.locator('[data-detail=sale] [data-action=sale-back]').click();
  await expect(page.locator('[data-detail=sale]')).toBeHidden();
  await expect(page.locator('[data-action=inv-list-e2e1]')).toBeVisible();
  expect(await active(page)).toBe('inventory');
  expect(errors).toEqual([]);
});

test('FB-07 from «Лавка»: «+» of the shelf → the pick → «Цена» → «‹» back to «Лавка»', async ({ page }) => {
  const errors = collectErrors(page);
  await page.locator('[data-tab=home]').click();
  await page.locator('[data-action=shelf-add]').first().click();
  await page.locator('[data-detail=sale] [data-action=sale-list-e2e1]').click();
  await expect(page.locator('[data-detail=sale] [data-action=sale-go-e2e1]')).toBeVisible();
  await page.locator('[data-detail=sale] [data-action=sale-back]').click();
  await expect(page.locator('[data-detail=sale]')).toBeHidden();
  expect(await active(page)).toBe('home');
  expect(errors).toEqual([]);
});

test('FB-07 from «Продажи»: «+ Выставить» → the pick → «Цена» → «‹» back to the pick, then the list', async ({ page }) => {
  const errors = collectErrors(page);
  await page.locator('[data-tab=sales]').click();
  await page.locator('[data-sheet=sales] [data-action=sale-add]').first().click();
  await page.locator('[data-detail=sale] [data-action=sale-list-e2e1]').click();
  await page.locator('[data-detail=sale] [data-action=sale-back]').click();
  await expect(page.locator('[data-detail=sale] [data-action=sale-list-e2e1]')).toBeVisible();
  await page.locator('[data-detail=sale] [data-action=sale-back]').click();
  await expect(page.locator('[data-detail=sale]')).toBeHidden();
  expect(await active(page)).toBe('sales');
  expect(errors).toEqual([]);
});
