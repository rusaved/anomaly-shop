// M5-08 (brief «Ресейл 9»): shots of the ads milestone — the banner on a computer, the dark «Реклама» screens, every ad button in its
// place, the reward toast, the store (payments on for the shot only) — in 880×405, 815×290, 375×812 and 1280×720, ru and en.
// Run after `npm run build:e2e`: node scripts/m5-shots.mjs [outDir=docs/evidence/M5/screens] [--lang=ru,en]
// Every shot is checked for cut text and buttons out of the screen; problems and console errors are printed and fail the run.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/evidence/M5/screens');
const langs = (args.find((a) => a.startsWith('--lang='))?.slice(7) ?? 'ru,en').split(',');
mkdirSync(out, { recursive: true });
const port = 4199;
const srv = spawn('npx', ['vite', 'preview', '--outDir', process.env.MU_DIST || 'dist-e2e', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const marker = resolve('.cache/chromium-path');
const executablePath = process.env.CHROMIUM_EXECUTABLE || (existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined);
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const pet = (uid, species, level = 1) => ({ uid, species, level, fed: 0, hatchedAt: 0, age: 0 });
const save = () => ({
  v: 1, rev: 999, savedAt: Date.now(), createdAt: 0, lastSeenAt: 0, coins: 40, crystals: 3,
  incubators: [{ egg: 'egg_odd', startedAt: 0, progress: 0, elapsed: 0, waiting: false, careFed: 2 }, { egg: null }],
  creatures: [pet('a', 'kettle', 2), pet('b', 'cloudcat'), pet('c', 'lampbug', 3)],
  showcase: ['a', 'b'],
  upgrades: { showcase: 2, incubator: 1 },
  stats: { deals: 30, coinsEarned: 5000, hatched: 20, taps: 300, levelUps: 6, haggles: 2, xp: 400, sessions: 1 },
  settings: { sound: false, lang: null },
  flags: { open_market: true, open_inventory: true, open_sales: true, open_chats: true, open_shop: true, ftue_starter: true, ftue_done: true, ftue_fed: true, ftue_bought: true, tab_market: true, tab_inventory: true, tab_sales: true, tab_chats: true, tab_shop: true, tab_eggs: true },
});

const errors = [];
const problems = [];
async function session(w, h, lang, query = '') {
  const pc = w >= 1000;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !pc, isMobile: !pc, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const tag = `${w}x${h} ${lang}`;
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.addInitScript(({ text }) => {
    if (!sessionStorage.getItem('m5-seeded')) {
      localStorage.setItem('anomaly-shop:save', text);
      localStorage.setItem('__yasdk_mock_player__', JSON.stringify({ save: text }));
      sessionStorage.setItem('m5-seeded', '1');
    }
  }, { text: JSON.stringify(save()) });
  await page.goto(`http://127.0.0.1:${port}/?mock_lang=${lang}&mock_ad_ms=3000${query}`);
  await page.waitForFunction(() => window.__TEST__?.state().controllable);
  await page.waitForTimeout(500);
  return { page, ctx };
}
/** Cut words, buttons off the screen or under 44 px — what M5-08 forbids. */
const check = (page, name) =>
  page
    .evaluate(() => {
      const bad = [];
      const shown = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight) return false;
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false;
        }
        return true;
      };
      for (const el of document.querySelectorAll('#ui button, #ui .mu-name, #ui .mu-meta, #ui h2, #ui h3')) {
        if (!shown(el)) continue;
        const r = el.getBoundingClientRect();
        const label = `${el.dataset.action ?? el.className} «${(el.innerText ?? '').trim().slice(0, 30)}»`;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') bad.push(`cut ${label}`);
        if (r.right > innerWidth + 0.5 || r.left < -0.5) bad.push(`off screen ${label}`);
        if (el.tagName === 'BUTTON' && el.closest('.mu-btn, .btn') && Math.min(r.width, r.height) < 43.5 && r.bottom < innerHeight) bad.push(`small ${label} ${Math.round(r.height)}`);
      }
      return bad;
    })
    .then((bad) => bad.forEach((b) => problems.push(`${name}: ${b}`)));
const shot = async (page, name, toast = false) => {
  if (!toast) await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})))).catch(() => {});
  await page.waitForTimeout(300);
  await check(page, name);
  await page.screenshot({ path: `${out}/${name}.png` });
};
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`${name}: ${String(e).split('\n')[0]}`);
  }
};
const tab = (page, id) => page.locator(`[data-tab=${id}]`).click();

for (const lang of langs) {
  // Every size: the egg cards with «▶ Реклама» and the store (payments on only here).
  for (const [w, h] of [[880, 405], [815, 290], [375, 812], [1280, 720]]) {
    const size = `${w}x${h}`;
    await step(`eggs ${size} ${lang}`, async () => {
      const { page, ctx } = await session(w, h, lang, w >= 1000 ? '&mock_banner=1' : '');
      await tab(page, 'eggs');
      await page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_gold]').scrollIntoViewIfNeeded();
      await shot(page, `eggs-ads_${size}_${lang}`);
      await ctx.close();
    });
    await step(`store ${size} ${lang}`, async () => {
      const { page, ctx } = await session(w, h, lang, `&payments=1${w >= 1000 ? '&mock_banner=1' : ''}`);
      await page.evaluate(() => window.__TEST__.runSim(181));
      await tab(page, 'shop');
      await page.locator('[data-sheet=shop] [data-sub=deals]').click();
      await page.locator('[data-section=deals] [data-store=starter]').waitFor();
      await shot(page, `store_${size}_${lang}`);
      await ctx.close();
    });
  }
  if (lang !== 'ru') continue;
  // The rest once (ru, the phone and the computer): stubs, every ad button, the reward toast.
  await step('stub rewarded', async () => {
    const { page, ctx } = await session(375, 812, lang);
    await tab(page, 'eggs');
    await page.locator('[data-sheet=eggs] [data-action=ad-egg-ad_gold]').click();
    await page.locator('#__ya_mock_ad__').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/stub-rewarded_375x812_${lang}.png` });
    await page.locator('#__ya_mock_ad__').waitFor({ state: 'detached', timeout: 8000 });
    await page.locator('.toast').waitFor({ timeout: 4000 }).catch(() => {});
    await shot(page, `reward-toast_375x812_${lang}`, true);
    await ctx.close();
  });
  await step('stub interstitial + banner', async () => {
    const { page, ctx } = await session(1280, 720, lang, '&mock_banner=1');
    await page.evaluate(() => window.__TEST__.runSim(181));
    await page.locator('[data-action=gifts]').click();
    await page.locator('[data-action=gifts-close]').click();
    await page.locator('#__ya_mock_ad__').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/stub-fullscreen_1280x720_${lang}.png` });
    await page.locator('#__ya_mock_ad__').waitFor({ state: 'detached', timeout: 8000 });
    await shot(page, `banner-home_1280x720_${lang}`);
    await ctx.close();
  });
  await step('market, gifts, chat', async () => {
    const { page, ctx } = await session(375, 812, lang);
    await tab(page, 'market');
    await page.locator('[data-sheet=market] [data-action=ad-skip]').waitFor();
    await shot(page, `market-skip_375x812_${lang}`);
    await page.locator('[data-action=gifts]').click();
    await page.locator('[data-action=ad-boost]').scrollIntoViewIfNeeded();
    await shot(page, `gifts-boost_375x812_${lang}`);
    await page.locator('[data-action=gifts-close]').click();
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.__TEST__.runSim(10));
      if ((await page.locator('[data-tab=chats] .nav-badge:not([hidden])').count()) > 0) break;
    }
    await tab(page, 'chats');
    const sell = page.locator('[data-sheet=chats] [data-action=chat-sell]');
    if (!(await sell.isVisible())) await page.locator('[data-sheet=chats] .chat-row:not(.closed)').first().click();
    await sell.click();
    await page.locator('[data-sheet=chats] [data-action=ad-double]').waitFor();
    await shot(page, `chat-double_375x812_${lang}`);
    await ctx.close();
  });
}
await browser.close();
try {
  process.kill(-srv.pid);
} catch {
  srv.kill();
}
for (const e of errors) console.error(`error: ${e}`);
for (const p of problems) console.error(`problem: ${p}`);
console.log(`m5-shots: ${out} — errors ${errors.length}, problems ${problems.length}`);
process.exit(errors.length || problems.length ? 1 : 0);
