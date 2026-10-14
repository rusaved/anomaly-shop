import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** M3-08: listed → a buyer writes → sold from the chat. */
type S = { coins: number; creatures: Array<{ uid: string }>; stats: { deals: number } };

test('M3-08 chats: listed, a buyer writes, sold from the chat', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: ['e2e1', 'e2e2'] });
  await open(page);
  // Game time runs: within 8–15 s at the market price a buyer writes (the tab badge counts it).
  await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(20));
  await expect(page.locator('[data-tab=chats] [data-badge]')).toBeVisible();
  await page.locator('[data-tab=chats]').click();
  await page.locator('[data-sheet=chats] .chat-row').first().click();
  await expect(page.locator('[data-sheet=chats] .bubble.them')).toHaveCount(2);
  const before = (await state(page)) as unknown as S;
  const label = await page.locator('[data-action=chat-sell]').innerText();
  const offer = Number(label.replace(/\D/g, ''));
  expect(offer).toBeGreaterThan(0);
  await page.locator('[data-action=chat-sell]').click();
  await expect.poll(async () => ((await state(page)) as unknown as S).stats.deals).toBe(before.stats.deals + 1);
  const after = (await state(page)) as unknown as S;
  expect(after.coins).toBe(before.coins + offer);
  expect(after.creatures.length).toBe(before.creatures.length - 1);
  await expect(page.locator('[data-sheet=chats] .bubble.me')).toHaveCount(1);
  expect(errors).toEqual([]);
});
