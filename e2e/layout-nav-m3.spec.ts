import { test } from '@playwright/test';
import { everyTabOpens } from './nav-shared.ts';

/** M3-03 on the phone projects (375×812 and 812×375, touch). */
test('M3-03 phone: every tab opens its screen and closes back to the shop', async ({ page }) => everyTabOpens(page));
