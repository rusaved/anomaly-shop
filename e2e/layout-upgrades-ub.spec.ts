import { test } from '@playwright/test';
import { upgradesPanel } from './upgrades-shared.ts';

/** M3-17, UB-04 on the phone projects (375×812 and 812×375). */
test('UB-04 phone: the upgrades panel from the right keeps the shop in view', async ({ page }) => upgradesPanel(page));
