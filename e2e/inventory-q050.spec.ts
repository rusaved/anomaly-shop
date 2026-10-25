import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, sellInChat, translated } from './helpers.ts';

/** Q-050: «Склад» said «питомцев: 1» over an empty list — the count was not set when the last pet left. Phone sideways, as the playtester saw it. */
const runSim = (page: import('@playwright/test').Page, sec: number) => page.evaluate((s) => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(s), sec);

test.use({ viewport: { width: 812, height: 375 } });

test('Q-050 the last pet sold: «Склад» counts 0 and shows the empty list', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, creatures: [{ uid: 'e2e1', species: 'kettle', level: 2, fed: 0, hatchedAt: 0, age: 0 }], showcase: [] });
  await open(page);
  const count = page.locator('[data-sheet=inventory] .seg-count');
  const label = (n: number) => translated(page, 'inventory.count').then((t) => t.replace('{n}', String(n)));
  await page.locator('[data-tab=inventory]').click();
  await expect(count).toHaveText(await label(1));
  await expect(page.locator('[data-sheet=inventory] [data-uid=e2e1]')).toBeVisible();
  // The one pet goes on the shelf, a buyer writes, the deal in the chat takes it.
  await page.locator('[data-tab=sales]').click();
  await page.locator('[data-sheet=sales] [data-action=sale-add]').click();
  await page.locator('[data-detail=sale] [data-action=sale-list-e2e1]').click();
  await page.locator('[data-detail=sale] [data-action=sale-go-e2e1]').click();
  await runSim(page, 25);
  await sellInChat(page);
  await page.locator('[data-tab=inventory]').click();
  await expect(page.locator('[data-sheet=inventory] [data-empty]')).toBeVisible();
  await expect(count).toHaveText(await label(0));
  expect(errors).toEqual([]);
});
