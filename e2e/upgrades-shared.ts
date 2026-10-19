import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-17, UB-04, MU-10: «Улучшения» on the scene opens the Store on its «Улучшения»; a purchase shines in the scene with «Upgrade: level N». */
export async function upgradesPanel(page: Page, shots?: string): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  // UB-04: a button opens the Shop on its «Upgrades» (FB-10: with the Store under «Лавка» it is the «+» of the balance; the Shop tab does too, Q-021 B).
  const sceneButton = page.locator('[data-action=open-upgrades]');
  await (await sceneButton.isVisible() ? sceneButton : page.locator('[data-action=balance]')).click();
  const panel = page.locator('[data-sheet=shop]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-section=upgrades]')).toBeVisible();
  await expect(page.locator('[data-tab=shop]')).toHaveAttribute('aria-pressed', 'true');
  // MU-02: the Store is a screen of its own under the top bar (07 rule 11); the tab again keeps it.
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeLessThanOrEqual(0.5);
  expect(box.x + box.width).toBeGreaterThanOrEqual(vp.width - 1);
  await page.locator('[data-tab=shop]').click();
  await expect(panel).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}-before.png` });
  const first = panel.locator('[data-action=buy-upgrade][aria-disabled=false]').first();
  const id = await first.getAttribute('data-id');
  const order = () => panel.locator('[data-section=upgrades] [data-upgrade]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.upgrade));
  const before = await order();
  // MU-12 (the usability review): a purchase never moves the cards — the next tap lands where the finger expects; a tap at once after it is ignored.
  // A real double tap (two clicks in a row, no waiting between them): two separate clicks of a slow test machine can be 450 ms apart.
  await first.dblclick();
  expect(await order()).toEqual(before);
  expect(((await state(page)) as unknown as { upgrades: Record<string, number> }).upgrades[id ?? ''] ?? 0).toBe(1);
  // FB-12: the row flashes, the scene says «+N» of the effect at the thing bought.
  await expect(panel.locator(`[data-upgrade="${id}"].bought`)).toHaveCount(1);
  await expect.poll(async () => ((await state(page)) as unknown as { upgradeFx: string }).upgradeFx).toMatch(/^\+\d+%?$/);
  // MU-10: the bought level shows on its card (dots or «куплено»), the price button stays dark.
  await expect.poll(async () => ((await state(page)) as unknown as { upgrades: Record<string, number> }).upgrades[id ?? ''] ?? 0).toBeGreaterThan(0);
  await expect(panel.locator(`[data-upgrade="${id}"] [data-action=buy-upgrade]`)).not.toHaveClass(/main/);
  if (shots) await page.screenshot({ path: `${shots}-after.png` });
  expect(errors).toEqual([]);
}
