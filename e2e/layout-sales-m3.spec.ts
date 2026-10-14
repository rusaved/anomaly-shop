import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-06 on the phone projects: the price slider in «My sales» moves by a tap on the track and by dragging the thumb. */
type C = { uid: string; askShare?: number };

test('M3-06 phone: the price slider works by tap and by drag', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page);
  await open(page, '?mock_device=mobile');
  await page.locator('[data-tab=sales]').tap();
  await page.locator('[data-sheet=sales] .card-sale').first().tap();
  const range = page.locator('[data-action=price-slider]');
  await expect(range).toBeVisible();
  const box = (await range.boundingBox())!;
  const share = async (): Promise<number> => ((await state(page)).creatures as C[]).find((c) => c.askShare !== undefined)?.askShare ?? 1;
  // A tap near the left end: far below the market (zone 0).
  await page.touchscreen.tap(box.x + 6, box.y + box.height / 2);
  await expect.poll(share).toBeLessThan(0.75);
  await expect(page.locator('.price-slider')).toHaveAttribute('data-zone', '0');
  // A drag of the thumb to the right end: far above the market (zone 5).
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', box.x + 6);
  for (let x = box.x + 6; x < box.x + box.width - 2; x += 20) await touch('touchMove', x);
  await touch('touchMove', box.x + box.width - 2);
  await touch('touchEnd', 0);
  await expect.poll(share).toBeGreaterThan(1.35);
  await expect(page.locator('.price-slider')).toHaveAttribute('data-zone', '5');
  expect(errors).toEqual([]);
});
