import { expect, test } from '@playwright/test';
import { collectErrors, mockCalls, mockViolations, open, seedSave } from './helpers.ts';

/** M4-04 on the Yandex mock: «Leaders» in the top bar — a lite player signs in by the button, the score goes to the board, the own row shows. */
test('M4-04 leaders: sign in by the button, the score on the board, no SDK violations', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { stats: { deals: 40, coinsEarned: 12_345, hatched: 50, taps: 300, levelUps: 9, haggles: 1, xp: 60 } });
  await open(page);
  await page.locator('[data-action=leaders]').click();
  const panel = page.locator('[data-overlay=leaders]');
  await expect(panel).toBeVisible();
  await panel.locator('[data-action=leaders-login]').click();
  await expect(panel.locator('[data-me]')).toBeVisible();
  await expect(panel.locator('[data-me] .leaders-score')).toContainText(/12\s?345/);
  await expect(panel.locator('[data-action=leaders-login]')).toHaveCount(0);
  const calls = await mockCalls(page);
  expect(calls).toContain('auth.openAuthDialog');
  expect(calls).toContain('leaderboards.setScore');
  expect(await mockViolations(page)).toEqual([]);
  // A tab closes it like any window (UB-02).
  await page.locator('[data-tab=eggs]').click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
