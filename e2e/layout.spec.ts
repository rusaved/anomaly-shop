import { expect, test } from '@playwright/test';
import { collectErrors, expectInsideViewport, expectNoPageScroll, open, state } from './helpers.ts';

/** SCR-01 on the phone projects (375×812 portrait and 812×375 landscape, touch): nothing clipped, nothing scrolls. */
test('SCR-01 phone: HUD, panel and side buttons inside the viewport, no scroll', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '?mock_device=mobile');
  expect((await state(page)).device).toBe('mobile');
  await expectNoPageScroll(page);
  await expectInsideViewport(page, [
    '[data-hud=coins]',
    '[data-action=pause]',
    '#panel',
    '[data-panel=title]',
    '[data-action=sell]',
    '[data-action=haggle]',
    '[data-action=wait]',
    '[data-action=buy-egg]',
    '[data-action=upgrades]',
    ...['market', 'inventory', 'sales', 'eggs', 'chats', 'shop', 'season'].map((tab) => `[data-tab=${tab}]`),
  ]);
  const vp = page.viewportSize()!;
  // M3-03: the side community buttons stay in landscape; in portrait they live in pause and settings (the panel gave room to the tabs).
  if (vp.width > vp.height) await expectInsideViewport(page, ['[data-community=side] [data-action=community-telegram]', '[data-community=side] [data-action=community-vk]']);
  const panel = (await page.locator('#panel').boundingBox())!;
  if (vp.height >= vp.width) expect(panel.width).toBeCloseTo(vp.width, 0);
  else expect(panel.height + (await page.locator('#nav').boundingBox())!.height).toBeCloseTo(vp.height, 0);
  expect(errors).toEqual([]);
});

test('SCR-01 phone: pause and settings windows fit, every button is tappable', async ({ page }) => {
  await open(page, '?mock_device=mobile');
  await page.locator('[data-action=pause]').tap();
  await expectInsideViewport(page, ['[data-overlay=pause] .card', '[data-overlay=pause] [data-action=resume]', '[data-overlay=pause] [data-action=settings]', '[data-overlay=pause] [data-action=community-telegram]', '[data-overlay=pause] [data-action=community-vk]']);
  await page.locator('[data-overlay=pause] [data-action=settings]').tap();
  await expectInsideViewport(page, ['[data-overlay=settings] .card', '[data-overlay=settings] [data-action=sound]', '[data-overlay=settings] [data-action=lang-ru]', '[data-overlay=settings] [data-action=lang-en]', '[data-overlay=settings] [data-action=back]']);
  await page.locator('[data-overlay=settings] [data-action=lang-en]').tap();
  await expectInsideViewport(page, ['[data-overlay=settings] [data-action=back]', '[data-overlay=settings] [data-action=community-vk]']);
  await page.locator('[data-overlay=settings] [data-action=back]').tap();
  await page.locator('[data-overlay=pause] [data-action=resume]').tap();
  expect((await state(page)).pause).toEqual([]);
});

test('SAV-03 rotation keeps the state and the layout follows', async ({ page }) => {
  await open(page, '?debug=1&mock_device=mobile');
  await page.getByText('debug').first().tap();
  await page.getByRole('button', { name: '+100 coins' }).tap();
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(300);
  const s = await state(page);
  expect(s.coins).toBe(100);
  expect(s.controllable).toBe(true);
  await expectNoPageScroll(page);
  await expectInsideViewport(page, ['[data-hud=coins]', '[data-action=pause]', '#panel']);
  const cls = await page.locator('#app').getAttribute('class');
  expect(cls).toContain(vp.height >= vp.width ? 'landscape' : 'portrait');
});
