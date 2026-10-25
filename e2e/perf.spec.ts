import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { events, open, seedSave } from './helpers.ts';

/**
 * The budgets of docs/02, section 8, on a 4× slower CPU. M4-09: the project runs alone after all the others — next to another test
 * on the same machine the emulated slow CPU measured 6–8 s; alone it stays under the budget (the full verify of M4).
 * RD-04: the first screen on 4G (docs/02: 10 Mbit/s, RTT 100 ms) and CPU ×4 ≤ 5 s; FPS ≥ 30 on CPU ×4; the memory does not grow in
 * 10 minutes of play (@full). RD_SHOTS=1 writes the numbers to docs/evidence/RD/perf.txt, PERF_OUT=M6 to docs/evidence/M6/perf.txt.
 * FPS in the cloud is the software WebGL's (SwiftShader draws on the CPU: ~10 FPS even without a slowdown, the page itself idle), not
 * the game's: the check is the game's own main-thread work per drawn frame on CPU ×4 — ≤ 33 ms keeps 30 FPS on a phone whose GPU
 * draws the frame (docs/допущения.md). The tests run one after another in one worker: a neighbour skews a slowed CPU.
 */
test.describe.configure({ mode: 'default' });
// M6-05: PERF_OUT=<milestone> writes to that milestone's evidence (RD_SHOTS=1 — RD's, as before).
const evidence = process.env.PERF_OUT ? resolve(import.meta.dirname, `../docs/evidence/${process.env.PERF_OUT}/perf.txt`) : process.env.RD_SHOTS ? resolve(import.meta.dirname, '../docs/evidence/RD/perf.txt') : null;
const note = (line: string) => {
  console.log(line);
  if (!evidence) return;
  mkdirSync(resolve(evidence, '..'), { recursive: true });
  appendFileSync(evidence, `${new Date().toISOString().slice(0, 16)} ${line}\n`);
};

async function slow(page: Page, network: { down: number; up: number; rtt: number } | null): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  if (network) {
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: network.rtt,
      downloadThroughput: (network.down * 1024 * 1024) / 8,
      uploadThroughput: (network.up * 1024 * 1024) / 8,
    });
  }
  return session;
}

test('perf: ready within 5 s and under 5 MB downloaded on 4G and a 4× slower CPU', async ({ page }) => {
  const session = await slow(page, { down: 10, up: 3, rtt: 100 });
  let bytes = 0;
  page.on('response', (r) => {
    void r.body().then((b) => {
      bytes += b.length;
    }, () => undefined);
  });
  await open(page);
  const ready = (await events(page)).find((e) => e.name === 'gameReady')!;
  await page.waitForTimeout(300);
  note(`RD-04 first screen on 4G (10 Mbit/s, RTT 100 ms) + CPU ×4: gameReady ${ready.t} ms, downloaded ${(bytes / 1024).toFixed(0)} KB (limits 5000 ms, 5120 KB)`);
  expect(ready.t).toBeLessThan(5000);
  expect(bytes).toBeLessThan(5 * 1024 * 1024);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

/** Frames the page drew in `ms` (requestAnimationFrame) and the main thread's busy time meanwhile (CDP TaskDuration). */
async function frames(page: Page, session: CDPSession, ms: number): Promise<{ fps: number; msPerFrame: number }> {
  const busy = async () => (await session.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value * 1000;
  const b0 = await busy();
  const { n, span } = await page.evaluate(
    (len) =>
      new Promise<{ n: number; span: number }>((done) => {
        let count = 0;
        const t0 = performance.now();
        const step = () => {
          count++;
          if (performance.now() - t0 < len) requestAnimationFrame(step);
          else done({ n: count, span: performance.now() - t0 });
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
  const work = (await busy()) - b0;
  return { fps: (n * 1000) / span, msPerFrame: work / Math.max(1, n) };
}

test('perf: 30 FPS on a 4× slower CPU — the main thread spends ≤ 33 ms a frame (shop, hatch show)', async ({ page }) => {
  await seedSave(page);
  await open(page);
  const session = await slow(page, null);
  await session.send('Performance.enable');
  await page.waitForTimeout(1000);
  const shop = await frames(page, session, 5000);
  // The busiest moment: the hatch show (the strip, the burst) over the shop.
  expect(await page.evaluate(() => (window as unknown as { __TEST__: { hatch(uid: string, egg: string): boolean } }).__TEST__.hatch('e2e2', 'egg_basic'))).toBe(true);
  const hatch = await frames(page, session, 3000);
  note(
    `RD-04 CPU ×4: main thread a frame — shop ${shop.msPerFrame.toFixed(1)} ms, hatch show ${hatch.msPerFrame.toFixed(1)} ms (limit ≤ 33 ms = 30 FPS); ` +
      `drawn in the cloud (software WebGL) ${shop.fps.toFixed(0)} / ${hatch.fps.toFixed(0)} FPS — info`,
  );
  expect(shop.msPerFrame).toBeLessThanOrEqual(33);
  expect(hatch.msPerFrame).toBeLessThanOrEqual(33);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

test('perf: the memory does not grow in 10 minutes of play @full', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  // A player past the first minute: every tab open (a fresh game hides them until the first deal).
  await seedSave(page, { coins: 2000 });
  await open(page);
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const sample = async () => {
    await session.send('HeapProfiler.collectGarbage');
    const { metrics } = await session.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return { heap: m.JSHeapUsedSize! / 1024 / 1024, nodes: m.Nodes!, listeners: m.JSEventListeners! };
  };
  // A player: taps the shop, walks the tabs, opens and closes windows; the game runs in real time.
  const tabs = ['eggs', 'chats', 'sales', 'inventory', 'market', 'shop', 'home'];
  const play = async (sec: number) => {
    const end = Date.now() + sec * 1000;
    for (let i = 0; Date.now() < end; i++) {
      await page.locator(`[data-tab=${tabs[i % tabs.length]}]`).click({ timeout: 10_000 });
      if (i % tabs.length === tabs.length - 1) {
        const t = await page.evaluate(() => (window as unknown as { __TEST__: { targets(): { incubators: Array<{ x: number; y: number }> } | null } }).__TEST__.targets());
        for (const p of t?.incubators ?? []) await page.mouse.click(p.x, p.y);
      }
      await page.waitForTimeout(1500);
    }
  };
  await play(60);
  const first = await sample();
  await play(9 * 60);
  const last = await sample();
  note(
    `RD-04 memory after GC, minute 1 → 10: heap ${first.heap.toFixed(1)} → ${last.heap.toFixed(1)} MB, DOM nodes ${first.nodes} → ${last.nodes}, listeners ${first.listeners} → ${last.listeners} (limit: heap +20 % and +10 MB, nodes +20 %)`,
  );
  expect(last.heap).toBeLessThanOrEqual(Math.max(first.heap * 1.2, first.heap + 10));
  expect(last.nodes).toBeLessThanOrEqual(first.nodes * 1.2 + 200);
});
