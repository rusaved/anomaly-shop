import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';
import { gesturesSigned, hintsNeverOverWindows, noServiceMarks, oneCaptionAtATime, onePanelModel, oneWindowAtATime, rewardAfterAnimation, tabLabels, windowClosesByTab } from './usability-shared.ts';

/** UB-09 at 1280×720 (PC); the same checks at 375×812 — layout-usability-ub.spec.ts. */
test('UB-09 PC: a tab tap closes any window', async ({ page }) => windowClosesByTab(page));
test('UB-09 PC: one window at a time', async ({ page }) => oneWindowAtATime(page));
test('UB-09 PC: hints never lie over a window', async ({ page }) => hintsNeverOverWindows(page));
test('UB-09 PC: the hatch reward only after the strip', async ({ page }) => rewardAfterAnimation(page));
test('UB-09 PC: hidden gestures are signed', async ({ page }) => gesturesSigned(page));
test('UB-09 PC: text 12 px and up (14 px and no cut text on a PC, M4-00), buttons 44 px and up on every screen', async ({ page }) => everyScreenReadable(page));
test('UB-09 PC: every tab has its label', async ({ page }) => tabLabels(page));
test('UB-09 PC: no service marks', async ({ page }) => noServiceMarks(page));
test('M4-00 PC: one panel model for every tab, ✕ / the tab / the shop close it home, the scroll stays', async ({ page }) => onePanelModel(page));
test('M4-00 PC: one caption on the shop at a time', async ({ page }) => oneCaptionAtATime(page));
