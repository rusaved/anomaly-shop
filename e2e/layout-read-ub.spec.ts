import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';

test('UB-07 phone 375×812: every screen — text 12 px and up, buttons 44 px and up, no build label', async ({ page }) => {
  test.skip(page.viewportSize()!.width > page.viewportSize()!.height, 'portrait phone (UB-07 criterion)');
  await everyScreenReadable(page);
});
