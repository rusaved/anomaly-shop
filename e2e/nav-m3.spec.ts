import { test } from '@playwright/test';
import { everyTabOpens } from './nav-shared.ts';

/** M3-03 on desktop 1280×720; the phone projects run e2e/layout-nav-m3.spec.ts. */
test('M3-03 every tab opens its screen and closes back to the shop', async ({ page }) => everyTabOpens(page));
