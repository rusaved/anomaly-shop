import { expect, type Page } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** UB-01, MU-02 (docs/07 rules 8, 11, 12): one tab bar of 7 labelled tabs, the whole width at the bottom, «Лавка» in the centre is home
 * (the shop scene); every other tab is a screen under the top bar; a second tap on the active tab brings back its main screen.
 * Q-026 B: «Season» is not a tab (a mark of the top bar after the release). */
const SCREENS = ['market', 'inventory', 'sales', 'eggs', 'chats', 'shop'] as const;
const TABS = ['market', 'inventory', 'sales', 'home', 'eggs', 'chats', 'shop'] as const;

export async function everyTabOpens(page: Page): Promise<void> {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 300 });
  await open(page);
  const vp = page.viewportSize()!;
  await expect(page.locator('[data-tab=season]')).toHaveCount(0);
  // The bar: the whole width, at the bottom, seven labels in the order of 07, «Лавка» in the centre.
  const bar = (await page.locator('#nav').boundingBox())!;
  expect(bar.x).toBeLessThanOrEqual(0.5);
  expect(bar.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(bar.y + bar.height).toBeGreaterThanOrEqual(vp.height - 1);
  expect(await page.locator('#nav [data-tab]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.tab))).toEqual([...TABS]);
  for (const tab of TABS) {
    const label = page.locator(`[data-tab=${tab}] .nav-label:visible`);
    await expect(label).toHaveCount(1);
    expect((await label.innerText()).trim().length).toBeGreaterThan(0);
    expect(await label.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  }
  // Home: «Лавка» with the scene; no panel of the first loop (deal card, egg buttons) anywhere.
  await expect(page.locator('[data-tab=home]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.home-ui')).toBeVisible();
  await expect(page.locator('#panel, .deal, [data-action=sell], [data-action=haggle], [data-action=buy-egg]')).toHaveCount(0);
  const hud = (await page.locator('.hud').boundingBox())!;
  // A tab is a screen: the whole width between the top bar and the tab bar (07 rule 11).
  for (const tab of SCREENS) {
    await page.locator(`[data-tab=${tab}]`).click();
    await expect(page.locator(`[data-sheet=${tab}]`)).toBeVisible();
    await expect(page.locator('.home-ui')).toBeHidden();
    await expect(page.locator(`[data-tab=${tab}]`)).toHaveAttribute('aria-pressed', 'true');
    const box = (await page.locator(`[data-sheet=${tab}]`).boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(0.5);
    expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(Math.abs(box.y - (hud.y + hud.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y + box.height - bar.y)).toBeLessThanOrEqual(1);
  }
  // 07 rule 12: one way back — «‹» on an inner page, or the active tab again; «Лавка» brings the scene back.
  await page.locator('[data-tab=eggs]').click();
  await page.locator('[data-sheet=eggs] [data-action=egg-card-egg_basic]').click();
  await expect(page.locator('[data-detail=egg-card]')).toBeVisible();
  await page.locator('[data-tab=eggs]').click();
  await expect(page.locator('[data-detail=egg-card]')).toBeHidden();
  await expect(page.locator('[data-sheet=eggs] [data-section=ladder]')).toBeVisible();
  await page.locator('[data-tab=home]').click();
  await expect(page.locator('.home-ui')).toBeVisible();
  await expect(page.locator('[data-tab=home]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
  expect((await state(page)).controllable).toBe(true);
}
