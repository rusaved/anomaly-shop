import { test } from '@playwright/test';
import { everyTabOpens } from './nav-shared.ts';

/** UB-01 on the PC (1280×720): the tab bar at the bottom across the whole width, not in a side column. */
test('UB-01 PC: one tab bar at the bottom, Eggs is home, every tab opens its screen', async ({ page }) => everyTabOpens(page));
