import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';
import { gesturesSigned, hintsNeverOverWindows, noServiceMarks, oneWindowAtATime, rewardAfterAnimation, tabLabels, windowClosesByTab } from './usability-shared.ts';

/** UB-09 at 375×812 (phone, portrait); the same checks at 1280×720 — usability-ub.spec.ts. */
test.beforeEach(({ page }) => test.skip(page.viewportSize()!.width > page.viewportSize()!.height, 'UB-09 sizes: 375×812 and 1280×720'));
test('UB-09 phone: a tab tap closes any window', async ({ page }) => windowClosesByTab(page));
test('UB-09 phone: one window at a time', async ({ page }) => oneWindowAtATime(page));
test('UB-09 phone: hints never lie over a window', async ({ page }) => hintsNeverOverWindows(page));
test('UB-09 phone: the hatch reward only after the strip', async ({ page }) => rewardAfterAnimation(page));
test('UB-09 phone: hidden gestures are signed', async ({ page }) => gesturesSigned(page));
test('UB-09 phone: text 12 px and up, buttons 44 px and up on every screen', async ({ page }) => everyScreenReadable(page));
test('UB-09 phone: every tab has its label', async ({ page }) => tabLabels(page));
test('UB-09 phone: no service marks', async ({ page }) => noServiceMarks(page));
