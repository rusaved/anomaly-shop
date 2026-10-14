// What: the two community buttons (docs/02-tech.md, section 6.5; docs/03 CNT-08): Telegram and VK with the promo-code caption.
// Called by: src/ui/pause.ts, src/ui/settings.ts, src/main.ts (side slot of the panel) — by community.placement of game.json.
// Keep: the only window.open in the game; the one reward for following lives in src/ui/gifts.ts (M3-11, once); with community === null (youtube) nothing is rendered.

import { track } from '../analytics/track.ts';

export type Network = 'telegram' | 'vk';
export interface CommunityLinks {
  telegram: string;
  vk: string;
  placement: string[];
}

export function communityLinks(): CommunityLinks | null {
  return __GAME__.community;
}

export function openCommunity(links: CommunityLinks, network: Network): void {
  track('community_open', { network });
  window.open(links[network], '_blank', 'noopener');
}

/** Renders the block into parent when the placement allows it; returns the element or null. */
export function renderCommunity(parent: HTMLElement, links: CommunityLinks | null, placement: string, compact = false): HTMLElement | null {
  if (!links || !links.placement.includes(placement)) return null;
  const root = document.createElement('div');
  root.className = compact ? 'community community-compact' : 'community';
  root.dataset.community = placement;
  const caption = document.createElement('div');
  caption.className = 'community-caption';
  caption.dataset.i18n = 'community.caption';
  const row = document.createElement('div');
  row.className = 'community-row';
  for (const network of ['telegram', 'vk'] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-community';
    b.dataset.action = `community-${network}`;
    b.dataset.i18n = `community.${network}`;
    b.addEventListener('click', () => openCommunity(links, network));
    row.appendChild(b);
  }
  if (compact) {
    root.append(row, caption);
  } else {
    root.append(caption, row);
  }
  parent.appendChild(root);
  return root;
}
