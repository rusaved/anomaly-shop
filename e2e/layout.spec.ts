import { expect, test } from '@playwright/test';
import { collectErrors, expectInsideViewport, expectNoPageScroll, open, state } from './helpers.ts';

/** SCR-01 on the phone projects (375×812 portrait and 812×375 landscape, touch): nothing clipped, nothing scrolls. */
test('SCR-01 phone: the top bar, «Лавка» with its shelf row, the tab bar inside the viewport, no scroll', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '?mock_device=mobile');
  expect((await state(page)).device).toBe('mobile');
  await expectNoPageScroll(page);
  await expectInsideViewport(page, ['[data-hud=coins]', '[data-action=pause]', '[data-action=gifts]', '[data-action=leaders]', '[data-tab=home]', '[data-tab=eggs]', '.home-ui [data-action=work]']);
  // Q-026 B, Q-034 A: a fresh game shows «Лавка» and «Яйца»; the rest open step by step; «Season» is no tab.
  for (const tab of ['market', 'inventory', 'sales', 'chats', 'shop']) await expect(page.locator(`[data-tab=${tab}]`)).toBeHidden();
  await expect(page.locator('[data-tab=season]')).toHaveCount(0);
  const vp = page.viewportSize()!;
  // MU-03: portrait — the «Витрина» row under the room with a «+» on the free place; sideways — the eggs right of the room (l1).
  if (vp.height >= vp.width) await expectInsideViewport(page, ['[data-shelf-head]', '[data-action=shelf-add]']);
  else await expectInsideViewport(page, ['[data-sheet=home] [data-action=egg-buy-egg_basic]']);
  expect(errors).toEqual([]);
});

test('SCR-01 phone: pause and settings windows fit, every button is tappable', async ({ page }) => {
  await open(page, '?mock_device=mobile');
  await page.locator('[data-action=pause]').tap();
  await expectInsideViewport(page, ['[data-overlay=pause] .card', '[data-overlay=pause] [data-action=resume]', '[data-overlay=pause] [data-action=settings]', '[data-overlay=pause] [data-action=community-telegram]', '[data-overlay=pause] [data-action=community-vk]']);
  await page.locator('[data-overlay=pause] [data-action=settings]').tap();
  await expectInsideViewport(page, ['[data-overlay=settings] .card', '[data-overlay=settings] [data-action=sound]', '[data-overlay=settings] [data-action=lang-ru]', '[data-overlay=settings] [data-action=lang-en]', '[data-overlay=settings] [data-action=settings-close]']);
  await page.locator('[data-overlay=settings] [data-action=lang-en]').tap();
  await expectInsideViewport(page, ['[data-overlay=settings] [data-action=settings-close]', '[data-overlay=settings] [data-action=community-vk]']);
  await page.locator('[data-overlay=settings] [data-action=settings-close]').tap();
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
  await expectInsideViewport(page, ['[data-hud=coins]', '[data-action=pause]', '[data-tab=home]', '#nav']);
  const cls = await page.locator('#app').getAttribute('class');
  expect(cls).toContain(vp.height >= vp.width ? 'landscape' : 'portrait');
});
