import { expect, test } from '@playwright/test';
import { collectErrors, mockViolations, open, playToFirstDeal, seedSave, state } from './helpers.ts';
import { buttonsSeenWhole, FRAMES_SAVE } from './frames-shared.ts';

/**
 * RD-06: the device profiles of qa/device-matrix.md — the same two checks on desktop (1280×720), mobile (an Android phone,
 * Chromium) and webkit (an iPhone, the Safari engine; runs where WebKit is installed, CI): the first minute up to the first deal
 * survives F5, and every tab opens with its buttons seen whole.
 */
test('RD-06 device: the first minute to the first deal, F5 keeps it, no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await playToFirstDeal(page);
  const before = (await state(page)) as { coins: number } & Awaited<ReturnType<typeof state>>;
  await page.waitForTimeout(600);
  await page.reload();
  await open(page);
  expect(((await state(page)) as typeof before).coins).toBe(before.coins);
  expect(await mockViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('RD-06 device: every tab opens, its buttons seen whole', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, FRAMES_SAVE);
  await open(page);
  const problems: string[] = [];
  for (const id of ['market', 'inventory', 'sales', 'eggs', 'chats', 'shop', 'home']) {
    await page.locator(`[data-tab=${id}]`).click();
    await expect(page.locator(`[data-tab=${id}]`)).toHaveClass(/active/);
    await page.waitForTimeout(250);
    for (const p of await buttonsSeenWhole(page)) problems.push(`${id}: ${p}`);
  }
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});
