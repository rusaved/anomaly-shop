import { test } from '@playwright/test';
import { everyTabOpens } from './nav-shared.ts';

/** UB-01 on a phone, portrait (375×812) and landscape (812×375): the same bar, the same screens. */
test('UB-01 phone: one tab bar at the bottom, Eggs is home, every tab opens its screen', async ({ page }) => everyTabOpens(page));
