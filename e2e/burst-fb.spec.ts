import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave } from './helpers.ts';

/** FB-09: the celebration of a rarity at «Вылупился!» — none for common, the whole screen for exclusive, a tap skips, reduced motion — the flash only. */
type T = { __TEST__: { hatch(uid: string, egg?: string): boolean } };
const pets = [
  { uid: 'c', species: 'kettle', level: 1, fed: 0, hatchedAt: 0, age: 0 },
  { uid: 'v', species: 'shroom', level: 1, fed: 0, hatchedAt: 0, age: 0 },
  { uid: 'x', species: 'moon_donut', level: 1, fed: 0, hatchedAt: 0, age: 0 },
];

async function reveal(page: import('@playwright/test').Page, uid: string): Promise<void> {
  expect(await page.evaluate((id) => (window as unknown as T).__TEST__.hatch(id), uid)).toBe(true);
  await page.waitForTimeout(300);
  // prefers-reduced-motion shows the result at once (no strip to skip).
  if (await page.locator('[data-action=hatch-skip]').isVisible()) await page.locator('[data-action=hatch-skip]').click();
  await expect(page.locator('[data-hatch-result]')).toBeVisible();
}

test('FB-09 common — no burst; VIP — sparks and salute; a tap skips; exclusive — the whole screen', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { creatures: pets, showcase: [] });
  await open(page);
  await reveal(page, 'c');
  await expect(page.locator('canvas.burst')).toBeHidden();
  await page.locator('[data-action=hatch-keep]').click();
  await reveal(page, 'v');
  await expect(page.locator('canvas.burst')).toBeVisible();
  await page.locator('[data-hatch-pic]').click();
  await expect(page.locator('canvas.burst')).toBeHidden();
  await page.locator('[data-action=hatch-keep]').click();
  await reveal(page, 'x');
  await expect(page.locator('.burst-flash.full')).toBeVisible();
  // ≤ 1.5 s, then it is gone by itself.
  await page.waitForTimeout(1700);
  await expect(page.locator('canvas.burst')).toBeHidden();
  await expect(page.locator('.burst-flash')).toBeHidden();
  expect(errors).toEqual([]);
});

test('FB-09 prefers-reduced-motion — the flash only', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedSave(page, { creatures: pets, showcase: [] });
  await open(page);
  await reveal(page, 'x');
  await expect(page.locator('.burst-flash')).toBeVisible();
  await expect(page.locator('canvas.burst')).toBeHidden();
});
