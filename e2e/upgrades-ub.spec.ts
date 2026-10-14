import { test } from '@playwright/test';
import { upgradesPanel } from './upgrades-shared.ts';

/** M3-17, UB-04 on desktop 1280×720; the phones run e2e/layout-upgrades-ub.spec.ts. */
test('UB-04 upgrades: a panel from the right by a button, the shop in view, the purchase shines', async ({ page }) => upgradesPanel(page, process.env.SHOTS));
