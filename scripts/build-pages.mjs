// `npm run build:pages` (docs/05-milestones-and-tests.md, section 2): playtest build on the Yandex SDK mock for
// GitHub Pages in dist-pages/: debug tools and studio on, test API off, mock as a file next to index.html,
// relative sdk.js (the game lives in a subfolder there), milestone label in the corner.
// V-09 («Ресейл 16»): next to it the VK and OK build in dist-pages/vk/ (the release build dist-vk; ?mock=vk — the bridge stand-in in
// a plain tab) and the terms and privacy pages in dist-pages/legal/ (V-10).
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist-pages');
const res = spawnSync('npx', ['vite', 'build', '--mode', 'pages', '--outDir', 'dist-pages', '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
if (res.status !== 0) process.exit(res.status ?? 1);
// M5-00: the producer link behaves like Yandex (truthful stand): full screen on the first tap, the sticky banner stand-in
// on a computer, the dark «ad» screen for 3 s. The address still overrides each default (?mock_banner=0, ?banner=1).
const defaults = { mock_fullscreen: 'tap', mock_banner: 'auto', mock_ad_ms: '3000' };
writeFileSync(
  resolve(out, 'sdk.js'),
  `window.__YA_MOCK_DEFAULTS__=${JSON.stringify(defaults)};\n` + readFileSync(resolve(root, 'dev/yasdk-mock/sdk.js'), 'utf8'),
);
writeFileSync(resolve(out, '.nojekyll'), '');
const html = readFileSync(resolve(out, 'index.html'), 'utf8');
if (!html.includes('<script src="sdk.js"></script>') || html.includes('src="/sdk.js"')) {
  console.error('build:pages: index.html must load sdk.js by a relative path');
  process.exit(1);
}
if (!existsSync(resolve(out, 'sdk.js'))) {
  console.error('build:pages: sdk.js missing');
  process.exit(1);
}
const vk = spawnSync('npx', ['vite', 'build', '--mode', 'vk', '--outDir', 'dist-pages/vk', '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
if (vk.status !== 0) process.exit(vk.status ?? 1);
cpSync(resolve(root, 'legal'), resolve(out, 'legal'), { recursive: true });
for (const f of ['vk/index.html', 'legal/terms.html', 'legal/privacy.html']) {
  if (!existsSync(resolve(out, f))) {
    console.error(`build:pages: ${f} missing`);
    process.exit(1);
  }
}
console.log('build:pages: dist-pages ready (sdk.js relative, mock copied; vk/ and legal/ next to it)');
