import { test } from '@playwright/test';
import { everyScreenReadable } from './read-shared.ts';
import { gesturesSigned, hintsNeverOverWindows, noServiceMarks, oneCaptionAtATime, onePanelModel, oneWindowAtATime, rewardAfterAnimation, tabLabels, windowClosesByTab } from './usability-shared.ts';

/** UB-09 at 375×812 and 812×375 (phone); the same checks at 1280×720 — usability-ub.spec.ts. */
// UB-10: the phone on its side too (812×375) — the playtest found the tab bar over the chat answers there.
test('UB-09 phone: a tab tap closes any window', async ({ page }) => windowClosesByTab(page));
test('UB-09 phone: one window at a time', async ({ page }) => oneWindowAtATime(page));
test('UB-09 phone: hints never lie over a window', async ({ page }) => hintsNeverOverWindows(page));
test('UB-09 phone: the hatch reward only after the strip', async ({ page }) => rewardAfterAnimation(page));
test('UB-09 phone: hidden gestures are signed', async ({ page }) => gesturesSigned(page));
test('UB-09 phone: text 12 px and up (M4-00: 14 px on a PC), buttons 44 px and up on every screen', async ({ page }) => everyScreenReadable(page));
test('UB-09 phone: every tab has its label', async ({ page }) => tabLabels(page));
test('UB-09 phone: no service marks', async ({ page }) => noServiceMarks(page));
test('M4-00 phone: one panel model for every tab, ✕ / the tab / the shop close it home, the scroll stays', async ({ page }) => onePanelModel(page));
test('M4-00 phone: one caption on the shop at a time', async ({ page }) => oneCaptionAtATime(page));
