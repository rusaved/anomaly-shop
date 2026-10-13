// What: picks the one platform module of this build by __PLATFORM__; the other two never land in the bundle.
// Called by: src/main.ts.
// Keep: each branch compares a build-time constant, so the bundler drops the dead dynamic imports (docs/02-tech.md, section 6).

import type { Platform, PlatformTrack } from './types.ts';

export async function loadPlatform(track: PlatformTrack): Promise<Platform> {
  if (__PLATFORM__ === 'yandex') {
    const m = await import('./yandex.ts');
    return m.createYandexPlatform(m.browserDeps(track));
  }
  if (__PLATFORM__ === 'youtube') {
    const m = await import('./youtube.ts');
    return m.createYoutubePlatform(m.browserDeps(track));
  }
  const m = await import('./null.ts');
  return m.createNullPlatform(m.browserDeps());
}
