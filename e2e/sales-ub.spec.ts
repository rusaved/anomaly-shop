import { expect, test } from '@playwright/test';
import { collectErrors, open, seedSave, state } from './helpers.ts';

/** UB-05 (was M3-08): one path of selling — «My sales» → the price slider → a buyer writes in «Chats» → sold from the chat. */
type S = { coins: number; creatures: Array<{ uid: string }>; stats: { deals: number }; chats: Array<{ uid: string }> };
const runSim = (page: import('@playwright/test').Page, sec: number) => page.evaluate((s) => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(s), sec);

test('UB-05 one path: listed with the slider, a buyer writes, the creature is off the shelf meanwhile, sold from the chat', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, { coins: 0, flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true }, showcase: [] });
  await open(page);
  // «My sales»: one free place on the start (Q-024 B) → pick the creature from the inventory.
  await page.locator('[data-tab=sales]').click();
  await expect(page.locator('[data-sheet=sales] .card-empty')).toHaveCount(1);
  await page.locator('[data-sheet=sales] [data-action=sale-add]').click();
  // UB-02: the pick and the card are details — a panel from the right.
  await page.locator('[data-detail=sale] [data-action=sale-list-e2e1]').click();
  // UB-10: listed — the card with the price slider opens at once; a tap at the left end makes the price below the market (a buyer comes sooner).
  const range = page.locator('[data-detail=sale] input[type=range]');
  await expect(range).toBeVisible();
  const box = (await range.boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + box.height / 2);
  await expect(page.locator('[data-detail=sale] [data-price-zone]')).not.toHaveText('');
  expect(Number(await page.locator('[data-detail=sale] [data-zone]').first().getAttribute('data-zone'))).toBeLessThan(2);
  // Game time runs: a buyer writes (the tab badge counts it); the creature leaves the shelf (Q-025).
  await runSim(page, 20);
  await expect(page.locator('[data-tab=chats] [data-badge]')).toBeVisible();
  const mid = (await state(page)) as unknown as S;
  expect(mid.chats.map((c) => c.uid)).toContain('e2e1');
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
