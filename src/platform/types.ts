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
  analytics: boolean;
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
  showRewarded(placement: string): Promise<{ rewarded: boolean }>;
  /** The platform review window (M3-11 «Gifts»): available — the platform can ask now; sent — the player left a review. */
  requestReview(): Promise<{ available: boolean; sent: boolean }>;
  load(): Promise<string | null>;
  save(data: string, opts?: { flush?: boolean }): void;
  now(): number;
}

/** Side channel for technical events (sdk_init_slow, cloud_save_failed, ...): the platform never imports analytics. */
export type PlatformTrack = (event: string, params?: Record<string, string | number>) => void;
