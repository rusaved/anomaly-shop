// `npm run e2e:release` (mode release): unpack the newest release/*.zip and run e2e/smoke-release.spec.ts on it.
// `node scripts/e2e-static.mjs pages`: run e2e/pages.spec.ts over dist-pages.
// `npm run e2e:youtube` (mode youtube, M6-04): run e2e/youtube-m6.spec.ts over dist-youtube on a fake ytgame.
// `npm run e2e:vk` (mode vk, V-09): run e2e/vk-v.spec.ts over dist-pages (vk/) on the bridge stand-in.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] || 'release';
let dir;
let spec;
let port;

if (mode === 'release') {
  const zipArg = process.argv.slice(3).find((a) => a.endsWith('.zip'));
  const releaseDir = resolve(root, 'release');
  const zips = zipArg
    ? [resolve(zipArg)]
    : existsSync(releaseDir)
      ? readdirSync(releaseDir)
          .filter((f) => f.endsWith('.zip') && !f.includes('-playtest') && !f.includes('-youtube'))
          .map((f) => join(releaseDir, f))
          .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      : [];
  if (!zips.length) {
    console.error('e2e:release: no release/*.zip — run npm run pack first');
    process.exit(1);
  }
  const zip = zips[0];
  dir = resolve(root, '.cache/release-unpacked');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = unzipSync(new Uint8Array(readFileSync(zip)));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const out = join(dir, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
  console.log(`e2e:release: unpacked ${zip} (${Object.keys(files).length} entries) to ${dir}`);
  spec = 'smoke-release.spec.ts';
  port = 4180;
} else if (mode === 'pages') {
  dir = resolve(root, 'dist-pages');
  if (!existsSync(join(dir, 'index.html'))) {
    console.error('e2e pages: dist-pages/index.html missing — run npm run build:pages first');
    process.exit(1);
  }
  spec = 'pages.spec.ts';
  port = 4181;
} else if (mode === 'youtube') {
  dir = resolve(root, 'dist-youtube');
  if (!existsSync(join(dir, 'index.html'))) {
    console.error('e2e youtube: dist-youtube/index.html missing — run npm run build:youtube first');
    process.exit(1);
  }
  spec = 'youtube-m6.spec.ts';
  port = 4182;
} else if (mode === 'vk') {
  // V-09: the published site of build:pages — the VK and OK build in vk/ (P-06: no pages of documents).
  dir = resolve(root, 'dist-pages');
  if (!existsSync(join(dir, 'vk/index.html'))) {
    console.error('e2e vk: dist-pages/vk missing — run npm run build:pages first');
    process.exit(1);
  }
  spec = 'vk-v.spec.ts';
  port = 4183;
} else {
  console.error(`e2e-static: unknown mode ${mode}`);
  process.exit(2);
}

const res = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.static.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, E2E_STATIC_DIR: dir, E2E_STATIC_PORT: String(port), E2E_SPEC: spec },
});
process.exit(res.status ?? 1);
