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
/** A reward: coins, crystals and an egg into «my eggs» (gifts, codes, tasks). */
/** A reward; incomeMin (FB-04): coins worth this many minutes of the player's income (at least coins), so it grows with the shop. */
const Reward = v.object({ coins: v.optional(Money), crystals: v.optional(Money), egg: v.optional(Id), incomeMin: v.optional(v.pipe(v.number(), v.minValue(0))) });

/** Six rarities from grey to red (Q-022 A): one color scale for creatures, upgrade tiers and the price slider. */
export const RARITIES = ['common', 'good', 'valuable', 'premium', 'vip', 'exclusive'] as const;
export const Rarity = v.picklist(RARITIES);
export const LANGS = ['ru', 'en'] as const;
export const EGG_SECTIONS = ['ladder', 'free', 'seasonal', 'reward'] as const;

export const Unlock = v.variant('type', [
  v.object({ type: v.literal('start') }),
  v.object({ type: v.literal('deals'), count: Count }),
  v.object({ type: v.literal('district'), id: Id }),
  v.object({ type: v.literal('milestone'), id: v.pipe(v.string(), v.regex(/^M\d+$/)) }),
  v.object({ type: v.literal('stat'), stat: v.picklist(['deals', 'hatched', 'levelUps', 'haggles']), count: Count }),
  v.object({ type: v.literal('upgrade'), id: Id }),
  /** UB-08: the seller level of reputation.json. */
  v.object({ type: v.literal('level'), n: Count }),
  /** M4-08: the city of the shop (1 + rebirths) — the top of the egg ladder opens city by city. */
  v.object({ type: v.literal('city'), n: Count }),
]);

/** A non-negative multiplier (FB-02: the value table of an egg). */
const Times = v.pipe(v.number(), v.minValue(0));
export const Egg = v.object({
  id: Id,
  name: Text,
  price: v.object({ coins: Money }),
  hatchSec: Money,
  chances: v.object(Object.fromEntries(RARITIES.map((r) => [r, Pct])) as Record<(typeof RARITIES)[number], typeof Pct>),
  unlock: Unlock,
  special: v.optional(v.picklist(['daily'])),
  /** The egg screen section (docs/01 §3 p. 12): the price ladder, free by timer, seasonal, or a reward only (gifts, codes). */
  section: v.picklist(EGG_SECTIONS),
  /** Creatures from this egg are worth this many times more (the ×10 price ladder keeps eggs worth their price). */
  valueMult: v.optional(v.pipe(v.number(), v.minValue(1))),
  /** FB-02: what a creature of each rarity is worth at hatching, in prices of this egg (valuePrice or the egg's price); species of a
   * rarity keep their spread around it. Replaces valueMult when set. */
  value: v.optional(v.object(Object.fromEntries(RARITIES.map((r) => [r, Times])) as Record<(typeof RARITIES)[number], typeof Times>)),
  /** FB-15: this egg's share of the care bonus into VIP and exclusive (care.topShare when missing): full care about doubles them. */
  careTop: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  /** FB-02: the price the value table counts from for a free or reward egg (no coin price of its own). */
  valuePrice: v.optional(v.pipe(v.number(), v.minValue(1))),
  /** FB-02: the price the value table counts from is this many minutes of the player's income (reward eggs grow with the shop). */
  valueIncomeMin: v.optional(v.pipe(v.number(), v.minValue(0))),
  /** A free egg comes back after this many seconds (section free; with M5 also for an ad). */
  freeEverySec: v.optional(v.pipe(v.number(), v.minValue(1))),
  /** The first egg of this kind gives at least this rarity (a good first impression of a dearer egg). */
  firstRarity: v.optional(Rarity),
});
/**
 * Egg care in the incubator (docs/01 §3 p. 12, our improvement 1): warmth from taps, food for coins, ripening past ready.
 * Each part adds a bonus b; b moves that share of every rarity one step up. The shell takes the color of the care level.
 */
export const Care = v.object({
  warm: v.object({ tapsPerStep: Count, steps: Count, bonus: Share }),
  feed: v.object({ steps: Count, bonus: Share, priceShare: Share }),
  /** Ripening: a ready egg left afterSec gives its bonus; after selfSec it hatches by itself (an idle shop keeps going). */
  /** FB-08: selfOpen false — a ready egg always waits for the player's tap (no self, courier or away opening). */
  ripe: v.object({ afterSec: Money, bonus: Share, selfSec: v.pipe(v.number(), v.minValue(1)), helperIdleSec: Money, selfOpen: v.optional(v.boolean(), true) }),
  maxBonus: Share,
  /** FB-05: the share of the bonus that moves into VIP and exclusive (their price is a jump). */
  topShare: Share,
  shell: v.pipe(v.array(Color), v.minLength(2)),
});
/**
 * FB-02: the player's income — coins a minute of live play (sales and the pickup point) over the last windowMin whole minutes, a spike at most spikeMedians median minutes; floorPerMin
 * at the start. A free reward (a gift egg, the anomaly of the day, a gift, a find) is worth at most rewardCapMin minutes of it.
 */
export const Income = v.object({ windowMin: v.pipe(v.number(), v.minValue(1)), spikeMedians: v.pipe(v.number(), v.minValue(1)), floorPerMin: v.pipe(v.number(), v.minValue(1)), rewardCapMin: v.pipe(v.number(), v.minValue(0)) });
export const EggsFile = v.object({ tapSpeedupSec: v.pipe(v.number(), v.minValue(0)), minHatchSec: Money, rescueEgg: Id, care: Care, income: Income, eggs: v.pipe(v.array(Egg), v.minLength(1)) });

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
const PerRarity = v.object(Object.fromEntries(RARITIES.map((r) => [r, Money])) as Record<(typeof RARITIES)[number], typeof Money>);
/** M4-25: marks at hatching — a chance, then one by weight; each changes the price, the feeding and the offers, and tints the creature. */
const Mark = v.object({ id: Id, weight: v.pipe(v.number(), v.minValue(0)), priceMult: v.pipe(v.number(), v.minValue(1)), feedMult: v.pipe(v.number(), v.minValue(1)), offerMult: v.pipe(v.number(), v.minValue(1)), tint: Color });
export const SpeciesFile = v.object({
  tapsPerLevelBase: Count,
  tapGrowth: v.pipe(v.number(), v.minValue(1)),
  shelf: Shelf,
  crystalsPerSale: PerRarity,
  marks: v.object({ note: v.optional(v.string()), chance: Share, list: v.pipe(v.array(Mark), v.minLength(1)) }),
  species: v.pipe(v.array(Species), v.minLength(1)),
});

export const Customer = v.object({
  id: Id,
  name: Text,
  /** Share of the appraisal this type pays on average (the chat offer, UB-05). */
  offer: v.object({ min: v.pipe(v.number(), v.minValue(0)), max: v.pipe(v.number(), v.minValue(0)) }),
  likes: v.picklist(['cheap', 'rare', 'level']),
  rarityBonus: v.optional(Share),
  levelBonusPerLevel: v.optional(Share),
  /** The type name next to a woman's name (ru: «Марфа · Бережливая»). */
  nameF: v.optional(Text),
});
/** weight: share of arrivals among open districts; attract: +weight per creature on the showcase this customer likes. */
export const District = v.object({ id: Id, name: Text, unlock: Unlock, customer: Customer, weight: v.pipe(v.number(), v.minValue(0)), attract: v.pipe(v.number(), v.minValue(0)) });
export const ACCESSORIES = ['none', 'glasses', 'scarf', 'backpack', 'umbrella', 'flower'] as const;
/** Different customers (docs/01b, section 4.3; M2-18): a name, an outfit color, an accessory. */
export const People = v.object({
  names: v.pipe(v.array(v.object({ ru: NonEmpty, en: NonEmpty, f: v.boolean() })), v.minLength(4)),
  outfits: v.pipe(v.array(Color), v.minLength(2)),
  accessories: v.pipe(v.array(v.picklist(ACCESSORIES)), v.minLength(1)),
});
/** Collector orders (docs/01b, section 5.3; M2-19). */
export const Orders = v.object({ minutes: v.pipe(v.number(), v.minValue(0.5)), rewardMult: v.object({ min: v.pipe(v.number(), v.minValue(1)), max: v.pipe(v.number(), v.minValue(1)) }), level: v.object({ min: Count, max: Count }) });
/**
 * Characters (docs/01 §3 p. 13): how a person writes in the chats and on the market.
 * offer — the character's bargaining: its share against the weighted mean of all characters (a troll lowballs, a rich one pays more);
 * give — how far below their price (or above their offer) they still agree.
 */
export const CHAT_CONTEXTS = ['greet', 'offer', 'accept', 'refuse', 'last', 'thanks', 'bye'] as const;
const Lines = v.pipe(v.array(Text), v.minLength(1));
export const Character = v.object({
  id: Id,
  name: Text,
  nameF: v.optional(Text),
  weight: v.pipe(v.number(), v.minValue(0)),
  offer: v.object({ min: Money, max: Money }),
  give: Share,
  /** What the person writes in «Chats» (M3-08), by context; {n} — coins. */
  lines: v.object(Object.fromEntries(CHAT_CONTEXTS.map((k) => [k, Lines])) as Record<(typeof CHAT_CONTEXTS)[number], typeof Lines>),
});
/** FB-06 (Q-040 A): what a seller on the Market says — hello, yes to a bargain, «no discount», a polite no, thanks, bye; {n} — coins. */
export const SELLER_CONTEXTS = ['greet', 'accept', 'noDiscount', 'refuse', 'thanks', 'bye'] as const;
export const SellerLines = v.object(Object.fromEntries(SELLER_CONTEXTS.map((k) => [k, Lines])) as Record<(typeof SELLER_CONTEXTS)[number], typeof Lines>);
/** Hobbies: «How are you?» with a seller who shares it gives a discount (M3-10). */
export const Hobby = v.object({ id: Id, name: Text, line: Text });
export const CustomersFile = v.object({
  /** Buyers writing at once (UB-05: they are the chats and the queue of the scene); the bell adds one. */
  queueSize: Count,
  people: People,
  characters: v.pipe(v.array(Character), v.minLength(1)),
  /**
   * «Chats» (M3-08, UB-05): closed chats kept in the list; holdOnShelf — a creature in a chat leaves its slot (Q-025); firstCounter — the counter price in the first deal;
   * gentleDeals / gentleMinOffer (UB-10) — the first deals never meet a character whose best offer is under this share (no lowball while learning).
   */
  chat: v.object({ keep: Count, holdOnShelf: v.boolean(), firstCounter: v.boolean(), gentleDeals: v.optional(Count, 0), gentleMinOffer: v.optional(v.pipe(v.number(), v.minValue(0)), 0) }),
  hobbies: v.pipe(v.array(Hobby), v.minLength(2)),
  seller: SellerLines,
  orders: Orders,
  districts: v.pipe(v.array(District), v.minLength(1)),
});

/** Things the scene can draw for bought upgrades (src/scene/decor.ts). */
export const DECOR_ITEMS = ['sign', 'register', 'bell', 'mat', 'bowl', 'stool', 'radio', 'clock', 'board', 'tags', 'feeder', 'seller', 'courier', 'point_rent', 'point_repair', 'point_furnish', 'point_clerk', 'point_second', 'point_passive'] as const;

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
  v.object({ type: v.literal('give'), perLevel: Share }),
  v.object({ type: v.literal('appraisal'), perLevel: Share }),
  v.object({ type: v.literal('shelfGrowth'), perLevel: v.pipe(v.number(), v.minValue(0)) }),
  v.object({ type: v.literal('orders') }),
  v.object({ type: v.literal('cuckoo'), everySec: v.pipe(v.number(), v.minValue(1)), fed: Count }),
  /** M4-05: the pickup point pays coins a minute by itself (while playing and away). */
  v.object({ type: v.literal('passive'), perLevel: v.pipe(v.number(), v.minValue(0)) }),
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
  /** M4-05: «point» — a step of the pickup point (the Shop's «Point» section); none — the shop upgrades. */
  group: v.optional(v.picklist(['point'])),
});
export const UpgradesFile = v.object({
  offlineMaxHours: v.pipe(v.number(), v.minValue(0)),
  offlineRate: Share,
  /** FB-03 (Q-039 B): coins away are this share of the income of live play for the same time (min…max), seller levels up at most maxLevels. */
  offlineShare: v.object({ min: Share, max: Share }),
  offlineMaxLevels: v.pipe(v.number(), v.minValue(0)),
  /** Q-027 B (M4-00): while the player is away the shop works on without bought helpers — a slower seller and courier (the first night pays). */
  away: v.object({
    autoSell: v.object({ type: v.literal('autoSell'), priceShare: v.pipe(v.number(), v.minValue(0)), delaySec: v.pipe(v.number(), v.minValue(0)), offline: v.boolean() }),
    autoBuyEgg: v.object({ type: v.literal('autoBuyEgg'), egg: Id, everySec: v.pipe(v.number(), v.minValue(0)), offline: v.boolean() }),
  }),
  /** M4-06, M4-08: the shop moves to a new city — coins earned in this city ≥ threshold × thresholdGrowth^rebirths; income +bonus per rebirth. */
  prestige: v.object({
    thresholdCoinsEarned: v.pipe(v.number(), v.minValue(1)),
    thresholdGrowth: v.pipe(v.number(), v.minValue(1)),
    incomeBonusPerPrestige: v.pipe(v.number(), v.minValue(0)),
    startCoins: v.pipe(v.number(), v.minValue(0)),
    /** M4-09: the new city greets with this egg in «my eggs» (it goes into the incubator once one is free). */
    giftEgg: v.optional(Id),
  }),
  shop: v.pipe(v.array(Id), v.minLength(1)),
  upgrades: v.pipe(v.array(Upgrade), v.minLength(1)),
});

const Positive = v.pipe(v.number(), v.minValue(0));
/** FB-09: the burst of a rarity — sparks, salute bursts, the flash (0..1), a shake in px, the whole screen, its sound. */
export const BurstLevel = v.object({ sparks: v.pipe(v.number(), v.minValue(0)), salutes: v.pipe(v.number(), v.minValue(0)), flash: Share, shake: v.pipe(v.number(), v.minValue(0)), full: v.boolean(), sound: v.optional(v.picklist(['vip', 'exclusive'])) });
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
  /** FB-13: the buzz of a main button, ms (10–20). */
  buzzMs: v.pipe(v.number(), v.minValue(10), v.maxValue(20)),
  /** FB-09: the celebration of a hatch and of any reward from «good» up (common has none); ≤ 1.5 s, a tap skips it. */
  burst: v.object({ sec: v.pipe(v.number(), v.minValue(0.2), v.maxValue(1.5)), good: BurstLevel, valuable: BurstLevel, premium: BurstLevel, vip: BurstLevel, exclusive: BurstLevel }),
  /** The hatch show (M3-05): seconds the portraits run before the result, 4–5. */
  hatchShowSec: v.pipe(v.number(), v.minValue(0.5), v.maxValue(8)),
  /** Круг правок FB п. 1: the hatch result's buttons take a press this long after it shows (a double tap of the skip never chooses), ≥ 0.5 s. */
  hatchLockSec: v.pipe(v.number(), v.minValue(0.5), v.maxValue(1.5)),
});

export const SFX_NAMES = ['tap', 'eggTap', 'hatch', 'rare', 'levelUp', 'coin', 'buy', 'fail', 'vip', 'exclusive', 'press', 'upgrade'] as const;
const ZzfxParams = v.pipe(v.array(v.nullable(v.number())), v.minLength(1), v.maxLength(21));
export const AudioFile = v.object({
  volume: Share,
  sfx: v.object(Object.fromEntries(SFX_NAMES.map((k) => [k, ZzfxParams])) as Record<(typeof SFX_NAMES)[number], typeof ZzfxParams>),
});

export const FtueFile = v.object({
  starterEgg: Id,
  starterWaitsForTap: v.boolean(),
  /** UB-03: the very first egg opens with one tap (no timer): the case show runs at once. */
  firstEggOneTap: v.boolean(),
  firstRarity: Rarity,
  secondRarity: Rarity,
  firstCustomerSec: v.pipe(v.number(), v.minValue(0)),
  firstOfferShare: Share,
  /** M4-09: after the first minute, an empty shelf with pets in the inventory brings back «List it» once the player is idle this long. */
  shelfHintSec: v.pipe(v.number(), v.minValue(1)),
  /** FB-08: the finger taps a ready egg for this many hatches after the first minute. */
  fingerHatches: v.optional(Count, 3),
  maxHintWords: Count,
});

const IsoDate = v.pipe(v.string(), v.isoDate());
export const CalendarFile = v.object({
  daily: v.object({ eggId: Id, holdMinutes: Money, priceMultiplier: v.pipe(v.number(), v.minValue(1)), rarities: v.pipe(v.array(Rarity), v.minLength(1)) }),
  /** FB-04: the bonus for coming back on a new day (once a day, not on the first). */
  returnBonus: v.optional(Reward),
  tasks: v.object({
    perDay: Count,
    pool: v.pipe(v.array(v.object({ id: Id, type: v.picklist(['deals', 'hatch', 'feed', 'earn', 'haggle']), count: Count, name: Text, reward: Reward })), v.minLength(1)),
  }),
  events: v.array(v.object({ id: Id, theme: Id, name: Text, from: IsoDate, to: IsoDate, multiplier: v.pipe(v.number(), v.minValue(1)), reward: Reward })),
});

export const STYLE_COLORS = [
  'sky', 'skyLow', 'wall', 'wallShade', 'floor', 'floorLine', 'counter', 'counterTop', 'incubator', 'incubatorGlass', 'egg', 'eggSpots',
  'showcase', 'showcaseSlot', 'queueSpot', 'door', 'doorFrame', 'outline',
  'uiPanel', 'uiPanelAlt', 'uiText', 'uiMuted', 'uiAccent', 'uiAccentText', 'uiGood', 'uiOverlay', 'uiBg', 'uiPanelHi', 'uiBad', 'rarityEdge',
  'rarityCommon', 'rarityRare', 'rarityEpic', 'rarityLegendary', 'blush', 'eyeWhite',
] as const;
/** Creature shapes the scene can draw (src/scene/art.ts); species pick one with two colors in style.json. */
export const CREATURE_SHAPES = ['kettle', 'sock', 'cloudcat', 'lampbug', 'toast', 'frog', 'teacup', 'goldsock', 'pillow', 'cactus', 'shroom', 'donut'] as const;
export const CreatureLook = v.object({ shape: v.picklist(CREATURE_SHAPES), body: Color, accent: Color });
export const StyleFile = v.object({
  art: Id,
  colors: v.object(Object.fromEntries(STYLE_COLORS.map((k) => [k, Color])) as Record<(typeof STYLE_COLORS)[number], typeof Color>),
  scene: v.object({ outlineWidth: v.pipe(v.number(), v.minValue(0)), cornerRadius: v.pipe(v.number(), v.minValue(0)), floorShare: Share, stripFloorShare: v.optional(Share) }),
  creatures: v.record(Id, CreatureLook),
  /** M4-09: every new city has its own walls and floor (city 2, 3, … in turn; the first city keeps colors). */
  cities: v.optional(v.array(v.object({ wall: Color, wallShade: Color, floor: Color, floorLine: Color }))),
  customers: v.record(Id, v.object({ body: Color, accent: Color })),
  eggs: v.record(Id, v.object({ shell: Color, spots: Color })),
  /** Rarity colors from grey to red (Q-022): a dash or a dot under a creature or an upgrade, never a fill or colored text. */
  rarity: v.object(Object.fromEntries(RARITIES.map((r) => [r, Color])) as Record<(typeof RARITIES)[number], typeof Color>),
  /** MU-06: the price slider zones from «Fast» (green) to «Max» (red), as many as market.json slider.delay. */
  priceZones: v.pipe(v.array(Color), v.minLength(2)),
});

/** The market (docs/01 §3 p. 14): lots from sellers, refreshed by a timer; price — a share of the market value. */
export const MarketFile = v.object({
  refreshSec: v.object({ min: Money, max: Money }),
  lots: Count,
  /** M4-00: at most this many lots of one species on the market. */
  perSpecies: Count,
  /** M4-23: the mood of the market — one species «in fashion» (×hot), one «fed up with» (×cold), by the day and the save. */
  mood: v.object({ hot: v.pipe(v.number(), v.minValue(1)), cold: v.pipe(v.number(), v.minValue(0.1), v.maxValue(1)) }),
  price: v.object({ min: Money, max: Money }),
  /** Share of lots priced below the market (a deal to find). */
  goodShare: Share,
  level: v.object({ min: Count, max: Count }),
  hobbyDiscount: v.object({ min: Share, max: Share }),
  /** The lowest «Discount? I'll take it for…» on the slider, as a share of the asking price. */
  bargainFloor: Share,
  /** A creature's price range as shares of its appraisal: low — «sell now», high — «above the market». */
  range: v.object({ low: Share, high: v.pipe(v.number(), v.minValue(1)) }),
  /** The price slider (M3-06, MU-06): from min to max of the appraisal in equal zones (four by docs/07); delay — how much slower a buyer writes in each zone. */
  slider: v.object({ min: Share, max: v.pipe(v.number(), v.minValue(1)), delay: v.pipe(v.array(v.pipe(v.number(), v.minValue(0.1))), v.minLength(2)), agree: v.optional(v.array(Share)) }),
  /** Seconds before a buyer writes about a creature at the market price (docs/01 §3 p. 13: 8–15 s). */
  replySec: v.object({ min: Money, max: Money }),
});
/** Gifts (docs/01 §3 p. 15): an egg for following a community (once each), for a review, and seven days of growing rewards. */
export const GiftsFile = v.object({
  subscribe: v.pipe(v.array(v.object({ id: v.picklist(['vk', 'telegram']), reward: Reward })), v.minLength(1)),
  review: v.object({ reward: Reward }),
  daily: v.pipe(v.array(v.object({ day: Count, reward: Reward })), v.length(7)),
});
/** Promo codes (docs/01 §3 p. 15; M3-13): in-game rewards only, each code once per player. */
export const CodesFile = v.object({ codes: v.pipe(v.array(v.object({ code: v.pipe(v.string(), v.regex(/^[A-Z0-9]{3,16}$/, 'code: 3–16 capital letters or digits')), reward: Reward })), v.minLength(1)) });
/** UB-08: the shop's reputation — the seller level grows with deals and opens eggs, districts and upgrades (unlock {type: level}). */
export const ReputationFile = v.object({
  perDeal: Count,
  rarityBonus: PerRarity,
  levels: v.pipe(v.array(v.pipe(v.number(), v.minValue(0))), v.minLength(2)),
  titles: v.pipe(v.array(v.object({ from: Count, name: Text })), v.minLength(1)),
  future: v.array(v.object({ level: Count, id: Id, name: Text })),
});
/** M4-05, Q-019: the guest zone of the pickup point — decorations with a bargain bonus and an upkeep a minute; a full theme adds more. */
export const GUEST_ITEMS = ['rug', 'plant', 'poster', 'bench', 'floorlamp', 'aquarium'] as const;
export const DecorFile = v.object({
  unlock: Unlock,
  items: v.pipe(
    v.array(v.object({ id: v.picklist(GUEST_ITEMS), name: Text, price: v.pipe(v.number(), v.minValue(1)), bargain: Share, upkeep: v.pipe(v.number(), v.minValue(0)), theme: Id })),
    v.minLength(1),
  ),
  sets: v.array(v.object({ theme: Id, name: Text, bonus: Share })),
});
/** M4-20: finds (achievements) — 30, 10 hidden; a reward once; the condition reads the save (docs/01b §5.5). */
const FindWhen = v.variant('type', [
  v.object({ type: v.literal('stat'), stat: v.picklist(['dealsAll', 'hatched', 'levelUps', 'haggles', 'coinsEarned']), n: Count }),
  v.object({ type: v.literal('level'), n: Count }),
  v.object({ type: v.literal('city'), n: Count }),
  v.object({ type: v.literal('collected'), n: v.pipe(v.number(), v.integer(), v.minValue(0)) }),
  v.object({ type: v.literal('rows'), n: Count }),
  v.object({ type: v.literal('upgrades'), n: Count }),
  v.object({ type: v.literal('guest'), n: Count }),
  v.object({ type: v.literal('flag'), id: Id }),
]);
export const AchievementsFile = v.object({
  items: v.pipe(
    v.array(v.object({ id: Id, name: Text, desc: Text, hidden: v.boolean(), reward: v.object({ coins: v.optional(Count), crystals: v.optional(Count) }), when: FindWhen })),
    v.minLength(1),
  ),
});
/** M4-01: the collection by rarity — a full row gives crystals once and a price bonus for that rarity for good. */
export const CollectionFile = v.object({ rowBonus: PerRarity, rowCrystals: PerRarity });
/** Q-027 B: a live player's interface time for the balance model (scripts/balance-model.ts): the result, tabs, chats, cards. */
const UiSec = v.pipe(v.number(), v.minValue(0), v.maxValue(10));
export const PaceFile = v.object({ resultSec: UiSec, tabSec: UiSec, chatSec: UiSec, cardSec: UiSec, closeSec: UiSec });
/** M4-00, Q-026 B: tabs open step by step (first hatch, first buyer, seller level, the first affordable upgrade); the Shop sections. */
const TabUnlock = v.variant('type', [
  v.object({ type: v.literal('always') }),
  v.object({ type: v.literal('hatched') }),
  v.object({ type: v.literal('chat') }),
  v.object({ type: v.literal('level'), n: Count }),
  v.object({ type: v.literal('upgrade'), n: Count }),
  v.object({ type: v.literal('hidden') }),
]);
export const NavFile = v.object({
  tabs: v.object({ market: TabUnlock, inventory: TabUnlock, sales: TabUnlock, home: TabUnlock, eggs: TabUnlock, chats: TabUnlock, shop: TabUnlock, season: TabUnlock }),
  shop: v.object({ sections: v.pipe(v.array(v.object({ id: Id, enabled: v.boolean() })), v.minLength(1)) }),
  /** FB-10: the Store's upgrades under the room of «Лавка» (false: the «Витрина» row and the scene buttons, as in MU). */
  homeShop: v.optional(v.boolean(), false),
});
/** M5-02, M5-03: rewarded ads (one module, a common gap, egg ads per day) and the interstitial gate (content/ads.json). */
export const AdsFile = v.object({
  rewarded: v.object({
    gapSec: v.pipe(v.number(), v.minValue(0)),
    lateMs: v.pipe(v.number(), v.minValue(0)),
    /** A longer gap for one place (×2 deal: no farming deals with videos). */
    placementGapSec: v.optional(v.record(Id, v.pipe(v.number(), v.minValue(0)))),
  }),
  eggs: v.object({
    perDay: Count,
    gapSec: v.pipe(v.number(), v.minValue(0)),
    cards: v.pipe(v.array(v.object({ id: Id, egg: Id })), v.minLength(1)),
  }),
  hatch: v.object({ minLeftSec: v.pipe(v.number(), v.minValue(0)) }),
  boost: v.object({ mult: v.pipe(v.number(), v.minValue(1), v.maxValue(2)), sec: v.pipe(v.number(), v.minValue(1)) }),
  interstitial: v.object({
    firstSec: v.pipe(v.number(), v.minValue(0)),
    gapSec: v.pipe(v.number(), v.minValue(0)),
    afterRewardedSec: v.pipe(v.number(), v.minValue(0)),
    seriesTaps: Count,
    seriesSec: v.pipe(v.number(), v.minValue(0)),
  }),
});
const ShopGive = v.object({
  coinsMin: v.optional(v.pipe(v.number(), v.minValue(0))),
  eggs: v.optional(v.record(Id, Count)),
  crystals: v.optional(v.pipe(v.number(), v.minValue(0))),
});
const ShopItem = v.object({ id: Id, product: Id, price: v.pipe(v.number(), v.minValue(1)), hours: v.optional(v.pipe(v.number(), v.minValue(1))), give: ShopGive });
/** M5-04, M5-05: the Store deals, coin packs and «no ads» (content/shop.json), behind the payments flag of the profile. */
export const ShopFile = v.object({
  firstSec: v.pipe(v.number(), v.minValue(0)),
  deals: v.pipe(v.array(ShopItem), v.minLength(1)),
  coins: v.pipe(v.array(ShopItem), v.minLength(1)),
  noAds: v.object({ product: Id, price: v.pipe(v.number(), v.minValue(1)) }),
});
/** Side job (docs/01 §3 p. 15): tapping the bowl feeds the neighbours' pets for coins; the job levels up on a ×growth ladder. */
export const WorkFile = v.object({
  coinsPerTap: v.pipe(v.number(), v.minValue(1)),
  incomeGrowth: v.pipe(v.number(), v.minValue(1)),
  price1: v.pipe(v.number(), v.minValue(1)),
  priceGrowth: v.pipe(v.number(), v.minValue(1)),
  levels: Count,
});

/** Random events (docs/01b, section 3; M2-15): one at a time, only a plus; the kind picks the behaviour in src/sim/game.ts. */
const EventBase = { id: Id, weight: v.pipe(v.number(), v.minValue(0)), fromMin: v.pipe(v.number(), v.minValue(0)), durationSec: v.pipe(v.number(), v.minValue(1)) };
const IntRange = v.object({ min: Count, max: Count });
export const RandomEvent = v.variant('kind', [
  v.object({ ...EventBase, kind: v.literal('golden'), priceMult: v.pipe(v.number(), v.minValue(1)) }),
  v.object({ ...EventBase, kind: v.literal('sneeze'), coins: IntRange, coinValue: IntRange, saleShare: Share }),
  v.object({ ...EventBase, kind: v.literal('doorEgg') }),
  v.object({ ...EventBase, kind: v.literal('merchant'), discount: Share, mysteryPriceOf: Id, mysteryEgg: Id }),
  // M4-21 (docs/01b §3): events 5–12; needs — a species that has to be on the shelf for the event to come.
  v.object({ ...EventBase, kind: v.literal('excursion'), writeMult: Share, offerShare: Share }),
  v.object({ ...EventBase, kind: v.literal('inspector'), perCreature: Count }),
  v.object({ ...EventBase, kind: v.literal('photo'), share: Share }),
  v.object({ ...EventBase, kind: v.literal('pie'), coins: IntRange }),
  v.object({ ...EventBase, kind: v.literal('twins') }),
  v.object({ ...EventBase, kind: v.literal('kettle'), needs: Id, fedTaps: Count }),
  v.object({ ...EventBase, kind: v.literal('blink'), needs: Id, coinsPerLevel: Count }),
  v.object({ ...EventBase, kind: v.literal('catWalk'), needs: Id, coins: IntRange, crystalChance: Share }),
]);
const SecRange = v.object({ min: v.pipe(v.number(), v.minValue(1)), max: v.pipe(v.number(), v.minValue(1)) });
export const EventsFile = v.object({ firstAfterSec: SecRange, everySec: SecRange, events: v.pipe(v.array(RandomEvent), v.minLength(1)) });

/** Easter eggs on taps (docs/01b, section 2; M2-16): a reply to every tap, a secret on a counter. */
export const SECRET_TARGETS = ['sign', 'door', 'lamp'] as const;
export const SecretsFile = v.object({
  streakSec: v.pipe(v.number(), v.minValue(0.1)),
  secrets: v.pipe(
    v.array(
      v.object({
        id: Id,
        target: v.picklist(SECRET_TARGETS),
        first: Id,
        steps: v.pipe(v.array(v.object({ at: Count, streak: v.optional(v.boolean()), show: Id, coins: Money })), v.minLength(1)),
      }),
    ),
    v.minLength(1),
  ),
});

/** Creature and customer lines by context (docs/01b, sections 4.1–4.2; M2-17). */
export const CREATURE_CONTEXTS = ['tap', 'hungry', 'levelUp', 'max', 'sold'] as const;
export const CUSTOMER_CONTEXTS = ['arrive', 'offer', 'haggleUp', 'leave', 'rare', 'notTheirs'] as const;
const LinePool = v.pipe(v.array(v.object({ ru: NonEmpty, en: NonEmpty })), v.minLength(2));
export const LinesFile = v.object({
  noRepeat: v.pipe(v.number(), v.integer(), v.minValue(0)),
  maxWords: Count,
  tapCooldownSec: v.pipe(v.number(), v.minValue(0)),
  hungrySec: v.pipe(v.number(), v.minValue(1)),
  creatures: v.record(Id, v.object(Object.fromEntries(CREATURE_CONTEXTS.map((k) => [k, LinePool])) as Record<(typeof CREATURE_CONTEXTS)[number], typeof LinePool>)),
  customers: v.record(Id, v.object(Object.fromEntries(CUSTOMER_CONTEXTS.map((k) => [k, LinePool])) as Record<(typeof CUSTOMER_CONTEXTS)[number], typeof LinePool>)),
});

/** News ticker (docs/01b, section 4.4; M2-14): a line shows when its condition holds. */
export const NewsWhen = v.variant('type', [
  v.object({ type: v.literal('always') }),
  v.object({ type: v.literal('deals'), min: Count }),
  v.object({ type: v.literal('species'), id: Id }),
  v.object({ type: v.literal('upgrade'), id: Id }),
  v.object({ type: v.literal('hours'), from: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23)), to: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24)) }),
  v.object({ type: v.literal('coins'), min: Count }),
  v.object({ type: v.literal('district'), id: Id }),
  v.object({ type: v.literal('idle'), sec: Count }),
  v.object({ type: v.literal('event'), id: Id }),
]);
export const NewsFile = v.object({
  /** Seconds a line stays before the ticker hides again (M3-18). */
  showSec: v.optional(v.pipe(v.number(), v.minValue(1))),
  everySec: v.object({ min: v.pipe(v.number(), v.minValue(1)), max: v.pipe(v.number(), v.minValue(1)) }),
  noRepeat: v.pipe(v.number(), v.integer(), v.minValue(0)),
  specificWeight: v.pipe(v.number(), v.minValue(1)),
  lines: v.pipe(v.array(v.object({ when: NewsWhen, ru: NonEmpty, en: NonEmpty })), v.minLength(1)),
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
export type ReputationData = v.InferOutput<typeof ReputationFile>;
export type EggData = v.InferOutput<typeof Egg>;
export type SpeciesData = v.InferOutput<typeof SpeciesFile>;
export type SpeciesEntry = v.InferOutput<typeof Species>;
export type CustomersData = v.InferOutput<typeof CustomersFile>;
export type DistrictData = v.InferOutput<typeof District>;
export type UpgradesData = v.InferOutput<typeof UpgradesFile>;
export type UpgradeData = v.InferOutput<typeof Upgrade>;
export type CalendarData = v.InferOutput<typeof CalendarFile>;
export type CareData = v.InferOutput<typeof Care>;
export type EggSection = (typeof EGG_SECTIONS)[number];
export type CharacterData = v.InferOutput<typeof Character>;
export type ChatContext = (typeof CHAT_CONTEXTS)[number];
export type HobbyData = v.InferOutput<typeof Hobby>;
export type MarketData = v.InferOutput<typeof MarketFile>;
export type GiftsData = v.InferOutput<typeof GiftsFile>;
export type WorkData = v.InferOutput<typeof WorkFile>;
export type AdsData = v.InferOutput<typeof AdsFile>;
export type ShopData = v.InferOutput<typeof ShopFile>;
export type NavData = v.InferOutput<typeof NavFile>;
export type PaceData = v.InferOutput<typeof PaceFile>;
export type CollectionData = v.InferOutput<typeof CollectionFile>;
export type DecorData = v.InferOutput<typeof DecorFile>;
export type AchievementsData = v.InferOutput<typeof AchievementsFile>;
export type TabUnlockData = v.InferOutput<typeof TabUnlock>;
export type CodesData = v.InferOutput<typeof CodesFile>;
export type SellerLinesData = v.InferOutput<typeof SellerLines>;
export type BurstLevelData = v.InferOutput<typeof BurstLevel>;
export type RewardData = v.InferOutput<typeof Reward>;
export type FtueData = v.InferOutput<typeof FtueFile>;
export type FeelData = v.InferOutput<typeof FeelFile>;
export type AudioData = v.InferOutput<typeof AudioFile>;
export type SfxName = (typeof SFX_NAMES)[number];
export type StyleData = v.InferOutput<typeof StyleFile>;
export type CreatureLookData = v.InferOutput<typeof CreatureLook>;
export type CreatureShape = (typeof CREATURE_SHAPES)[number];
export type I18nData = v.InferOutput<typeof I18nFile>;
export type NewsData = v.InferOutput<typeof NewsFile>;
export type EventsData = v.InferOutput<typeof EventsFile>;
export type SecretsData = v.InferOutput<typeof SecretsFile>;
export type LinesData = v.InferOutput<typeof LinesFile>;
export type CreatureContext = (typeof CREATURE_CONTEXTS)[number];
export type CustomerContext = (typeof CUSTOMER_CONTEXTS)[number];
export type SecretTarget = (typeof SECRET_TARGETS)[number];
export type RandomEventData = v.InferOutput<typeof RandomEvent>;
export type NewsWhenData = v.InferOutput<typeof NewsWhen>;
export type GameData = v.InferOutput<typeof GameFile>;
export type RarityName = (typeof RARITIES)[number];
export type LangName = (typeof LANGS)[number];
