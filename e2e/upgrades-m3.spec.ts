import { test } from '@playwright/test';
import { upgradesPanel } from './upgrades-shared.ts';

/** M3-17 on desktop 1280×720; the phones run e2e/layout-upgrades-m3.spec.ts. */
test('M3-17 upgrade side panel: the shop in view, the purchase shines', async ({ page }) => upgradesPanel(page, process.env.SHOTS));
