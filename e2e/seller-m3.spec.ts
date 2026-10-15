import { expect, test } from '@playwright/test';
import { collectErrors, listFromInventory, open, seedSave, sellInChat, state } from './helpers.ts';

/** M3-10, UB-05: bought below the market from a seller, it goes on sale, a buyer writes, sold dearer in the chat. */
type S = { coins: number; creatures: Array<{ uid: string; species: string }>; stats: { deals: number }; chats: Array<{ id: number; uid: string; offer: number }> };

test('M3-10 bought below the market → on sale → sold dearer', async ({ page }) => {
  const errors = collectErrors(page);
  await seedSave(page, {
    coins: 100,
    creatures: [],
    showcase: [],
    flags: { ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, showcase_m3: true },
    market: { lots: [{ id: 1, species: 'cloudcat', level: 3, price: 30, person: 0, character: 'chatty', hobby: 'fishing', sold: false, hobbyDone: false, bargained: false }], refreshIn: 999 },
  });
  await open(page);
  await page.locator('[data-tab=market]').click();
  await page.locator('[data-sheet=market] [data-lot="1"]').click();
  await expect(page.locator('[data-detail=lot] [data-action=lot-item]')).toBeVisible();
  await page.locator('[data-action=lot-how]').click();
  await expect(page.locator('[data-action=lot-hobby]')).toBeVisible();
  await page.locator('[data-action=lot-hobby]').click();
  const paidLabel = await page.locator('[data-action=lot-buy]').innerText();
  const paid = Number(paidLabel.replace(/\D/g, ''));
  expect(paid).toBeLessThan(30);
  await page.locator('[data-action=lot-buy]').click();
  await expect.poll(async () => ((await state(page)) as unknown as S).creatures.length).toBe(1);
  // On sale (the shelf has room: one place on the start), a buyer writes; sell in the chat.
  await page.locator('[data-tab=sales]').click();
  if (((await state(page)) as unknown as { shelf: string[] }).shelf.length === 0) await listFromInventory(page);
  // A buyer writes. A lowball one is turned down, as a player would (buyers differ, and the market mood of the day
  // may find this species boring, M4-23); the next one pays more than the seller got.
  // The test snapshot lists open chats only.
  const openChats = async () => ((await state(page)) as unknown as S).chats;
  let offer = 0;
  for (let i = 0; i < 6 && offer <= paid; i++) {
    await page.evaluate(() => (window as unknown as { __TEST__: { runSim(s: number): number } }).__TEST__.runSim(20));
    await expect.poll(async () => (await openChats()).length, { timeout: 15000 }).toBeGreaterThan(0);
    offer = (await openChats())[0]!.offer;
    if (offer > paid) break;
    await page.locator('[data-tab=sales]').click();
    await page.locator('[data-tab=chats]').click();
    await page.locator('[data-sheet=chats] .chat-row:not(.closed)').first().click();
    await page.locator('[data-sheet=chats] [data-action=chat-decline]').click();
  }
  expect(offer).toBeGreaterThan(paid);
  await page.locator('[data-tab=sales]').click();
  await sellInChat(page);
  await expect.poll(async () => ((await state(page)) as unknown as S).stats.deals).toBeGreaterThan(0);
  const end = (await state(page)) as unknown as S;
  expect(end.coins).toBeGreaterThan(100 - paid + paid);
  expect(errors).toEqual([]);
});
