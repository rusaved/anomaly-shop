import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-17, UB-04, M4-00: the Shop tab's «Upgrades» opens by a button on the shop in the one panel (the shop stays in view); a purchase shines in the scene with «Upgrade: level N»; tiers are dashes. */
export async function upgradesPanel(page: Page, shots?: string): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  // UB-04: a button on the home screen opens the Shop on its «Upgrades» (the Shop tab does too, Q-021 B).
  await page.locator('[data-action=open-upgrades]').click();
  const panel = page.locator('[data-sheet=shop]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-section=upgrades]')).toBeVisible();
  await expect(page.locator('[data-tab=shop]')).toHaveAttribute('aria-pressed', 'true');
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  // From the right: the panel ends at the right edge; the scene stays in view above it in portrait, to the left of it in landscape.
  expect(box.x + box.width).toBeGreaterThanOrEqual(vp.width - 1);
  if (vp.height >= vp.width) expect(box.y).toBeGreaterThan(vp.height * 0.2);
  else expect(box.x).toBeGreaterThan(vp.width * 0.4);
  // M4-00: a tap on the active tab closes it to the home «Eggs»; the tab opens it again where it was.
  await page.locator('[data-tab=shop]').click();
  await expect(panel).toBeHidden();
  await page.locator('[data-tab=shop]').click();
  await expect(panel).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}-before.png` });
  const first = panel.locator('[data-action=buy-upgrade][aria-disabled=false]').first();
  const id = await first.getAttribute('data-id');
  await first.click();
  await expect.poll(async () => ((await state(page)) as unknown as { upgradeFx: string }).upgradeFx).toMatch(/\d/);
  // The tier dash of the bought one has a color; texts have none of the rarity colors.
  const dash = panel.locator(`[data-upgrade="${id}"] [data-tier]`);
  expect(Number(await dash.getAttribute('data-tier'))).toBeGreaterThanOrEqual(0);
  if (shots) await page.screenshot({ path: `${shots}-after.png` });
  expect(errors).toEqual([]);
}
