// What: valibot schemas of game.json and every content/*.json (docs/02-tech.md, section 5); the types of the data come from here.
// Called by: src/content/validate.ts (validate:content, tests), src/content/index.ts (typed load at boot).
// Keep: Node loads this file without a bundler — relative imports with .ts, erasable syntax only (no enum, no namespaces).

import * as v from 'valibot';

const Id = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/, 'id: lowercase letters, digits and _'));
const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1, 'empty string'));
const Text = v.object({ ru: NonEmpty, en: NonEmpty });
const Count = v.pipe(v.number(), v.integer(), v.minValue(1));
const Money = v.pipe(v.number(), v.minValue(0));
const Share = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const Pct = v.pipe(v.number(), v.minValue(0), v.maxValue(100));
const Range = v.object({ min: Share, max: Share });
const Color = v.pipe(v.string(), v.regex(/^(#[0-9a-fA-F]{6}|rgba?\([0-9., ]+\))$/, 'color: #rrggbb or rgb()/rgba()'));
const Reward = v.object({ coins: v.optional(Money), crystals: v.optional(Money) });

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export const Rarity = v.picklist(RARITIES);
export const LANGS = ['ru', 'en'] as const;

export const Unlock = v.variant('type', [
  v.object({ type: v.literal('start') }),
  v.object({ type: v.literal('deals'), count: Count }),
  v.object({ type: v.literal('district'), id: Id }),
  v.object({ type: v.literal('milestone'), id: v.pipe(v.string(), v.regex(/^M\d+$/)) }),
  v.object({ type: v.literal('stat'), stat: v.picklist(['deals', 'hatched', 'levelUps', 'haggles']), count: Count }),
  v.object({ type: v.literal('upgrade'), id: Id }),
]);

export const Egg = v.object({
  id: Id,
  name: Text,
  price: v.object({ coins: Money }),
  hatchSec: Money,
  chances: v.object({ common: Pct, rare: Pct, epic: Pct, legendary: Pct }),
  unlock: Unlock,
  special: v.optional(v.picklist(['daily'])),
});
export const EggsFile = v.object({ tapSpeedupSec: v.pipe(v.number(), v.minValue(0)), minHatchSec: Money, rescueEgg: Id, eggs: v.pipe(v.array(Egg), v.minLength(1)) });

export const Species = v.object({
  id: Id,
  name: Text,
  rarity: Rarity,
  basePrice: v.pipe(v.number(), v.minValue(1)),
  growth: v.pipe(v.number(), v.minValue(1)),
  maxLevel: Count,
  line: Text,
});
/** Showcase growth (docs/01, section 3.5): a creature gains growthPerMin of its price per minute on the shelf, up to maxBonus. */
export const Shelf = v.object({ growthPerMin: v.pipe(v.number(), v.minValue(0)), maxBonus: v.pipe(v.number(), v.minValue(0)) });
export const SpeciesFile = v.object({ tapsPerLevelBase: Count, shelf: Shelf, species: v.pipe(v.array(Species), v.minLength(1)) });

export const Customer = v.object({
  id: Id,
  name: Text,
  offer: v.object({ min: v.pipe(v.number(), v.minValue(0)), max: v.pipe(v.number(), v.minValue(0)) }),
  likes: v.picklist(['cheap', 'rare', 'level']),
  leaveOnBargain: Share,
  rarityBonus: v.optional(Share),
  levelBonusPerLevel: v.optional(Share),
});
/** weight: share of arrivals among open districts; attract: +weight per creature on the showcase this customer likes. */
export const District = v.object({ id: Id, name: Text, unlock: Unlock, customer: Customer, weight: v.pipe(v.number(), v.minValue(0)), attract: v.pipe(v.number(), v.minValue(0)) });
export const CustomersFile = v.object({
  queueSize: Count,
  spawnEverySec: v.pipe(v.number(), v.minValue(0.1)),
  waitNextSec: Money,
  bargainBonus: Range,
  bargainMax: Count,
  districts: v.pipe(v.array(District), v.minLength(1)),
});

/** Things the scene can draw for bought upgrades (src/scene/decor.ts). */
export const DECOR_ITEMS = ['sign', 'register', 'bell', 'mat', 'bowl', 'stool', 'radio', 'clock', 'board', 'tags', 'feeder', 'seller', 'courier'] as const;

export const Effect = v.variant('type', [
  v.object({ type: v.literal('slots'), perLevel: Count }),
  v.object({ type: v.literal('hatchTime'), perLevel: v.pipe(v.number(), v.minValue(-1), v.maxValue(0)) }),
  v.object({ type: v.literal('showcaseSlots'), base: v.optional(Count), perLevel: Count }),
  v.object({ type: v.literal('spawnRate'), perLevel: v.pipe(v.number(), v.minValue(-1), v.maxValue(0)) }),
  v.object({ type: v.literal('bargain'), perLevel: Share }),
  v.object({ type: v.literal('autoFeed'), creatures: Count, tapsPerSec: v.pipe(v.number(), v.minValue(0)), offline: v.boolean() }),
  v.object({ type: v.literal('autoSell'), priceShare: v.pipe(v.number(), v.minValue(0)), delaySec: v.pipe(v.number(), v.minValue(0)), offline: v.boolean() }),
  v.object({ type: v.literal('autoBuyEgg'), egg: Id, everySec: v.pipe(v.number(), v.minValue(0)), offline: v.boolean() }),
  v.object({ type: v.literal('feedPerTap'), perLevel: Count }),
  v.object({ type: v.literal('queueSize'), perLevel: Count }),
  v.object({ type: v.literal('leaveChance'), perLevel: v.pipe(v.number(), v.minValue(-1), v.maxValue(0)) }),
  v.object({ type: v.literal('appraisal'), perLevel: Share }),
  v.object({ type: v.literal('shelfGrowth'), perLevel: v.pipe(v.number(), v.minValue(0)) }),
  v.object({ type: v.literal('orders') }),
  v.object({ type: v.literal('cuckoo'), everySec: v.pipe(v.number(), v.minValue(1)), fed: Count }),
]);
export const Upgrade = v.object({
  id: Id,
  name: Text,
  levels: Count,
  price1: v.pipe(v.number(), v.minValue(1)),
  priceMax: v.pipe(v.number(), v.minValue(1)),
  currency: v.optional(v.picklist(['coins', 'crystals'])),
  effect: Effect,
  /** When the position appears in the shop (docs/01b, section 5.1: mechanics as a reward); none = from the start. */
  unlock: v.optional(Unlock),
  /** A one-line joke for the shop card (docs/01b, section 4.5). */
  joke: v.optional(Text),
  /** The thing the scene draws once it is bought (docs/01b, section 1.4: every upgrade is seen in the shop). */
  decor: v.optional(v.picklist(DECOR_ITEMS)),
});
export const UpgradesFile = v.object({
  offlineMaxHours: v.pipe(v.number(), v.minValue(0)),
  offlineRate: Share,
  prestige: v.object({ thresholdCoinsEarned: v.pipe(v.number(), v.minValue(1)), incomeBonusPerPrestige: v.pipe(v.number(), v.minValue(0)) }),
  shop: v.pipe(v.array(Id), v.minLength(1)),
  upgrades: v.pipe(v.array(Upgrade), v.minLength(1)),
});

const Positive = v.pipe(v.number(), v.minValue(0));
export const FeelFile = v.object({
  eggTapSquash: Positive,
  eggWobbleDeg: Positive,
  bounceSec: Positive,
  waitPulse: Positive,
  hatchFlySec: Positive,
  hatchBurst: Positive,
  lineSec: v.pipe(v.number(), v.minValue(0.1)),
  feedJump: Positive,
  feedSquash: Positive,
  levelUpBurst: Positive,
  coinsPerSale: Positive,
  coinFlySec: v.pipe(v.number(), v.minValue(0.1)),
  hudRollSec: Positive,
});

export const SFX_NAMES = ['tap', 'eggTap', 'hatch', 'rare', 'levelUp', 'coin', 'buy', 'fail'] as const;
const ZzfxParams = v.pipe(v.array(v.nullable(v.number())), v.minLength(1), v.maxLength(21));
export const AudioFile = v.object({
  volume: Share,
  sfx: v.object(Object.fromEntries(SFX_NAMES.map((k) => [k, ZzfxParams])) as Record<(typeof SFX_NAMES)[number], typeof ZzfxParams>),
});

export const FtueFile = v.object({
  starterEgg: Id,
  starterWaitsForTap: v.boolean(),
  firstRarity: Rarity,
  secondRarity: Rarity,
  firstCustomerSec: v.pipe(v.number(), v.minValue(0)),
  firstOfferShare: Share,
  maxHintWords: Count,
});

const IsoDate = v.pipe(v.string(), v.isoDate());
export const CalendarFile = v.object({
  daily: v.object({ eggId: Id, holdMinutes: Money, priceMultiplier: v.pipe(v.number(), v.minValue(1)) }),
  tasks: v.object({
    perDay: Count,
    pool: v.pipe(v.array(v.object({ id: Id, type: v.picklist(['deals', 'hatch', 'feed', 'earn', 'haggle']), count: Count, name: Text, reward: Reward })), v.minLength(1)),
  }),
  login: v.pipe(v.array(v.object({ day: Count, reward: Reward })), v.minLength(1)),
  events: v.array(v.object({ id: Id, theme: Id, name: Text, from: IsoDate, to: IsoDate, multiplier: v.pipe(v.number(), v.minValue(1)), reward: Reward })),
});

export const STYLE_COLORS = [
  'sky', 'skyLow', 'wall', 'wallShade', 'floor', 'floorLine', 'counter', 'counterTop', 'incubator', 'incubatorGlass', 'egg', 'eggSpots',
  'showcase', 'showcaseSlot', 'queueSpot', 'door', 'doorFrame', 'outline',
  'uiPanel', 'uiPanelAlt', 'uiText', 'uiMuted', 'uiAccent', 'uiAccentText', 'uiGood', 'uiOverlay',
  'rarityCommon', 'rarityRare', 'rarityEpic', 'rarityLegendary', 'blush', 'eyeWhite',
] as const;
/** Creature shapes the scene can draw (src/scene/art.ts); species pick one with two colors in style.json. */
export const CREATURE_SHAPES = ['kettle', 'sock', 'cloudcat', 'lampbug', 'toast', 'frog', 'teacup', 'goldsock', 'pillow', 'cactus', 'shroom', 'donut'] as const;
export const CreatureLook = v.object({ shape: v.picklist(CREATURE_SHAPES), body: Color, accent: Color });
export const StyleFile = v.object({
  art: Id,
  colors: v.object(Object.fromEntries(STYLE_COLORS.map((k) => [k, Color])) as Record<(typeof STYLE_COLORS)[number], typeof Color>),
  scene: v.object({ outlineWidth: v.pipe(v.number(), v.minValue(0)), cornerRadius: v.pipe(v.number(), v.minValue(0)), floorShare: Share }),
  creatures: v.record(Id, CreatureLook),
  customers: v.record(Id, v.object({ body: Color, accent: Color })),
  eggs: v.record(Id, v.object({ shell: Color, spots: Color })),
});

export const I18nFile = v.record(v.string(), NonEmpty);

const Profile = v.object({
  community: v.boolean(),
  ads: v.boolean(),
  payments: v.boolean(),
  analytics: v.boolean(),
  externalRequests: v.boolean(),
  sdk: v.optional(v.string()),
  saveMaxBytes: v.optional(Count),
});
export const GameFile = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]*$/)),
  title: Text,
  age: v.object({ yandex: NonEmpty, youtube: NonEmpty }),
  languages: v.pipe(v.array(v.picklist(LANGS)), v.minLength(1)),
  fallbackLanguage: v.picklist(LANGS),
  ruFallbackLanguages: v.array(NonEmpty),
  orientation: v.picklist(['any', 'portrait', 'landscape']),
  bootBackground: Color,
  metrikaCounterId: v.pipe(v.number(), v.integer(), v.minValue(0)),
  community: v.object({
    telegram: v.pipe(v.string(), v.url(), v.startsWith('https://')),
    vk: v.pipe(v.string(), v.url(), v.startsWith('https://')),
    placement: v.array(v.picklist(['pause', 'settings', 'side'])),
  }),
  profiles: v.object({ yandex: Profile, null: Profile, youtube: Profile }),
});

export type EggsData = v.InferOutput<typeof EggsFile>;
export type ShelfData = v.InferOutput<typeof Shelf>;
export type UnlockData = v.InferOutput<typeof Unlock>;
export type EggData = v.InferOutput<typeof Egg>;
export type SpeciesData = v.InferOutput<typeof SpeciesFile>;
export type SpeciesEntry = v.InferOutput<typeof Species>;
export type CustomersData = v.InferOutput<typeof CustomersFile>;
export type DistrictData = v.InferOutput<typeof District>;
export type UpgradesData = v.InferOutput<typeof UpgradesFile>;
export type UpgradeData = v.InferOutput<typeof Upgrade>;
export type CalendarData = v.InferOutput<typeof CalendarFile>;
export type FtueData = v.InferOutput<typeof FtueFile>;
export type FeelData = v.InferOutput<typeof FeelFile>;
export type AudioData = v.InferOutput<typeof AudioFile>;
export type SfxName = (typeof SFX_NAMES)[number];
export type StyleData = v.InferOutput<typeof StyleFile>;
export type CreatureLookData = v.InferOutput<typeof CreatureLook>;
export type CreatureShape = (typeof CREATURE_SHAPES)[number];
export type I18nData = v.InferOutput<typeof I18nFile>;
export type GameData = v.InferOutput<typeof GameFile>;
export type RarityName = (typeof RARITIES)[number];
export type LangName = (typeof LANGS)[number];
