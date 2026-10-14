import { expect, type Page } from '@playwright/test';
import { closeHatch, collectErrors, open, readability, seedSave } from './helpers.ts';

/**
 * UB-07, UB-09: every screen and window of the first five minutes, one after another — no visible text under 12 px,
 * no button under 44 px on its short side, no build label without ?debug=1.
 */
const runSim = (page: Page, sec: number) => page.evaluate((s) => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(s), sec);
const grant = (page: Page, n: number) => page.evaluate((c) => (window as unknown as { __TEST__: { grant(n: number): void } }).__TEST__.grant(c), n);
const targets = (page: Page) => page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } } }).__TEST__.targets());

export async function everyScreenReadable(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 5000, showcase: [], stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1, xp: 8 } });
  await open(page);
  await expect(page.locator('[data-build-label]')).toHaveCount(0);
  const found: Record<string, { small: string[]; tiny: string[]; covered: string[] }> = {};
  const look = async (where: string) => {
    await page.waitForTimeout(250);
    const r = await readability(page);
    if (r.small.length || r.tiny.length || r.covered.length) found[where] = r;
  };
  const tab = async (id: string) => {
    await page.locator(`[data-tab=${id}]`).click();
    await look(`tab ${id}`);
  };
  await look('home');
  await page.locator('[data-action=egg-card-egg_basic]').click();
  await look('egg card');
  // A new egg in the incubator: taps until it opens, the hatch window.
  await page.locator('[data-action=egg-buy-1]').click();
  await page.locator('[data-tab=eggs]').click();
  const egg = (await targets(page)).incubators[0]!;
  for (let i = 0; i < 30 && !(await page.locator('[data-overlay=hatch]').isVisible()); i++) {
    if (page.viewportSize()!.width < 900) await page.touchscreen.tap(egg.x, egg.y);
    else await page.mouse.click(egg.x, egg.y);
    await page.waitForTimeout(120);
  }
  await expect(page.locator('[data-overlay=hatch]')).toBeVisible();
  await look('hatch strip');
  // A tap that landed outside the card already skipped the run (UB-02): then the result is on screen.
  const skip = page.locator('[data-overlay=hatch] [data-action=hatch-skip]');
  if (await skip.isVisible()) await skip.click();
  await look('hatch result');
  await closeHatch(page);
  await tab('market');
  const lot = page.locator('[data-sheet=market] .card-lot:not(.sold)').first();
  if (await lot.isVisible()) {
    await lot.click();
    await look('lot card');
  }
  await tab('inventory');
  await tab('sales');
  await page.locator('[data-sheet=sales] [data-action=sale-add]').first().click();
  await look('sale pick');
  // UB-10: listed — the price slider opens at once.
  await page.locator('[data-overlay=sale] [data-action^=sale-list-]').first().click();
  await expect(page.locator('[data-overlay=sale] .price-range')).toBeVisible();
  await look('sale card');
  await runSim(page, 25);
  await tab('chats');
  await page.locator('[data-sheet=chats] .chat-row').first().click();
  await look('chat');
  await tab('shop');
  await tab('season');
  await page.locator('[data-tab=eggs]').click();
  await page.locator('[data-action=reputation]').click();
  await look('reputation');
  // A window closes by a tab tap (UB-02); the top bar buttons open the next one.
  for (const [action, where] of [['gifts', 'gifts'], ['work', 'work']] as const) {
    await page.locator('[data-tab=eggs]').click();
    await page.locator(`[data-action=${action}]`).click();
    await look(where);
  }
  await page.locator('[data-tab=eggs]').click();
  await page.locator('[data-action=pause]').click();
  await look('pause');
  await page.locator('[data-overlay=pause] [data-action=settings]').click();
  await look('settings');
  expect(found).toEqual({});
  expect(errors).toEqual([]);
}
