// MU-12: screenshots of every screen of docs/07 next to its mockup (docs/mockups) — portrait 375×650 (the zone of a phone) and landscape 812×330.
// Run after `npm run build:e2e`: node scripts/mu-shots.mjs [outDir=docs/evidence/MU/screens] [--only=name,name]
// The save is seeded past the first minute with one pet of every rarity; console errors are printed and fail the run.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/evidence/MU/screens');
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const scale = Number(args.find((a) => a.startsWith('--font='))?.slice(7) ?? 0);
mkdirSync(out, { recursive: true });
const port = 4198;
const srv = spawn('npx', ['vite', 'preview', '--outDir', process.env.MU_DIST || 'dist-e2e', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const marker = resolve('.cache/chromium-path');
const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined);
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const pet = (uid, species, level = 1) => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });
const save = () => ({
  v: 1, rev: 999, savedAt: Date.now(), createdAt: 0, lastSeenAt: 0, coins: 120, crystals: 3,
  incubators: [{ egg: 'egg_basic', startedAt: 0, progress: 0, elapsed: 0, waiting: false }, { egg: null }],
  creatures: [pet('a', 'kettle', 2), pet('b', 'cloudcat'), pet('c', 'lampbug', 3), pet('d', 'jellytoast'), pet('e', 'shroom'), pet('f', 'moon_donut')],
  showcase: ['a', 'b'],
  upgrades: { showcase: 2, incubator: 1 },
  stats: { deals: 8, coinsEarned: 300, hatched: 10, taps: 100, levelUps: 3, haggles: 1 },
  settings: { sound: false, lang: null },
  flags: { open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true, ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true },
});

const errors = [];
async function session(w, h, tag) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.addInitScript(({ text, font }) => {
    if (!sessionStorage.getItem('mu-seeded')) {
      localStorage.setItem('anomaly-shop:save', text);
      localStorage.setItem('__yasdk_mock_player__', JSON.stringify({ save: text }));
      sessionStorage.setItem('mu-seeded', '1');
    }
    if (font) document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = `${font}%`));
  }, { text: JSON.stringify(save()), font: scale });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__TEST__?.state().controllable);
  await page.waitForTimeout(600);
  return { page, ctx };
}
const shot = async (page, name) => {
  if (only.length && !only.includes(name.split('.')[0])) return;
  // After the animation: a toast moves the screen down while it shows.
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const tab = (page, id) => page.locator(`[data-tab=${id}]`).click();
const tryStep = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`${name}: ${String(e).split('\n')[0]}`);
  }
};

for (const [w, h, tag] of [[375, 650, 'p'], [812, 330, 'l']]) {
  const { page, ctx } = await session(w, h, tag);
  await tryStep(`${tag} home`, async () => shot(page, `home.${tag}`));
  await tryStep(`${tag} eggs`, async () => {
    await tab(page, 'eggs');
    await shot(page, `eggs.${tag}`);
    await page.locator('[data-sheet=eggs] [data-action="egg-card-egg_basic"]').click();
    await shot(page, `egg-card.${tag}`);
  });
  await tryStep(`${tag} inventory`, async () => {
    await tab(page, 'inventory');
    await shot(page, `inventory.${tag}`);
    await page.locator('[data-sheet=inventory] [data-sub=collection]').click();
    await shot(page, `collection.${tag}`);
    await page.locator('[data-sheet=inventory] [data-sub=finds]').click();
    await shot(page, `finds.${tag}`);
  });
  await tryStep(`${tag} sales`, async () => {
    await tab(page, 'sales');
    await shot(page, `sales.${tag}`);
    await page.locator('[data-sheet=sales] [data-action="sale-add"]').first().click();
    await shot(page, `pick.${tag}`);
    await page.locator('[data-detail=sale] [data-action^="sale-list-"]').first().click();
    await shot(page, `price.${tag}`);
    await page.locator('[data-detail=sale] [data-action="sale-back"]').click();
    await page.locator('[data-detail=sale] [data-action="sale-back"]').click();
  });
  await tryStep(`${tag} market`, async () => {
    await tab(page, 'market');
    await shot(page, `market.${tag}`);
    await page.locator('[data-sheet=market] [data-action^="lot-open-"]').first().click();
    await shot(page, `lot.${tag}`);
  });
  await tryStep(`${tag} shop`, async () => {
    await tab(page, 'shop');
    await shot(page, `shop.${tag}`);
  });
  await tryStep(`${tag} chats`, async () => {
    // A buyer writes about a pet on the shelf: the game runs on a minute.
    await page.evaluate(() => window.__TEST__.runSim(60));
    await tab(page, 'chats');
    await shot(page, `chats.${tag}`);
    const row = page.locator('[data-sheet=chats] .chat-row:not(.closed)').first();
    if (await row.isVisible()) await row.click();
    await shot(page, `chat.${tag}`);
  });
  await tryStep(`${tag} windows`, async () => {
    await tab(page, 'home');
    await page.locator('[data-action=gifts]').click();
    await shot(page, `gifts.${tag}`);
    await page.locator('[data-overlay=gifts] [data-action=gift-review]').click();
    await shot(page, `rate.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=pause]').click();
    await shot(page, `pause.${tag}`);
    await page.locator('[data-action=settings]').click();
    await shot(page, `settings.${tag}`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await tab(page, 'home');
    await page.locator('[data-action=leaders]').click();
    await shot(page, `leaders.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=work]').click();
    await shot(page, `work.${tag}`);
    await tab(page, 'home');
    await page.locator('[data-action=reputation]').click();
    await shot(page, `level.${tag}`);
    await tab(page, 'home');
  });
  await tryStep(`${tag} hatch`, async () => {
    await tab(page, 'eggs');
    await page.evaluate(() => window.__TEST__.grant(500));
    await page.locator('[data-sheet=eggs] [data-action="egg-buy-egg_basic"]').click();
    const open = page.locator('[data-sheet=eggs] [data-action^="egg-open-"]').first();
    for (let i = 0; i < 40 && !(await open.isVisible()); i++) await page.evaluate(() => window.__TEST__.runSim(5));
    if (await open.isVisible()) {
      await open.click();
      await page.waitForTimeout(400);
      const skip = page.locator('[data-action=hatch-skip]');
      if (await skip.isVisible()) await skip.click();
      await page.waitForTimeout(900);
      await shot(page, `hatch.${tag}`);
    }
  });
  await ctx.close();
}
await browser.close();
// The preview server and its children go with the run (npx starts vite as a child).
try {
  process.kill(-srv.pid);
} catch {
  srv.kill();
}
console.log(`shots: ${out}`);
if (errors.length) {
  console.log(errors.join('\n'));
  process.exitCode = 1;
}
