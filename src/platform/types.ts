// What: the Platform contract (docs/02-tech.md, section 6.1); one implementation per profile, chosen at build time.
// Called by: src/main.ts and any module that needs saves, language, pause, ads or time; implemented by yandex.ts, youtube.ts, null.ts.
// Keep: this shape is all the game knows about a platform; SDK types never leak out of src/platform.

export type PlatformName = 'yandex' | 'null' | 'youtube';
export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type Lang = 'ru' | 'en';

export interface PlatformCaps {
  ads: boolean;
  payments: boolean;
  community: boolean;
  /** M7-01, CNT-08: a gift for a visit to the community group (game.json profile communityGift). */
  communityGift?: boolean;
  analytics: boolean;
}

/** M4-04: one row of the leaderboard; name '' — an anonymous player (the UI says «Player»). */
export interface LeaderEntry {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

/** M4-04: the general leaderboard of the platform (coins earned); a local stand-in where the platform has none. */
export interface Leaders {
  /** The player is not signed in: the score waits for a sign-in (the Yandex «lite» player). */
  needsLogin(): boolean;
  /** Asks the platform to sign in (a button tap); true when signed in after it. */
  login(): Promise<boolean>;
  submit(score: number): Promise<void>;
  top(n: number): Promise<{ entries: LeaderEntry[]; me: LeaderEntry | null }>;
}

export type RewardedOutcome = 'rewarded' | 'closed' | 'unavailable';

/** M5-05: one product of the platform catalog: id as in the console, the price text in the platform currency. */
export interface Product {
  id: string;
  price: string;
}
export interface Payments {
  catalog(): Promise<Product[]>;
  /** ok — paid (the caller grants, then consume() for a consumable); cancel — the player closed the window; error — failed. */
  buy(id: string): Promise<{ result: 'ok' | 'cancel' | 'error'; token: string }>;
  /** Purchases not consumed yet (restore at start: «no ads» stays, a crash between pay and grant is granted now). */
  owned(): Promise<Array<{ id: string; token: string }>>;
  consume(token: string): Promise<void>;
}

export interface Platform {
  readonly name: PlatformName;
  readonly device: DeviceType;
  readonly caps: PlatformCaps;
  init(): Promise<void>;
  /** ru for ru, be, kk, uk, uz; otherwise en (game.json: ruFallbackLanguages, fallbackLanguage). */
  language(): Lang;
  firstFrame(): void;
  /** Strictly once: the shop is drawn and a tap works. */
  ready(): void;
  /** Only on a change of state (SDK-04). */
  gameplayStart(): void;
  gameplayStop(): void;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  audioAllowed(): boolean;
  onAudioChange(cb: (on: boolean) => void): void;
  showInterstitial(placement: string): Promise<{ shown: boolean }>;
  /** M5-02: rewarded — the reward is due (onRewarded, even a late one); closed — closed early; unavailable — no video (error, offline, no ads). */
  showRewarded(placement: string): Promise<{ rewarded: boolean; outcome: RewardedOutcome }>;
  /** M5-00: the sticky banner of the platform console; «no ads» hides it (IAP-03). */
  setBanner(on: boolean): void;
  /** M5-05: purchases through the platform (caps.payments); a stand-in that never sells where there are none. */
  readonly payments: Payments;
  /** The platform review window (M3-11 «Gifts»): available — the platform can ask now; sent — the player left a review. */
  requestReview(): Promise<{ available: boolean; sent: boolean }>;
  /** M4-04: the general leaderboard. */
  readonly leaders: Leaders;
  load(): Promise<string | null>;
  save(data: string, opts?: { flush?: boolean }): void;
  now(): number;
}

/** Side channel for technical events (sdk_init_slow, cloud_save_failed, ...): the platform never imports analytics. */
export type PlatformTrack = (event: string, params?: Record<string, string | number>) => void;
