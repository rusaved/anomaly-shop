import { defineConfig, type Plugin, type Connect } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { doneMilestone, type FeatureList } from './scripts/build-label.ts';

// Build modes and platform profiles (docs/02-tech.md, sections 3 and 6).
// The profile comes from the mode; VITE_PLATFORM=yandex|null|youtube|vk overrides it.
type Profile = 'yandex' | 'null' | 'youtube' | 'vk';
type Flags = { debug: boolean; studio: boolean; test: boolean; label: boolean; metrika: boolean; platform: Profile };

const root = import.meta.dirname;
const YOUTUBE_SDK = 'https://www.youtube.com/game_api/v1';

const MODES: Record<string, Flags> = {
  development: { debug: true, studio: true, test: true, label: false, metrika: false, platform: 'yandex' },
  nosdk: { debug: true, studio: true, test: true, label: false, metrika: false, platform: 'null' },
  production: { debug: false, studio: false, test: false, label: false, metrika: true, platform: 'yandex' },
  playtest: { debug: true, studio: false, test: false, label: false, metrika: false, platform: 'yandex' },
  e2e: { debug: true, studio: true, test: true, label: false, metrika: false, platform: 'yandex' },
  pages: { debug: true, studio: true, test: false, label: true, metrika: false, platform: 'yandex' },
  youtube: { debug: false, studio: false, test: false, label: false, metrika: false, platform: 'youtube' },
  // V-02: VK and OK — a release build (no debug, no test API); vk-e2e — the same with the test API for the e2e of dist-vk.
  vk: { debug: false, studio: false, test: false, label: false, metrika: false, platform: 'vk' },
  'vk-e2e': { debug: false, studio: false, test: true, label: false, metrika: false, platform: 'vk' },
  'vk-dev': { debug: false, studio: false, test: true, label: false, metrika: false, platform: 'vk' },
};

type GameJson = {
  id: string;
  title: Record<string, string>;
  languages: string[];
  fallbackLanguage: string;
  ruFallbackLanguages?: string[];
  bootBackground: string;
  metrikaCounterId?: number;
  community?: { telegram: string; vk: string; placement: string[] };
  profiles: Record<Profile, Record<string, unknown> & { community: boolean }>;
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Public part of game.json for one profile. The youtube build gets no community links and no counter id; vk — Russian only (V-04). */
function gameConfig(platform: Profile): Record<string, unknown> {
  const game = readJson<GameJson>(resolve(root, 'game.json'));
  const profile = game.profiles[platform];
  if (!profile) throw new Error(`game.json: no profile "${platform}"`);
  const { sdk: _sdk, ...profileRest } = profile;
  const ruOnly = platform === 'vk';
  return {
    id: game.id,
    title: game.title,
    languages: ruOnly ? ['ru'] : game.languages,
    fallbackLanguage: ruOnly ? 'ru' : game.fallbackLanguage,
    ruFallbackLanguages: game.ruFallbackLanguages ?? ['ru'],
    community: profile.community && game.community ? game.community : null,
    metrikaCounterId: platform === 'yandex' ? Number(game.metrikaCounterId || 0) : 0,
    profile: { name: platform, ...profileRest },
  };
}

/** The short commit hash (CI passes BUILD_SHA). */
function buildSha(): string {
  const sha = (process.env.BUILD_SHA || '').slice(0, 7);
  if (sha) return sha;
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

/** Label for the producer link: the newest milestone done (scripts/build-label.ts), the date, the commit. */
function buildLabel(): string {
  const file = resolve(root, 'feature_list.json');
  const done = existsSync(file) ? doneMilestone(readJson<FeatureList>(file)) : 'M0';
  return `${done} · ${new Date().toISOString().slice(0, 10)} · ${buildSha()}`;
}

/** Serves the Yandex SDK mock as /sdk.js in dev and preview (docs/02-tech.md 6.4). Never part of a build. */
function sdkMockPlugin(): Plugin {
  const mockFile = resolve(root, 'dev/yasdk-mock/sdk.js');
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url || '').split('?')[0] ?? '';
    if (url === '/sdk.js' || url.endsWith('/sdk.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(mockFile));
      return;
    }
    next();
  };
  return {
    name: 'yasdk-mock',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

/** index.html placeholders: platform SDK tag, Metrika (yandex release only), title, boot background. */
function htmlPlugin(mode: string, flags: Flags): Plugin {
  return {
    name: 'anomaly-html',
    transformIndexHtml(html) {
      const game = readJson<GameJson>(resolve(root, 'game.json'));
      const counter = Number(game.metrikaCounterId || 0);
      const sdkTag =
        flags.platform === 'yandex'
          ? `<script src="${mode === 'pages' ? 'sdk.js' : '/sdk.js'}"></script>`
          : flags.platform === 'youtube'
            ? `<script src="${YOUTUBE_SDK}"></script>`
            : '';
      const metrika =
        flags.metrika && flags.platform === 'yandex' && counter > 0
          ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${counter},"init",{clickmap:false,trackLinks:false,accurateTrackBounce:true});</script>`
          : '';
      const title = flags.platform === 'youtube' ? game.title.en : game.title.ru;
      return html
        .replace('<!--PLATFORM_SDK-->', sdkTag)
        .replace('<!--METRIKA-->', metrika)
        .replace('%GAME_TITLE%', title ?? '')
        .replace(/%BODY_BG%/g, game.bootBackground);
    },
  };
}

/**
 * V-04: the VK and OK build carries no word of other platforms — the producer's notes of content/*.json (they name the Yandex
 * profile) and the link buttons of the Yandex build (Telegram, the VK page) are dropped from the data of this build only.
 */
function vkContentPlugin(): Plugin {
  const contentDir = resolve(root, 'content');
  const strip = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(strip);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'note').map(([k, v]) => [k, strip(v)]));
    return x;
  };
  return {
    name: 'vk-content',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? '';
      if (!file.startsWith(contentDir) || !file.endsWith('.json')) return null;
      const data = strip(JSON.parse(code)) as Record<string, unknown>;
      if (/[\\/]i18n[\\/]/.test(file)) for (const k of Object.keys(data)) if (k.startsWith('community.')) delete data[k];
      if (file.endsWith('gifts.json') && Array.isArray(data.subscribe)) data.subscribe = (data.subscribe as Array<{ id: string }>).filter((x) => x.id !== 'telegram');
      return { code: JSON.stringify(data), map: null };
    },
  };
}

/**
 * P-01: the VK and OK build counts its loading from the first byte. The code (the entry, its preloaded chunks and the styles) is
 * fetched by a small loader of index.html that shows «Загрузка N%» by the bytes received of the build's own sizes, up to BOOT_BASE %;
 * then the game starts from the browser's cache and src/ui/vk-menu.ts bootProgress fills the rest. Any failure — the game starts
 * as before.
 */
const BOOT_BASE = 70;
function vkBootPlugin(): Plugin {
  return {
    name: 'vk-boot',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const size = (href: string): number => {
          const item = ctx.bundle![href.replace(/^\.\//, '')];
          if (!item) return 0;
          return item.type === 'chunk' ? Buffer.byteLength(item.code) : typeof item.source === 'string' ? Buffer.byteLength(item.source) : item.source.byteLength;
        };
        const files: Array<[string, number, number]> = [];
        const entry = /<script type="module" crossorigin src="([^"]+)"><\/script>\s*/.exec(html);
        if (!entry) return html;
        files.push([entry[1]!, size(entry[1]!), 0]);
        let out = html.replace(entry[0], '');
        out = out.replace(/<link rel="(modulepreload|stylesheet)" crossorigin href="([^"]+)">\s*/g, (_, rel: string, href: string) => {
          files.push([href, size(href), rel === 'stylesheet' ? 1 : 2]);
          return '';
        });
        const vk = readJson<{ texts: { common: Record<string, string> } }>(resolve(root, 'content/vk.json'));
        const text = vk.texts.common['boot.loading'] ?? '{n}%';
        const loader =
          `<script>window.__BOOT_BASE__=${BOOT_BASE};(function(){var L=${JSON.stringify(files)},T=0,G=0,B=${BOOT_BASE},M=${JSON.stringify(text)};` +
          `L.forEach(function(f){T+=f[1]||1});var pre=document.getElementById('preloader'),el=document.createElement('p');` +
          `el.className='boot-progress';el.setAttribute('data-boot-progress','0');el.style.cssText='margin:0;color:#fff;font:600 15px/1.4 system-ui,sans-serif';` +
          `pre.style.flexDirection='column';pre.style.gap='12px';pre.appendChild(el);` +
          `function show(){var n=Math.min(B,Math.floor(G/T*B));if(n<+el.getAttribute('data-boot-progress')&&el.textContent)return;el.setAttribute('data-boot-progress',n);el.textContent=M.replace('{n}',n)}show();` +
          `function get(u){return fetch(u).then(function(r){if(!r.ok||!r.body||!r.body.getReader)return;var rd=r.body.getReader();` +
          `return(function pump(){return rd.read().then(function(x){if(x.done)return;G+=x.value.byteLength;show();return pump()})})()}).catch(function(){})}` +
          `var started=0;function run(){if(started++)return;var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=L[0][0];document.body.appendChild(s)}` +
          `function go(){var css=0,h=document.head;L.forEach(function(f){if(!f[2])return;var e=document.createElement('link');e.rel=f[2]===1?'stylesheet':'modulepreload';e.crossOrigin='';e.href=f[0];` +
          `if(f[2]===1){css++;e.onload=e.onerror=function(){if(!--css)run()}}h.appendChild(e)});if(!css)run()}` +
          `Promise.all(L.map(function(f){return get(f[0])})).then(go,go)})()</script>`;
        return out.replace('</body>', `${loader}\n  </body>`);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const base = MODES[mode] ?? MODES.production!;
  const override = process.env.VITE_PLATFORM as Profile | undefined;
  if (override && !['yandex', 'null', 'youtube', 'vk'].includes(override)) throw new Error(`VITE_PLATFORM: unknown profile ${override}`);
  const flags: Flags = { ...base, platform: override ?? base.platform };

  return {
    base: './',
    plugins: [sdkMockPlugin(), htmlPlugin(mode, flags), ...(flags.platform === 'vk' ? [vkContentPlugin(), vkBootPlugin()] : [])],
    resolve: {
      alias: {
        '@content': resolve(root, 'content'),
        '@': resolve(root, 'src'),
      },
    },
    define: {
      __DEBUG_TOOLS__: JSON.stringify(flags.debug),
      __STUDIO__: JSON.stringify(flags.studio),
      __TEST_API__: JSON.stringify(flags.test),
      __BUILD_LABEL__: JSON.stringify(flags.label ? buildLabel() : ''),
      __BUILD_SHA__: JSON.stringify(buildSha()),
      __PLATFORM__: JSON.stringify(flags.platform),
      __GAME__: JSON.stringify(gameConfig(flags.platform)),
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
      modulePreload: { polyfill: false },
    },
    server: { port: 5173, strictPort: false },
    preview: { port: 4173, strictPort: false },
  };
});
