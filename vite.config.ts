import { defineConfig, type Plugin, type Connect } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// Build modes and platform profiles (docs/02-tech.md, sections 3 and 6).
// The profile comes from the mode; VITE_PLATFORM=yandex|null|youtube overrides it.
type Profile = 'yandex' | 'null' | 'youtube';
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

/** Public part of game.json for one profile. The youtube build gets no community links and no counter id. */
function gameConfig(platform: Profile): Record<string, unknown> {
  const game = readJson<GameJson>(resolve(root, 'game.json'));
  const profile = game.profiles[platform];
  if (!profile) throw new Error(`game.json: no profile "${platform}"`);
  const { sdk: _sdk, ...profileRest } = profile;
  return {
    id: game.id,
    title: game.title,
    languages: game.languages,
    fallbackLanguage: game.fallbackLanguage,
    ruFallbackLanguages: game.ruFallbackLanguages ?? ['ru'],
    community: profile.community && game.community ? game.community : null,
    metrikaCounterId: platform === 'yandex' ? Number(game.metrikaCounterId || 0) : 0,
    profile: { name: platform, ...profileRest },
  };
}

/** Label for the producer link: last milestone whose features all pass or are deferred (docs/05, section 2). */
function buildLabel(): string {
  let done = 'M0';
  const file = resolve(root, 'feature_list.json');
  if (existsSync(file)) {
    const list = readJson<{
      milestones?: Array<{ code: string }>;
      features?: Array<{ milestone: string; passes?: boolean; deferred?: boolean }>;
    }>(file);
    const features = list.features ?? [];
    for (const { code } of list.milestones ?? []) {
      const own = features.filter((f) => f.milestone === code);
      if (own.length > 0 && own.every((f) => f.passes || f.deferred)) done = code;
      else break;
    }
  }
  let sha = (process.env.BUILD_SHA || '').slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'local';
    }
  }
  return `${done} · ${new Date().toISOString().slice(0, 10)} · ${sha}`;
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

export default defineConfig(({ mode }) => {
  const base = MODES[mode] ?? MODES.production!;
  const override = process.env.VITE_PLATFORM as Profile | undefined;
  if (override && !['yandex', 'null', 'youtube'].includes(override)) throw new Error(`VITE_PLATFORM: unknown profile ${override}`);
  const flags: Flags = { ...base, platform: override ?? base.platform };

  return {
    base: './',
    plugins: [sdkMockPlugin(), htmlPlugin(mode, flags)],
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
