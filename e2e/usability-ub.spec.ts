import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';
import { gesturesSigned, hintsNeverOverWindows, noServiceMarks, oneWindowAtATime, rewardAfterAnimation, tabLabels, windowClosesByTab } from './usability-shared.ts';

/** UB-09 at 1280×720 (PC); the same checks at 375×812 — layout-usability-ub.spec.ts. */
test('UB-09 PC: a tab tap closes any window', async ({ page }) => windowClosesByTab(page));
test('UB-09 PC: one window at a time', async ({ page }) => oneWindowAtATime(page));
test('UB-09 PC: hints never lie over a window', async ({ page }) => hintsNeverOverWindows(page));
test('UB-09 PC: the hatch reward only after the strip', async ({ page }) => rewardAfterAnimation(page));
test('UB-09 PC: hidden gestures are signed', async ({ page }) => gesturesSigned(page));
test('UB-09 PC: text 12 px and up, buttons 44 px and up on every screen', async ({ page }) => everyScreenReadable(page));
test('UB-09 PC: every tab has its label', async ({ page }) => tabLabels(page));
test('UB-09 PC: no service marks', async ({ page }) => noServiceMarks(page));
