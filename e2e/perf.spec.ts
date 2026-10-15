import { expect, test } from '@playwright/test';
import { events, open } from './helpers.ts';

/**
 * The load budget (docs/02, section 8) on a 4× slower CPU. M4-09: it runs alone in its own project after all the others —
 * next to another test on the same machine the emulated slow CPU measured 6–8 s; alone it stays under the budget (the full verify of M4).
 */
test('perf: ready within 5 s and under 5 MB downloaded on a 4× slower CPU', async ({ page }) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  page.on('response', (r) => {
    void r.body().then((b) => {
      bytes += b.length;
    }, () => undefined);
  });
  await open(page);
  const ready = (await events(page)).find((e) => e.name === 'gameReady')!;
  await page.waitForTimeout(300);
  expect(ready.t).toBeLessThan(5000);
  expect(bytes).toBeLessThan(5 * 1024 * 1024);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});
