// What: the Gifts window (docs/01 §3 p. 15; M3-11): an egg for following a community (VK, Telegram), the golden egg for a review, 7 days of gifts.
// Called by: src/main.ts (the Gifts button of the top bar); the community link opens in a new tab, the egg comes once the player is back.
// Keep: the only rewards for leaving the game are these, once each; no community links in the youtube profile (links === null); no words «ad» or «referral».

import type { GiftsData, RewardData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { openCommunity, type CommunityLinks, type Network } from './community.ts';
import { button, createOverlay } from './overlay.ts';

export interface GiftsLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  gifts: GiftsData;
  links: CommunityLinks | null;
  /** The player's local date, YYYY-MM-DD (platform time). */
  today(): string;
  rewardText(r: RewardData): string;
  /** A short label for a day cell: a number or the short egg name. */
  rewardShort(r: RewardData): string;
  eggPicture(id: string): string;
  review(): Promise<{ available: boolean; sent: boolean }>;
}

export interface GiftsWindow {
  open(): void;
  render(): void;
  /** Something to take: today's gift or a community not followed yet. */
  hasNew(): boolean;
}

/** A visit to the community page shorter than this does not count as coming back from it. */
const BACK_AFTER_MS = 1500;

export function createGiftsWindow(parent: HTMLElement, game: Game, look: GiftsLookups): GiftsWindow {
  const overlay = createOverlay(parent, 'gifts', () => overlay.hide());
  overlay.card.classList.add('card-gifts');
  const body = document.createElement('div');
  body.className = 'gifts';
  const close = button('gifts-close', 'gifts.close', 'btn-primary');
  close.addEventListener('click', () => overlay.hide());
  overlay.card.append(body, close);
  const pending = new Map<Network, number>();
  let reviewBusy = false;

  // Back from the community page: the egg for following, once.
  const back = (): void => {
    if (document.visibilityState !== 'visible') return;
    for (const [network, at] of pending) {
      if (Date.now() - at < BACK_AFTER_MS) continue;
      pending.delete(network);
      game.claimSubscribe(network);
    }
    win.render();
  };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);

  const win: GiftsWindow = {
    open() {
      win.render();
      overlay.show();
    },
    hasNew() {
      const v = game.giftsView(look.today());
      return v.dailyReady || (look.links !== null && look.gifts.subscribe.some((s) => !v.subscribed[s.id]));
    },
    render() {
      const v = game.giftsView(look.today());
      const parts: string[] = [`<h2>${look.t('gifts.title')}</h2>`];
      // Seven days: the count only goes on; today's cell is the one to take.
      parts.push(`<h3 class="eggs-title">${look.t('gifts.days')}</h3><div class="days">`);
      look.gifts.daily.forEach((d, i) => {
        const state = i < v.day || (i === v.day && !v.dailyReady) ? 'taken' : i === v.day ? 'today' : 'later';
        const pic = d.reward.egg ? `<img alt="" src="${look.eggPicture(d.reward.egg)}">` : `<span class="${d.reward.crystals ? 'gem' : 'coin'}" aria-hidden="true"></span>`;
        parts.push(`<div class="day day-${state}" data-day="${i + 1}"><small>${look.t('gifts.day', { n: d.day })}</small>${pic}<b>${look.rewardShort(d.reward)}</b></div>`);
      });
      parts.push('</div>');
      parts.push(v.dailyReady ? `<button type="button" class="btn btn-primary" data-action="gift-daily">${look.t('gifts.take')}</button>` : `<p class="card-sub">${look.t('gifts.tomorrow')}</p>`);
      if (look.links) {
        parts.push(`<h3 class="eggs-title">${look.t('gifts.follow')}</h3>`);
        for (const s of look.gifts.subscribe) {
          const done = Boolean(v.subscribed[s.id]);
          parts.push(
            `<div class="gift-row"><span>${look.t(`community.${s.id}`)} · ${look.rewardText(s.reward)}</span>` +
              (done ? `<span class="chip-on">${look.t('gifts.got')}</span>` : `<button type="button" class="btn btn-small" data-action="gift-follow-${s.id}">${look.t('gifts.followBtn')}</button>`) +
              '</div>',
          );
        }
      }
      parts.push(
        `<h3 class="eggs-title">${look.t('gifts.review')}</h3><div class="gift-row"><span>${look.rewardText(look.gifts.review.reward)}</span>` +
          (v.reviewed ? `<span class="chip-on">${look.t('gifts.got')}</span>` : `<button type="button" class="btn btn-small" data-action="gift-review">${look.t('gifts.reviewBtn')}</button>`) +
          '</div>',
      );
      body.innerHTML = parts.join('');
      body.querySelector('[data-action="gift-daily"]')?.addEventListener('click', () => {
        game.claimDaily(look.today());
        win.render();
      });
      for (const s of look.gifts.subscribe)
        body.querySelector(`[data-action="gift-follow-${s.id}"]`)?.addEventListener('click', () => {
          if (!look.links) return;
          pending.set(s.id, Date.now());
          openCommunity(look.links, s.id);
        });
      body.querySelector('[data-action="gift-review"]')?.addEventListener('click', () => {
        if (reviewBusy) return;
        reviewBusy = true;
        void look.review().then((r) => {
          reviewBusy = false;
          if (r.sent) game.claimReview();
          win.render();
        });
      });
    },
  };
  return win;
}
