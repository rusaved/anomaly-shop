// `npm run check:vk` (V-04, V-12 «Ресейл 16»): the VK and OK build passes the platform's rules as far as a file can show them —
// no external address, no word or link of other platforms, no review window call, no counters, no debug or test API,
// VK Bridge in, VKWebAppInit present; prints the weight of dist-vk.
// Contract: checkVkBuild(files: Array<[relativePath, text]>) => { problems: string[] }; exit 1 on a problem.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { findExternalUrls } from './check-bundle-urls.mjs';

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
/** Words a player of VK or OK must never meet in this build (the ids of the Yandex build's buttons are not words a player sees). */
export const BANNED = [
  [/яндекс/i, 'Яндекс'],
  [/yandex/i, 'Yandex'],
  [/YaGames|ysdk/, 'Yandex SDK'],
  [/Telegram|Телеграм|t\.me\//, 'Telegram'],
  [/вконтакт/i, 'название VK (сборка общая для VK и ОК)'],
  [/одноклассник/i, 'название ОК (сборка общая для VK и ОК)'],
  [/mc\.yandex|tag\.js|googletagmanager|google-analytics|gtag\(|top-fwz1|counter\.yadro/i, 'сторонний счётчик'],
  [/__TEST__|lil-gui/, 'тестовый API или отладка'],
];

export function checkVkBuild(files) {
  const problems = [...findExternalUrls(files, 'null').problems];
  for (const [name, text] of files) {
    if (!TEXT_EXT.has(extname(name))) continue;
    for (const [re, what] of BANNED) if (re.test(text)) problems.push(`${name}: ${what} — «${text.match(re)[0]}»`);
  }
  const all = files.map(([, t]) => t).join('\n');
  if (!all.includes('VKWebAppInit')) problems.push('VKWebAppInit: нет в сборке');
  if (!all.includes('VKWebAppCheckNativeAds')) problems.push('VKWebAppCheckNativeAds: нет в сборке');
  const html = files.find(([n]) => n === 'index.html')?.[1] ?? '';
  if (/<script[^>]+src="(https?:)?\/\//.test(html)) problems.push('index.html: внешний скрипт');
  return { problems };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const dir = resolve(process.argv[2] ?? 'dist-vk');
  const files = [];
  let bytes = 0;
  let gz = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const buf = readFileSync(p);
        bytes += buf.length;
        if (['.js', '.css', '.html'].includes(extname(p))) gz += gzipSync(buf).length;
        files.push([relative(dir, p).split('\\').join('/'), TEXT_EXT.has(extname(p)) ? buf.toString('utf8') : '']);
      }
    }
  };
  walk(dir);
  const { problems } = checkVkBuild(files);
  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`check:vk: ${files.length} файлов, ${mb(bytes)} МБ, код gzip ${mb(gz)} МБ`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log('check:vk: ok');
}
