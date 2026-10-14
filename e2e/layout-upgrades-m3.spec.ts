import { test } from '@playwright/test';
import { upgradesPanel } from './upgrades-shared.ts';

/** M3-17 on the phone projects (375×812 and 812×375). */
test('M3-17 phone: upgrade side panel keeps the shop in view', async ({ page }) => upgradesPanel(page));
