// What: the «Подарки» screen (docs/01 §3 p. 15; MU-08 by s5-gifts): «Загляни в группу» and the review chest → 7 days → «Забрать подарок дня» → the anomaly of the day → the goals of the day.
// Called by: src/main.ts (the Gifts button of the top bar); the community link opens in a new tab, the egg comes once the player is back.
// Keep: the reward is for a visit to the group, never for «following» (07 «Словарь»); once each; no community in the youtube profile (links === null); one way back — ✕.

import type { GiftsData, RarityName, RewardData } from '../content/schemas.ts';
import type { Game } from '../sim/game.ts';
import { openCommunity, type CommunityLinks, type Network } from './community.ts';
import { esc, iconize, ringPic } from './kit.ts';
import { closeX, createOverlay } from './overlay.ts';

export interface GiftsLookups {
  t(key: string, vars?: Record<string, string | number>): string;
  lang(): string;
  gifts: GiftsData;
  links: CommunityLinks | null;
  /** The player's local date, YYYY-MM-DD (platform time). */
  today(): string;
  rewardText(r: RewardData): string;
  /** A short label for a day cell: «◉ 50», «◆ 3» or the short egg name. */
  rewardShort(r: RewardData): string;
  eggPicture(id: string): string;
  /** A thing drawn by the scene (the review chest). */
  thing(name: string): string;
  /** M4-07: the anomaly of the day and the goals' names (calendar.json). */
  speciesName(id: string): string;
  portrait(species: string, rarity: RarityName): string;
  goalName(id: string): string;
  review(): Promise<{ available: boolean; sent: boolean }>;
  /** M5-02: the time boost tile (sales ×mult for a video); missing — no ad tile. */
  boost?: { busy(): boolean; left(): number; more(): number; watch(): void; thing: string };
}

export interface GiftsWindow {
  open(): void;
  render(): void;
  /** Something to take: today's gift or a group not visited yet. */
  hasNew(): boolean;
  /** M5-06: the «Оцени игру» window on its own (after the first purchase or from the 3rd session); false when reviewed. */
  askReview(): boolean;
}

/** A visit to the community page shorter than this does not count as coming back from it. */
const BACK_AFTER_MS = 1500;

export function createGiftsWindow(parent: HTMLElement, game: Game, look: GiftsLookups): GiftsWindow {
  // MU-08: a screen under the top bar with its own «Подарки ✕» row (s5-gifts), the tab bar stays.
  const overlay = createOverlay(parent, 'gifts', () => overlay.hide(), { kind: 'screen' });
  overlay.card.classList.add('card-gifts');
  const pending = new Map<Network, number>();
  let reviewBusy = false;
  // MU-09, MU-11: the review window — the window style of 07 over «Подарки»: the chest, one main «Оценить», ✕.
  const rate = createOverlay(parent, 'rate', () => rate.hide(), { over: ['gifts'] });
  rate.card.classList.add('card-rate');
  const sendReview = (): void => {
    if (reviewBusy) return;
    reviewBusy = true;
    void look.review().then((r) => {
      reviewBusy = false;
      if (r.sent) game.claimReview();
      rate.hide();
      win.render();
    });
  };
  const openRate = (): void => {
    rate.card.innerHTML =
      `<h2>${esc(look.t('rate.title'))}</h2><span class="mu-pic rate-pic"><img alt="" src="${look.thing('chest')}"></span>` +
      `<p class="mu-meta rate-text">${esc(look.t('rate.text'))}</p>` +
      `<button type="button" class="mu-btn main" data-action="rate-send">${esc(look.t('gifts.reviewBtnSend'))}</button>`;
    closeX(rate.card, '✕', () => rate.hide(), 'rate-close');
    rate.card.querySelector('[data-action="rate-send"]')?.addEventListener('click', sendReview);
    rate.show();
  };

  // Back from the community page: the egg for the visit, once.
  const back = (): void => {
    if (document.visibilityState !== 'visible') return;
    for (const [network, at] of pending) {
      if (Date.now() - at < BACK_AFTER_MS) continue;
      pending.delete(network);
      game.claimSubscribe(network);
    }
    if (overlay.isOpen()) win.render();
  };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);
  const head = (key: string): string => `<div class="mu-head"><h3>${esc(look.t(key))}</h3><span></span></div>`;

  const win: GiftsWindow = {
    askReview() {
      if (game.giftsView(look.today()).reviewed) return false;
      openRate();
      return true;
    },
    open() {
      win.render();
      overlay.show();
    },
    hasNew() {
      const v = game.giftsView(look.today());
      const d = game.dayView(look.today());
      if (!d.eggTaken || d.goals.some((g) => g.done && !g.claimed)) return true;
      return v.dailyReady || (look.links !== null && look.gifts.subscribe.some((s) => !v.subscribed[s.id]));
    },
    render() {
      const v = game.giftsView(look.today());
      const d = game.dayView(look.today());
      const parts: string[] = [
        `<div class="mu-back gifts-top"><h2>${esc(look.t('gifts.title'))}</h2><button type="button" class="mu-round" data-action="gifts-close" aria-label="${esc(look.t('sheet.close'))}">✕</button></div>`,
      ];
      // 1. A visit to the group and a review: two cards side by side.
      const visit = look.links ? look.gifts.subscribe.find((s) => !v.subscribed[s.id]) : undefined;
      const cards: string[] = [];
      if (look.links)
        cards.push(
          `<div class="mu-card gift-card" data-gift="group"><span class="mu-pic"><img alt="" src="${look.eggPicture(look.gifts.subscribe[0]?.reward.egg ?? 'egg_warm')}"></span><span class="mu-name">${esc(look.t('gifts.follow'))}</span>` +
            (visit
              ? `<button type="button" class="mu-btn" data-action="gift-follow-${visit.id}">${esc(look.t('gifts.followBtn'))} · ${esc(look.t('gifts.egg'))}</button>`
              : `<button type="button" class="mu-btn off" aria-disabled="true">${esc(look.t('gifts.got'))}</button>`) +
            '</div>',
        );
      cards.push(
        `<div class="mu-card gift-card" data-gift="review"><span class="mu-pic"><img alt="" src="${look.thing('chest')}"></span><span class="mu-name">${esc(look.t('gifts.reviewChest'))}</span>` +
          (v.reviewed ? `<button type="button" class="mu-btn off" aria-disabled="true">${esc(look.t('gifts.got'))}</button>` : `<button type="button" class="mu-btn" data-action="gift-review">${esc(look.t('gifts.reviewBtn'))}</button>`) +
          '</div>',
      );
      parts.push(`<div class="mu-grid gift-top">${cards.join('')}</div>`);
      // 2. Seven days: 4 + 3 cells, the 7th on two; today filled.
      parts.push(head('gifts.days'), '<div class="days">');
      look.gifts.daily.forEach((g, i) => {
        const state = i < v.day || (i === v.day && !v.dailyReady) ? 'taken' : i === v.day ? 'today' : 'later';
        parts.push(`<div class="day day-${state}" data-day="${i + 1}"><b>${esc(look.t('gifts.day', { n: g.day }))}</b><span>${iconize(look.rewardShort(g.reward))}</span></div>`);
      });
      parts.push('</div>');
      // 3. The green «take» of the day (no «Done» button: the ✕ closes).
      parts.push(
        v.dailyReady
          ? `<button type="button" class="mu-btn good gift-take" data-action="gift-daily">${esc(look.t('gifts.take'))}</button>`
          : `<p class="mu-meta gift-take gift-tomorrow">${esc(look.t('gifts.tomorrow'))}</p>`,
      );
      // M5-02 (brief: boosts by time are tiles in «Gifts»): the sales boost for a video; while it runs — the time left.
      if (look.boost) {
        const left = Math.ceil(look.boost.left());
        parts.push(
          head('ad.boosts'),
          `<div class="mu-card gift-boost" data-gift="boost"><span class="mu-pic"><img alt="" src="${look.thing(look.boost.thing)}"></span><span class="day-text"><b class="mu-name">${esc(look.t('ad.boostName'))}</b>` +
            `<span class="mu-meta">${esc(left > 0 ? look.t('ad.boostOn', { t: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` }) : look.t('ad.boostText'))}</span></span>` +
            (left > 0
              ? ''
              : look.boost.more() <= 0
                ? `<span class="mu-meta day-got">${esc(look.t('ad.tomorrow'))}</span>`
                : `<button type="button" class="mu-btn btn-ad" data-action="ad-boost" aria-disabled="${look.boost.busy()}">${esc(look.t('ad.boost'))}</button>`) +
            '</div>',
        );
      }
      // 4. The anomaly of the day: its pet in the rarity frame, an egg once a day.
      if (d.species)
        parts.push(
          head('day.title'),
          `<div class="mu-card rar day-anomaly" data-rarity="${d.rarity}">${ringPic(look.portrait(d.species, d.rarity), d.rarity, 52)}<span class="day-text"><b class="mu-name">${esc(look.speciesName(d.species))}</b>` +
            `<span class="mu-meta">${esc(look.t('day.short', { n: new Intl.NumberFormat(look.lang(), { maximumFractionDigits: 2 }).format(d.mult).replace(/[.,]/, (x) => `${x}\u2060`), m: d.holdMin }))}</span></span>` +
            (d.eggTaken ? `<span class="mu-meta day-got">${esc(look.t('gifts.got'))}</span>` : `<button type="button" class="mu-btn" data-action="day-egg">${esc(look.t('day.take'))}</button>`) +
            '</div>',
        );
      // 5. The goals of the day with their progress.
      if (d.goals.length) {
        parts.push(head('day.goals'));
        for (const g of d.goals)
          parts.push(
            `<div class="mu-card day-goal" data-goal="${g.id}"><span class="day-text"><b class="mu-name">${esc(look.goalName(g.id))}</b><span class="goal-bar"><i style="width:${Math.round((Math.min(g.have, g.need) / Math.max(1, g.need)) * 100)}%"></i></span>` +
              `<span class="mu-meta">${g.have}/${g.need} · ${iconize(look.rewardShort(g.reward))}</span></span>` +
              (g.claimed
                ? `<span class="mu-meta day-got">${esc(look.t('gifts.got'))}</span>`
                : g.done
                  ? `<button type="button" class="mu-btn good" data-action="day-goal-${g.id}">${esc(look.t('day.claim'))}</button>`
                  : '') +
              '</div>',
          );
      }
      overlay.card.innerHTML = parts.join('');
      const body = overlay.card;
      body.querySelector('[data-action="gifts-close"]')?.addEventListener('click', () => overlay.hide());
      body.querySelector('[data-action="day-egg"]')?.addEventListener('click', () => {
        game.claimDayEgg(look.today());
        win.render();
      });
      for (const g of d.goals)
        body.querySelector(`[data-action="day-goal-${g.id}"]`)?.addEventListener('click', () => {
          game.claimDayGoal(look.today(), g.id);
          win.render();
        });
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
      body.querySelector('[data-action="gift-review"]')?.addEventListener('click', openRate);
      body.querySelector('[data-action="ad-boost"]')?.addEventListener('click', (e) => {
        if ((e.currentTarget as HTMLElement).getAttribute('aria-disabled') !== 'true') look.boost?.watch();
      });
    },
  };
  return win;
}
