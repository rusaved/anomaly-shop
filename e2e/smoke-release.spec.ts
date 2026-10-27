import { expect, test } from '@playwright/test';

/** BLD-04: the release archive (unpacked, served with the SDK mock on /sdk.js) boots clean and carries no dev tools. */
test('BLD-04 release boots on the mock, ready once, no console errors, no debug or test API', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => (window as unknown as { __YA_MOCK__: { readyCalled: boolean } }).__YA_MOCK__.readyCalled);
  await expect(page.locator('#preloader')).toHaveClass(/hidden/);
  await expect(page.locator('[data-hud=coins]')).toBeVisible();
  const flags = await page.evaluate(() => ({
    test: '__TEST__' in window,
    gui: document.querySelector('.lil-gui') !== null,
    label: document.querySelector('[data-build-label]') !== null,
    ready: (window as unknown as { __YA_MOCK__: { calls: Array<{ name: string }> } }).__YA_MOCK__.calls.filter((c) => c.name === 'LoadingAPI.ready').length,
    violations: (window as unknown as { __YA_MOCK__: { violations: string[] } }).__YA_MOCK__.violations,
  }));
  expect(flags.test).toBe(false);
  expect(flags.gui).toBe(false);
  expect(flags.label).toBe(false);
  expect(flags.ready).toBe(1);
  expect(flags.violations).toEqual([]);
  expect(errors).toEqual([]);
});

/** N-05: the producer's check link is ignored in the release archive: no new save, no presets, no build line. */
test('N-05 release ignores ?fresh=1 and the presets', async ({ page }) => {
  await page.goto('/?fresh=1&coins=777&deals=5&time=9');
  await page.waitForFunction(() => (window as unknown as { __YA_MOCK__: { readyCalled: boolean } }).__YA_MOCK__.readyCalled);
  await expect(page.locator('[data-hud=coins]')).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await page.locator('[data-hud=coins]').innerText()).not.toContain('777');
  expect(await page.locator('[data-build-line]').count()).toBe(0);
});
