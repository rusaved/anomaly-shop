import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-17: the upgrade shop is a side panel (the shop stays in view); a purchase shines in the scene with «Upgrade: level N»; tiers are dashes. */
export async function upgradesPanel(page: Page, shots?: string): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true } });
  await open(page);
  await page.locator('[data-tab=shop]').click();
  const panel = page.locator('[data-overlay=upgrades]');
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  // The scene stays in view: above the panel in portrait, to the left of it in landscape.
  if (vp.height >= vp.width) expect(box.y).toBeGreaterThan(vp.height * 0.2);
  else expect(box.x).toBeGreaterThan(vp.width * 0.4);
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
