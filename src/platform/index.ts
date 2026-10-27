// What: picks the one platform module of this build by __PLATFORM__; the others never land in the bundle.
// Called by: src/main.ts.
// Keep: each branch compares a build-time constant, so the bundler drops the dead dynamic imports (docs/02-tech.md, section 6).

import type { Platform, PlatformTrack } from './types.ts';

let stand = false;
/** N-05: the VK stand-in of ?mock=vk in a plain tab (never a game VK or OK launched) — the producer's check link works there. */
export const vkStand = (): boolean => stand;

export async function loadPlatform(track: PlatformTrack): Promise<Platform> {
  if (__PLATFORM__ === 'yandex') {
    const m = await import('./yandex.ts');
    return m.createYandexPlatform(m.browserDeps(track));
  }
  if (__PLATFORM__ === 'youtube') {
    const m = await import('./youtube.ts');
    return m.createYoutubePlatform(m.browserDeps(track));
  }
  if (__PLATFORM__ === 'vk') {
    // V-02: the npm bridge inside VK and OK; the stand-in only for ?mock=vk in a plain tab (never when VK or OK launched the game).
    const m = await import('./vk.ts');
    const { vk, vkGroupId } = await import('../content/vk.ts');
    const mock = new URLSearchParams(location.search).get('mock') === 'vk' && !m.launchedByPlatform(location.search);
    stand = mock;
    const bridge = mock ? (await import('./vk-mock.ts')).createVkMock() : (await import('@vkontakte/vk-bridge')).default;
    // The stand-in joins a made-up group while the studio has not filled the ids (the flow can be tried on the producer link).
    const groupId = mock ? (site: 'vk' | 'ok') => vkGroupId(site) || 1 : vkGroupId;
    const platform = m.createVkPlatform(m.browserDeps(bridge as unknown as import('./vk.ts').VkBridgeLike, track, { ...vk.save, rewardedRecheckSec: vk.ads.rewardedRecheckSec }, groupId));
    // S-09: VK and OK run the screen themselves (live bridge: no request); the stand-in of ?mock=vk in a plain tab — the browser's.
    if (!mock) return platform;
    const { browserFullscreen } = await import('./shared.ts');
    return Object.assign(platform, { fullscreen: browserFullscreen() });
  }
  const m = await import('./null.ts');
  return m.createNullPlatform(m.browserDeps());
}
