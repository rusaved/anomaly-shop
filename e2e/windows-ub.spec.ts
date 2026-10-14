import { test } from '@playwright/test';
import { hintsNotOverWindows, windowsByImportance } from './windows-shared.ts';

test('UB-02 PC: one window at a time, a tab works from any window, a tap outside closes it', async ({ page }) => windowsByImportance(page));
test('UB-02 PC: hints never lie over a window or another screen', async ({ page }) => hintsNotOverWindows(page));
