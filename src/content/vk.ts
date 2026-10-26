// What: content/vk.json parsed once (V-03): the VK and OK ids, ad and save rules, and the Russian texts of each site.
// Called by: src/platform/vk.ts, src/ui/vk-menu.ts, src/main.ts (vk build only: every import sits behind __PLATFORM__ === 'vk').
// Keep: the other builds never import this file; a text of one site never names the other.

import * as v from 'valibot';
import vkJson from '@content/vk.json';
import { VkFile } from './schemas.ts';

/** VK or OK (the same as VkSite of the platform layer; content imports no platform). */
type VkSite = 'vk' | 'ok';

export const vk = v.parse(VkFile, vkJson);

/** A text of the site (its own words first, then the common ones); {name} placeholders filled from vars. */
export function vkText(site: VkSite, key: string, vars: Record<string, string | number> = {}): string {
  const raw = vk.texts[site][key] ?? vk.texts.common[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** The community (VK) or group (OK) id of the site; 0 while the studio has not filled it. */
export function vkGroupId(site: VkSite): number {
  return Number(site === 'ok' ? vk.okGroupId : vk.vkGroupId) || 0;
}
