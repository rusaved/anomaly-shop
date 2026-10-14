import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';

test('UB-07 PC 1280×720: every screen — text 12 px and up, buttons 44 px and up, no build label', async ({ page }) => {
  await everyScreenReadable(page);
});
