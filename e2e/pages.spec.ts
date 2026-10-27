import { expect, test } from '@playwright/test';

/** The producer link (dist-pages): mock loaded by a relative sdk.js, milestone label visible, debug panel available. */
test('pages: boots on the relative mock, shows the milestone label and the debug panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => (window as unknown as { __YA_MOCK__: { readyCalled: boolean } }).__YA_MOCK__.readyCalled);
  await expect(page.locator('[data-build-label]')).toBeVisible();
  await expect(page.locator('[data-build-label]')).toHaveText(/^[A-Z][A-Z0-9]* · \d{4}-\d{2}-\d{2} · [0-9a-f]{7}|local$/);
  await expect(page.locator('.lil-gui')).toBeVisible();
  expect(errors).toEqual([]);
});

/** N-05: the producer's check link on the Pages link: ?fresh=1 with presets, the build line in «Настройки». */
test('N-05 pages: ?fresh=1&coins=345 — a new save with 345 coins; «сборка <хеш>» in the settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh=1&coins=345');
  await page.waitForFunction(() => (window as unknown as { __YA_MOCK__: { readyCalled: boolean } }).__YA_MOCK__.readyCalled);
  await expect(page.locator('[data-hud=coins]')).toContainText('345');
  await page.locator('[data-action=pause]').click();
  await page.locator('[data-action=settings]').click();
  await expect(page.locator('[data-build-line]')).toHaveText(/^(сборка|build) ([0-9a-f]{7}|local)$/);
  expect(errors).toEqual([]);
});
