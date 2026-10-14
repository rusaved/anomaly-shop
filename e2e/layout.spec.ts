import { expect, test } from '@playwright/test';
import { collectErrors, expectInsideViewport, expectNoPageScroll, open, state } from './helpers.ts';

/** SCR-01 on the phone projects (375×812 portrait and 812×375 landscape, touch): nothing clipped, nothing scrolls. */
test('SCR-01 phone: HUD, home panel, tab bar and community buttons inside the viewport, no scroll', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '?mock_device=mobile');
  expect((await state(page)).device).toBe('mobile');
  await expectNoPageScroll(page);
  await expectInsideViewport(page, [
    '[data-hud=coins]',
    '[data-action=pause]',
    '[data-sheet=eggs]',
    '[data-sheet=eggs] .sheet-title',
    ...['market', 'inventory', 'sales', 'eggs', 'chats', 'shop', 'season'].map((tab) => `[data-tab=${tab}]`),
  ]);
  const vp = page.viewportSize()!;
  // UB-01: the community buttons (Q-007) at the end of the home panel: scrolled to, they fit.
  const tg = page.locator('[data-community=side] [data-action=community-telegram]');
  await tg.scrollIntoViewIfNeeded();
  await expectInsideViewport(page, ['[data-community=side] [data-action=community-telegram]', '[data-community=side] [data-action=community-vk]']);
  const home = (await page.locator('[data-sheet=eggs]').boundingBox())!;
  const bar = (await page.locator('#nav').boundingBox())!;
  if (vp.height >= vp.width) expect(home.width).toBeCloseTo(vp.width, 0);
  expect(home.y + home.height).toBeCloseTo(bar.y, 0);
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
  await expectInsideViewport(page, ['[data-hud=coins]', '[data-action=pause]', '[data-sheet=eggs]', '#nav']);
  const cls = await page.locator('#app').getAttribute('class');
  expect(cls).toContain(vp.height >= vp.width ? 'landscape' : 'portrait');
});
