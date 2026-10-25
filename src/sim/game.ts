// What: the game itself (docs/01, sections 2–4): player commands (buyEgg, tapIncubator, ...) and the fixed-step tick over the store.
// Called by: src/main.ts (one game per page, tick from the runtime), src/test-api, scripts/balance-model.ts and tests (headless).
// Keep: commands change store.state and commit; flush on hatch, deal, purchase; content and rng come in, so Node runs it without a bundler.

import type { AdsData, AchievementsData, CalendarData, CodesData, CollectionData, DecorData, ReputationData, CustomersData, DistrictData, EggData, EggSection, EggsData, GiftsData, MarketData, RewardData, WorkData, EventsData, FtueData, RarityName, SecretsData, SecretTarget, SpeciesData, UpgradeData, UpgradesData } from '../content/schemas.ts';
import { RARITIES } from '../content/schemas.ts';
import { createEmitter, type Emitter } from '../core/events.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { emptyIncubator, type Chat, type Creature, type Incubator, type Lot, type Order, type SaveData } from './state.ts';
import type { GameStore } from './store.ts';
import { careBonus, careChances, careLevel, cityMult, coins, dayHash, marketMood, nameBlocked, normalWord, pickWeighted, priceRange, rebirthNeed, priceZone, replyDelay, repLevel, workPay, workPrice, creatureValue, eggUnlocked, hatchMult, hatchNeedSec, hatchShare, incomeOf, isHatched, offerFor, pickRarity, pickSpecies, shelfBonus, tapsForLevel, unlockMet, upgradePrice, type UnlockFacts } from './rules.ts';

export interface GameContent {
  eggs: EggsData;
  species: SpeciesData;
  customers: CustomersData;
  upgrades: UpgradesData;
  ftue: FtueData;
  events: EventsData;
  secrets: SecretsData;
  market: MarketData;
  gifts: GiftsData;
  work: WorkData;
  codes: CodesData;
  reputation: ReputationData;
  collection: CollectionData;
  decor: DecorData;
  achievements: AchievementsData;
  calendar: CalendarData;
  /** M5-02: rewarded ads (content/ads.json); missing — no ad rewards (tests built before M5). */
  ads?: AdsData;
}

/** Step of the offline catch-up: coarse but finer than every helper timer (feeder 1 s, courier 2 s, seller 4 s). */
const OFFLINE_STEP_SEC = 0.5;

/** Customer type id of the golden event customer (style.json → customers.golden, i18n customer.golden). */
export const GOLDEN = 'golden';

const RARITIES_ALL = RARITIES;

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i])) as Record<RarityName, number>;

export type EventKind = EventsData['events'][number]['kind'];

/** The random event on now (docs/01b, section 3): what the scene shows and what a tap does. */
export interface EventView {
  id: string;
  kind: EventKind;
  /** Seconds left before it goes (nothing is lost). */
  left: number;
  /** Sneeze: coins to tap, positions 0..1 inside the free floor. */
  coins: Array<{ id: number; x: number; y: number }>;
  /** Sneeze: who sneezed. */
  uid: string | null;
  /** Door egg: the egg in the basket. */
  egg: string | null;
}

export interface MerchantOffer {
  discount: { egg: string; price: number; check: BuyCheck };
  mystery: { egg: string; price: number; check: BuyCheck };
}

/** Who fed a creature: the player's tap, the feeder helper, the cuckoo clock. */
export type FeedBy = 'tap' | 'helper' | 'cuckoo' | 'chime';

/** What the helpers did while the player was away (docs/01a, section 5: up to 8 hours at offlineRate of the live pace). */
export interface OfflineReport {
  /** Real seconds away (clamped) and the game seconds the shop worked for them. */
  awaySec: number;
  /** FB-15: the real time away (awaySec is it clamped to offlineMaxHours). */
  realSec?: number;
  workedSec: number;
  coins: number;
  sold: number;
  hatched: number;
  levelUps: number;
}

export type DenyReason = 'coins' | 'busy' | 'full' | 'locked' | 'noCreature' | 'max';

export interface GuestZoneView {
  open: boolean;
  bonus: number;
  upkeep: number;
  unpaid: boolean;
  items: Array<{ id: string; owned: boolean; price: number; bargain: number; upkeep: number; theme: string; affordable: boolean }>;
  sets: Array<{ theme: string; done: boolean; bonus: number }>;
}

export type CollectionStatus = 'none' | 'shop' | 'sold';
export interface CollectionView {
  have: number;
  all: number;
  rows: Array<{ rarity: RarityName; have: number; all: number; done: boolean; bonus: number; crystals: number; species: Array<{ id: string; status: CollectionStatus }> }>;
}

export interface RebirthView {
  /** The city the shop is in: 1 + moves. */
  city: number;
  have: number;
  need: number;
  ready: boolean;
  mult: number;
  nextMult: number;
  /** M4-09: what the new city greets with — coins to start and a gift egg ('' when none). */
  startCoins: number;
  giftEgg: string;
}

export type GameEvent =
  | { type: 'rebirth'; city: number; gift?: string }
  | { type: 'rowDone'; rarity: RarityName; crystals: number; bonus: number }
  | { type: 'guestUnpaid' }
  | { type: 'find'; id: string; coins: number; crystals: number }
  | { type: 'twins'; species: string }
  | { type: 'findClaimed'; id: string; coins: number; crystals: number }
  | { type: 'guestBought'; id: string }
  | { type: 'eggBought'; incubator: number; egg: string; price: number; by: 'player' | 'helper' | 'gift' | 'merchant' }
  | { type: 'eggTap'; incubator: number; started: boolean }
  | { type: 'eggReady'; incubator: number }
  | { type: 'eggFed'; incubator: number; price: number; level: number }
  | { type: 'eggsStored'; egg: string; count: number }
  | { type: 'freeEgg'; egg: string }
  | { type: 'hatched'; incubator: number; uid: string; species: string; rarity: RarityName; by: 'tap' | 'self'; egg: string }
  | { type: 'chatNew'; id: number }
  | { type: 'work'; coins: number }
  | { type: 'workUp'; level: number }
  | { type: 'gift'; from: 'subscribe' | 'review' | 'daily' | 'code' | 'return'; reward: RewardData }
  | { type: 'lotBought'; id: number; uid: string; price: number }
  | { type: 'marketNew' }
  | { type: 'chatReply'; id: number; ctx: string }
  | { type: 'fed'; uid: string; level: number; levelUp: boolean; maxed: boolean; price: number; gain: number; by: FeedBy }
  | { type: 'customerArrived'; id: number; customer: string }
  | { type: 'customerLeft'; id: number; reason: 'sold' | 'wait' }
  | { type: 'denied'; action: 'buyEgg' | 'list' | 'upgrade' | 'rebirth'; reason: DenyReason }
  | { type: 'upgradeBought'; id: string; level: number; price: number }
  | { type: 'ftueDone' }
  | { type: 'eggUnlocked'; egg: string }
  | { type: 'districtOpened'; district: string; customer: string }
  | { type: 'firstCrystal' }
  | { type: 'cuckoo' }
  /** M6-20: 10 quick taps on one creature — it laughs and jumps; coins once per tickle. */
  | { type: 'tickle'; uid: string; coins: number }
  /** M6-20: the clock struck noon or midnight (the device's time): every creature got fed. */
  | { type: 'chime'; hour: number; fed: number }
  /** M6-23: the shop got its name (secret — one of the secret names). */
  | { type: 'shopNamed'; name: string; secret: boolean }
  | { type: 'eventStarted'; id: string; kind: EventKind; uid?: string | undefined }
  | { type: 'eventEnded'; id: string; kind: EventKind; outcome: 'done' | 'missed' }
  | { type: 'eventCoin'; id: number; value: number }
  | { type: 'eventGift'; coins: number; crystals?: number }
  | { type: 'merchantOpen' }
  | { type: 'orderNew'; species: string; level: number; reward: number }
  | { type: 'orderDone'; species: string; reward: number }
  | { type: 'orderExpired'; species: string }
  | { type: 'thingTapped'; target: SecretTarget; first: string; count: number }
  | { type: 'secret'; id: string; target: SecretTarget; show: string; coins: number; repeat: boolean }
  | { type: 'upgradeUnlocked'; id: string }
  /** UB-08: the seller level went up (reputation.json). */
  | { type: 'repUp'; level: number }
  | { type: 'rescueEgg'; incubator: number }
  /** Every deal (UB-05, one path): a chat answered by the player or the seller helper, or «sell now» (customer 'now', customerId 0). */
  | { type: 'sold'; uid: string; species: string; rarity: RarityName; price: number; crystals: number; customer: string; customerId: number; haggled: boolean; by: 'player' | 'helper' | 'now'; liked: boolean }
  | { type: 'change' };

export interface IncubatorView {
  egg: string | null;
  waiting: boolean;
  /** 0..1 of hatching done. */
  share: number;
  /** Hatched and waiting for a tap (ripening, docs/01 §3 p. 12). */
  ready: boolean;
  /** Care bonus b and its shell color step (0 — the egg's own color). */
  care: number;
  careLevel: number;
  /** The next portion of food: its price, or null when the egg has had all its food. */
  feedPrice: number | null;
  /** M5-02: game seconds of hatching left (0 — ready). */
  leftSec: number;
}

/** M5-02: an egg-ad card of «Мои яйца»: the egg it gives, ads left today (both cards together), game seconds to wait. */
export interface AdEggView {
  id: string;
  egg: string;
  left: number;
  waitSec: number;
}

/** M5-05: what a purchase gives (shop.json give): coins in minutes of income, eggs, crystals. */
export interface PackGive {
  coinsMin?: number | undefined;
  eggs?: Record<string, number> | undefined;
  crystals?: number | undefined;
}

export interface CreatureView {
  uid: string;
  species: string;
  rarity: RarityName;
  level: number;
  maxLevel: number;
  /** Appraisal in whole coins at the current level. */
  price: number;
  /** The price range (M3-05): low — «sell now», high — the top of «above the market». */
  low: number;
  high: number;
  /** The asking price on the slider (M3-06): coins, share of the appraisal and its zone 0…5. */
  ask: number;
  askShare: number;
  zone: number;
  /** Feeding taps done toward the next level and taps it needs. */
  fed: number;
  need: number;
  /** M4-07: whole minutes the anomaly of the day still settles in (0 = free to sell). */
  hold: number;
  /** M4-25: the mark id and its scene tint ('' when none). */
  mark: string;
  tint: string;
}

/** M4-07: the anomaly of the day and the goals of the day (calendar.json) for a device date. */
export interface DayView {
  species: string;
  rarity: RarityName;
  egg: string;
  eggTaken: boolean;
  mult: number;
  holdMin: number;
  goals: Array<{ id: string; have: number; need: number; done: boolean; claimed: boolean; reward: RewardData }>;
}

/** A buyer of the scene queue (UB-05): the person of an open chat, oldest first; id is the chat id. */
export interface CustomerView {
  id: number;
  /** Customer type id from customers.json (thrifty, collector, rich; golden for the event customer). */
  customer: string;
  /** Index into customers.json → people.names (−1: the golden customer has no name), outfit color, accessory (M2-18). */
  person: number;
  outfit: string;
  accessory: string;
  /** The creature the chat is about and the buyer's offer now. */
  uid: string;
  offer: number;
}

export interface GameView {
  /** M4-09: the city the shop is in (1 + moves): the scene draws its own walls and floor. */
  city: number;
  incubators: IncubatorView[];
  queue: CustomerView[];
  /** The creatures on sale: the showcase of the shop = the slots of «My sales» (M3-07), in slot order. */
  creatures: CreatureView[];
  /** The creatures kept off sale (the inventory, M3-07). */
  inventory: CreatureView[];
  /** The creatures a buyer is writing about (Q-025: off the shelf while the chat is open). */
  talking: CreatureView[];
  /** The creature the player works with (last tapped). */
  selected: string | null;
  /** Showcase places (upgrades included). */
  slots: number;
  /** Buyers writing at once = places in the scene queue (the bell adds one). */
  queueSize: number;
  /** The random event on now, or null. */
  event: EventView | null;
  /** The collector's order on the board (M2-19), or null without the board. */
  order: Order | null;
  /** Bought things the scene draws, by decor item: level bought. */
  decor: Record<string, number>;
}

export interface UpgradeView {
  id: string;
  /** Levels bought so far and the most there are. */
  level: number;
  levels: number;
  /** Price of the next level; 0 when maxed. */
  price: number;
  affordable: boolean;
  maxed: boolean;
  /** Opened since the player last looked at the shop («New!»). */
  fresh: boolean;
}

/** The nearest goal not reached yet (docs/01b, section 5.2): the «Next» card shows exactly one. */
export interface GoalView {
  kind: 'upgrade' | 'district' | 'egg' | 'level' | 'rebirth';
  id: string;
  /** Progress: have of need, in coins, crystals or deals. */
  have: number;
  need: number;
  unit: 'coins' | 'crystals' | 'deals' | 'xp';
}

/** UB-08: the seller level — points, the level's threshold and the next one (null at the top). */
export interface ReputationView {
  level: number;
  xp: number;
  base: number;
  next: number | null;
}

/** A market lot with its market value and the verdict «below / at / above the market» (M3-09). */
export interface LotView extends Lot {
  rarity: RarityName;
  value: number;
  verdict: 'below' | 'market' | 'above';
}

/** One egg on the egg screen (M3-04). */
export interface EggCardView {
  id: string;
  section: EggSection;
  price: number;
  open: boolean;
  affordable: boolean;
  fresh: boolean;
  /** Free eggs: game seconds until the next one (0 = take it now). */
  freeIn: number | null;
}
export interface EggShopView {
  my: Array<{ id: string; count: number }>;
  eggs: EggCardView[];
}

export type BuyCheck = { ok: true; incubator: number; price: number } | { ok: false; reason: DenyReason; price: number };

export interface Game {
  readonly store: GameStore;
  readonly content: GameContent;
  readonly events: Emitter<GameEvent>;
  readonly state: SaveData;
  canBuyEgg(eggId?: string): BuyCheck;
  /** Eggs on sale now (unlocked ones), cheapest first, with their purchase check. */
  eggList(): Array<{ id: string; check: BuyCheck; fresh: boolean }>;
  buyEgg(eggId?: string): boolean;
  /** The egg screen: every egg on sale (open or not yet), free eggs with their timers, my eggs. */
  eggShop(): EggShopView;
  /** Buys n eggs at once (×3 / ×5): the free incubators take them, the rest wait in «my eggs». */
  buyEggs(eggId: string, n: number): boolean;
  /** Takes a free egg whose timer is done into «my eggs». */
  claimFree(eggId: string): boolean;
  /** Gives eggs into «my eggs» (gifts, codes, rewards). */
  giveEggs(eggId: string, n: number): void;
  tapIncubator(index: number): void;
  /** A promo code (M3-13): case and spaces do not matter; each code once. */
  redeemCode(code: string): 'ok' | 'used' | 'unknown';
  /** «Side job» (M3-12): the level, coins per tap, the price of the next level (null at the top). */
  workView(): { level: number; pay: number; price: number | null };
  /** A tap on the bowl: the neighbours' pets are fed, coins come. */
  workTap(): number;
  /** «Level up for …». */
  workUp(): boolean;
  /** «Gifts» (M3-11): what is taken; today is the player's local date (YYYY-MM-DD), the sim keeps no clock of its own. */
  giftsView(today: string): { subscribed: Record<string, boolean>; reviewed: boolean; day: number; dailyReady: boolean };
  /** An egg for following a community (once each), after the player came back from its page. */
  claimSubscribe(id: string): boolean;
  /** The golden egg for a review sent through the platform (once). */
  claimReview(): boolean;
  /** Today's reward of the 7 days; the count only goes on (a missed day loses nothing), after the 7th — again from the 1st. */
  claimDaily(today: string): boolean;
  /** The market (M3-09): lots of sellers and seconds until new ones. */
  market(): { lots: LotView[]; refreshIn: number };
  /** «Don't wait» (until M5 a plain refresh, then for an ad). */
  refreshMarket(): void;
  /** Buys a lot at its price (or a bargained one, M3-10); the creature goes on sale or into the inventory. */
  buyLot(id: number, price?: number): boolean;
  /** Seller chat (M3-10): «I love it too!» after «How are you?» — a hobby discount, once per lot; returns the share taken off. */
  lotHobby(id: number): number;
  /** Seller chat: «Discount? I'll take it for…» — the seller agrees within the give of its character (then the lot is bought), once per lot. */
  lotBargain(id: number, price: number): 'yes' | 'no' | 'coins' | 'done';
  /** «Chats» (M3-08): buyers' messages about creatures on sale, newest first. */
  chats(): Chat[];
  /** Sells the creature to the buyer of the chat at the offered price (the only way a buyer pays, UB-05). */
  chatSell(id: number): boolean;
  /** «No, thanks»: the buyer leaves, the creature goes back on the shelf, another buyer will write later. */
  chatDecline(id: number): boolean;
  /** «Counter price»: the player's asking price; the buyer agrees within its give, else names a last price. Once per chat, never in the first deal. */
  chatCounter(id: number): boolean;
  /** May the player name a counter price in this chat (once, and not in the first deal of the game). */
  canCounter(id: number): boolean;
  chatRead(id: number): void;
  /** «My sales» (M3-07): puts a creature from the inventory on a free sale slot; false when the showcase is full. */
  list(uid: string): boolean;
  /** «Take off» / «Keep» (M3-07): the creature leaves its sale slot for the inventory. */
  unlist(uid: string): boolean;
  /** The price slider (M3-06): sets the asking price as a share of the appraisal (clamped to the slider). */
  setAsk(uid: string, share: number): boolean;
  /** «Sell now» (M3-05): the creature goes at the low end of its price range, no customer needed. */
  sellNow(uid: string): boolean;
  /** Egg care: one portion of food for coins (docs/01 §3 p. 12). */
  feedEgg(index: number): boolean;
  /** Feeds the creature (+1 toward its next level) and selects it. */
  tapCreature(uid: string): void;
  /** The selected creature, falling back to the first one. */
  selected(): string | null;
  tick(dt: number): void;
  view(): GameView;
  /** The shop positions of upgrades.json (shop list) with their next price. */
  upgradeList(): UpgradeView[];
  buyUpgrade(id: string): boolean;
  /** The player looked at the shop: «New!» marks go out. */
  seenShop(): void;
  /** UB-06: the player opened a tab; true on the very first visit (its one hint shows then). */
  seenTab(tab: string): boolean;
  /** Open district ids (yard first). */
  districts(): string[];
  /** Tap on the event thing at the door: the door egg is taken, the merchant opens his cart (merchantOpen). */
  tapEvent(): void;
  /** Tap on a sneeze coin. */
  tapEventCoin(id: number): void;
  /** What the merchant sells now; null when he is not here. */
  merchantOffer(): MerchantOffer | null;
  merchantBuy(choice: 'discount' | 'mystery'): boolean;
  /** A tap on a shop thing (sign, door, lamp): a reply always, a secret on the counter (docs/01b, section 2). */
  tapThing(target: SecretTarget): void;
  /** M6-23: the player names the shop: ok, or why not (empty, too long, a stop-word); a secret name marks its find. */
  setShopName(raw: string): 'ok' | 'empty' | 'long' | 'blocked';
  /** M6-20: the clock strikes (the ui calls it on the hour of secrets.json chime, once a strike): food for every creature. */
  chime(hour: number): boolean;
  /** The nearest goal not reached yet: the one with the largest share done (shop positions, the next seller level, deal goals; rebirth when all is bought). */
  nextGoal(): GoalView;
  /** M4-06: the move to a new city — coins earned here against what it needs, the income multiplier now and after. */
  rebirthView(): RebirthView;
  /** M4-06: moves the shop to a new city when ready (false: not yet). */
  rebirth(): boolean;
  /** M4-01: the collection by rarity — every species with its status, «N of M» per row and in all. */
  collection(): CollectionView;
  /** M4-05: the guest zone of the pickup point — the decorations, their bonus and upkeep, the full themes. */
  guestZone(): GuestZoneView;
  /** M4-21: the ids of the events that may come now (weights and the species on the shelf decide). */
  eventsPossible(): string[];
  /** e2e and screenshots only (the test API): starts one event now if it may come. */
  startEventNow(id: string): boolean;
  /** M4-20: the finds — got or not, the reward claimed or waiting, hidden, how far a numeric one is. */
  finds(): Array<{ id: string; got: boolean; claimed: boolean; hidden: boolean; have: number; need: number }>;
  /** M4-20: takes the reward of a find (coins or crystals), once. */
  claimFind(id: string): boolean;
  /** M4-05: puts a decoration in the guest zone (coins, once the point is rented). */
  buyGuest(id: string): boolean;
  /** M4-05: takes a decoration away — its upkeep stops, nothing comes back. */
  removeGuest(id: string): boolean;
  /** M4-23: the device's day (YYYY-MM-DD) — the mood of the market follows it. */
  setDay(day: string): void;
  /** M4-07: today's anomaly and goals (rolled once per device date); the egg goes to «my eggs», a done goal pays once. */
  dayView(day: string): DayView;
  claimDayEgg(day: string): boolean;
  claimDayGoal(day: string, id: string): boolean;
  /** FB-04: a reward as it pays now (incomeMin in coins of the current income). */
  rewardFor(r: RewardData): RewardData;
  /** M4-23: the species in fashion and the one everybody is fed up with today, with their price multipliers (null: no day yet). */
  mood(): { hot: string; cold: string; hotMult: number; coldMult: number } | null;
  /** UB-08: the seller level of reputation.json. */
  reputation(): ReputationView;
  /** Free showcase places (eggs in incubators take none since UB-05). */
  freeSlots(): number;
  showcaseSlots(): number;
  /** The shop works on while the player is away (helpers, incubators): awaySec real seconds, clamped to offlineMaxHours, at offlineRate. */
  offline(awaySec: number): OfflineReport;
  /** FB-03: the coins of the last time away once more (the ad «×2» in the return window); 0 when already taken. */
  awayDouble(): number;
  /** M5-02: the egg-ad cards for the device day (empty without ads data). */
  adEggs(day: string): AdEggView[];
  /** M5-02: the reward of an egg ad: the egg into «my eggs»; false when none is left today or the gap is not over. */
  claimAdEgg(day: string, id: string): boolean;
  /** M5-02: «hatch now» of an egg ad — the egg in the incubator is ready at once. */
  hatchNow(index: number): boolean;
  /** M5-02: «×2 deal» — the coins of the player's last deal once more; 0 when there is none to double. */
  adDouble(): number;
  /** M5-02: the player's last deal still to double (the creature sold and its coins), or null. */
  dealToDouble(): { uid: string; coins: number } | null;
  /** M5-02: the sales boost of the «Gifts» tile — sales ×mult for its seconds of live play. */
  startBoost(day: string): boolean;
  boostLeft(): number;
  /** M5-02: sales boosts still to take today (boost.perDay a device day). */
  boostsLeft(day: string): number;
  /** M5-05: a purchase's goods into the shop (coins by income, eggs into «my eggs», crystals); the coins given. */
  grantPack(give: PackGive): number;
  /** M5-04, M5-05: a store mark — a pack bought (count by id), «no ads» owned, the end of the starter deal (platform time). */
  shopMark(mark: { bought?: string; noAds?: boolean; starterEnds?: number }): void;
}

/** Tutorial marks in save.flags (docs/01, section 4). */
export const FLAGS = { starter: 'ftue_starter', fed: 'ftue_fed', bought: 'ftue_bought', done: 'ftue_done', crystal: 'crystal_seen' } as const;

export function createGame(store: GameStore, content: GameContent, rng: Rng): Game {
  const events = createEmitter<GameEvent>();
  /** Offline catch-up runs quiet: no events, no saves until it is done (one commit at the end). */
  let quiet = false;
  const emit = (e: GameEvent): void => {
    if (!quiet) events.emit(e);
  };
  const commit = (opts?: { flush?: boolean }): void => {
    if (!quiet) store.commit(opts);
  };
  const { eggs, species, customers } = content;
  /** FB-02: coins earned by live play since the last tick (sales and the pickup point; not gifts, not away). */
  let liveEarned = 0;
  /** FB-15: the coins and the seconds of the minute of live play going on now. */
  let minuteCoins = 0;
  let minuteSec = 0;
  /** FB-03: the coins of the last time away, for «×2» once (not saved: the return window is shown once). */
  let lastAway = 0;
  /** M5-02: the coins of the player's last deal, for «×2» once (not saved: the button lives in the deal's own chat). */
  let lastDeal: { uid: string; coins: number } | null = null;
  /** M5-02: a new device day starts the ad counts over (eggs, boosts). */
  const newDay = (day: string): void => {
    const a = adsOf();
    if (a.day === day) return;
    a.day = day;
    a.eggs = 0;
    a.boosts = 0;
  };
  const adsOf = (): NonNullable<SaveData['ads']> => {
    const st = s();
    st.ads ??= { day: '', eggs: 0, eggIn: 0, boostLeft: 0, boosts: 0 };
    return st.ads;
  };
  /** FB-02: the player's income, coins a minute (never below the floor of the first minute). */
  const incomeNow = (): number => Math.max(eggs.income.floorPerMin, s().stats.income ?? 0);
  /** FB-02: the most a free reward is worth: rewardCapMin minutes of income. */
  const rewardCap = (): number => eggs.income.rewardCapMin * incomeNow();
  const basicEgg = content.ftue.starterEgg;
  const s = (): SaveData => store.state;
  /** The creatures on sale (M3-07): the showcase of the shop is the slots of «My sales»; the rest wait in the inventory. */
  const onSale = (): Creature[] => {
    const st = s();
    const out: Creature[] = [];
    // A handful of slots: a plain search is cheaper than a map every tick (the balance model runs millions of ticks).
    for (const u of st.showcase) {
      const c = st.creatures.find((x) => x.uid === u);
      if (c) out.push(c);
    }
    return out;
  };
  /** A buyer is writing about this creature (an open chat): it is off the shelf meanwhile (Q-025). */
  const talkingAbout = (uid: string): boolean => s().chats.some((c) => c.state === 'open' && c.uid === uid);
  /** Puts a creature on sale if a slot is free (UB-05: eggs in incubators keep no slots). */
  const listIfRoom = (uid: string): boolean => {
    const st = s();
    if (st.showcase.includes(uid)) return true;
    if (!st.creatures.some((c) => c.uid === uid) || talkingAbout(uid) || st.showcase.length >= showcaseSlots()) return false;
    st.showcase.push(uid);
    return true;
  };

  const eggData = (id: string) => eggs.eggs.find((e) => e.id === id);
  const speciesData = (id: string) => species.species.find((x) => x.id === id);
  const upgradeLevel = (id: string): number => s().upgrades[id] ?? 0;
  const speedEffect = (): number => {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'hatchTime');
    return u && u.effect.type === 'hatchTime' ? upgradeLevel(u.id) * u.effect.perLevel : 0;
  };
  const needFor = (eggId: string): number => {
    const egg = eggData(eggId);
    return egg ? hatchNeedSec(egg, speedEffect()) : 0;
  };
  /** Hatched and waiting for a tap (the egg ripens meanwhile). */
  const eggReady = (inc: Incubator): boolean => !!inc.egg && !inc.waiting && isHatched(inc.progress, inc.elapsed, needFor(inc.egg), eggs);
  const careOf = (inc: Incubator): number => careBonus({ taps: inc.careTaps ?? 0, fed: inc.careFed ?? 0, ripeSec: inc.ripeSec ?? 0 }, eggs.care);
  /** One portion of egg food: a share of the egg price (at least a coin); null when fed in full or no egg. */
  const feedPrice = (inc: Incubator): number | null => {
    const egg = inc.egg ? eggData(inc.egg) : undefined;
    if (!egg || (inc.careFed ?? 0) >= eggs.care.feed.steps) return null;
    return Math.max(1, coins(egg.price.coins * eggs.care.feed.priceShare));
  };

  const effectSum = (type: string): number =>
    content.upgrades.upgrades.reduce((sum, u) => (u.effect.type === type && 'perLevel' in u.effect ? sum + upgradeLevel(u.id) * u.effect.perLevel : sum), 0);
  /** Price-tag multiplier of a creature: shelf growth (radio speeds it up) and price tags (docs/01, section 3.5; docs/01b, section 5.1). */
  // M4-06: every move to a new city adds to the price of every creature (prestige.incomeBonusPerPrestige).
  // M4-23: the mood of the market by the device's day (set from outside: the sim has no clock) and the save's seed.
  let today = '';
  const mood = (): { hot: string; cold: string } | null => marketMood(today, s().createdAt, species.species.map((x) => x.id));
  const moodMult = (id: string): number => {
    const m = mood();
    return m?.hot === id ? content.market.mood.hot : m?.cold === id ? content.market.mood.cold : 1;
  };
  // M4-05: the guest zone of the pickup point — the bargain bonus of the decorations standing (and of a full theme), unless unpaid.
  const guestItems = () => content.decor.items.filter((x) => s().guest.items.includes(x.id));
  const guestSets = () => content.decor.sets.filter((set) => content.decor.items.filter((x) => x.theme === set.theme).every((x) => s().guest.items.includes(x.id)));
  const guestBonus = (): number => (s().guest.unpaid ? 0 : guestItems().reduce((n, x) => n + x.bargain, 0) + guestSets().reduce((n, x) => n + x.bonus, 0));
  const guestUpkeep = (): number => guestItems().reduce((n, x) => n + x.upkeep, 0);
  /** The pickup point pays by itself (effect passive, coins a minute), the guest zone costs its upkeep — while playing and away. */
  function runPoint(dt: number): void {
    const st = s();
    const passive = effectSum('passive') * cityMult(st.prestige, content.upgrades.prestige.incomeBonusPerPrestige);
    if (passive > 0) {
      const gain = (passive * dt) / 60;
      st.coins += gain;
      st.stats.coinsEarned += gain;
      if (!quiet) liveEarned += gain;
    }
    const upkeep = guestUpkeep();
    if (upkeep <= 0) {
      st.guest.unpaid = false;
      return;
    }
    st.guest.due += (upkeep * dt) / 60;
    if (st.guest.due < 1) return;
    const pay = Math.floor(st.guest.due);
    if (st.coins >= pay) {
      st.coins -= pay;
      st.guest.due -= pay;
      if (st.guest.unpaid) {
        st.guest.unpaid = false;
        emit({ type: 'change' });
      }
    } else if (!st.guest.unpaid) {
      st.guest.unpaid = true;
      emit({ type: 'guestUnpaid' });
      emit({ type: 'change' });
    }
  }
  // M4-01: a full row of the collection adds to the price of its rarity for good.
  const rowBonus = (cr: Creature): number => {
    const r = speciesData(cr.species)?.rarity;
    return r && s().flags[`row_${r}`] ? content.collection.rowBonus[r] : 0;
  };
  /** M4-25: the mark of a creature (species.json marks). */
  const markOf = (cr: Creature) => (cr.mark ? species.marks.list.find((m) => m.id === cr.mark) : undefined);
  /** Feeding taps a level needs: the sleepy one eats slower. */
  const needOf = (cr: Creature): number => Math.ceil(tapsForLevel(cr.level, species.tapsPerLevelBase, species.tapGrowth) * (markOf(cr)?.feedMult ?? 1));
  /** M6-21: the anomalous weather shines on every pet on the shelf while it lasts (×priceMult, the mark's tint). */
  const weatherOn = (cr: Creature): boolean => activeOf('weather') !== null && s().showcase.includes(cr.uid);
  const weatherMult = (cr: Creature): number => (weatherOn(cr) ? (activeOf('weather')?.priceMult ?? 1) : 1);
  /** A mark at hatching from the creature's id (no extra roll: the rest of the game stays as it was for a seed). */
  const markFor = (uid: string): string | undefined => {
    const roll = dayHash(uid, s().createdAt) / 0x100000000;
    const m = species.marks;
    return roll < m.chance ? pickWeighted(m.list, roll / m.chance)?.id : undefined;
  };
  const valueMult = (cr: Creature): number =>
    (cr.mult ?? 1) *
    (markOf(cr)?.priceMult ?? 1) *
    weatherMult(cr) *
    (1 + shelfBonus(cr.age ?? 0, species.shelf, 1 + effectSum('shelfGrowth'))) *
    (1 + effectSum('appraisal')) *
    (1 + rowBonus(cr)) *
    moodMult(cr.species) *
    cityMult(s().prestige, content.upgrades.prestige.incomeBonusPerPrestige);
  /** The price tag in whole coins: level price × valueMult. */
  const appraisal = (cr: Creature): number => {
    const spec = speciesData(cr.species);
    return spec ? coins(creatureValue(spec, cr.level) * valueMult(cr)) : 0;
  };
  /** Reputation points (UB-08): at least one per deal, so saves and set-ups from before it count their deals. */
  const repXp = (): number => Math.max(s().stats.xp ?? 0, (s().stats.deals - (s().stats.awayDeals ?? 0)) * content.reputation.perDeal);
  /** The seller level (UB-08): reputation points against reputation.json. */
  const sellerLevel = (): number => repLevel(repXp(), content.reputation.levels).level;
  const baseFacts = (): UnlockFacts => {
    const st = s().stats;
    return { deals: st.deals, level: sellerLevel(), hatched: st.hatched, levelUps: st.levelUps ?? 0, haggles: st.haggles ?? 0, upgrades: s().upgrades, districts: [], city: s().prestige + 1 };
  };
  /** Districts open by deals (docs/01a, section 4); a district never waits for another district (validate:content). */
  const openDistricts = (): DistrictData[] => content.customers.districts.filter((d) => unlockMet(d.unlock, baseFacts()));
  const facts = (): UnlockFacts => ({ ...baseFacts(), districts: openDistricts().map((d) => d.id) });
  /** Eggs for sale for coins (the ladder and seasonal ones); free and reward eggs come by timer or as gifts (docs/01 §3 p. 12). */
  const forSale = (e: EggsData['eggs'][number]): boolean => !e.special && (e.section === 'ladder' || e.section === 'seasonal');
  const eggOpen = (e: EggsData['eggs'][number]): boolean => forSale(e) && eggUnlocked(e, facts());
  /** Does this customer type like the creature (docs/01, section 3.5: the showcase attracts its customers). */
  const likes = (c: DistrictData['customer'], cr: Creature): boolean => {
    const spec = speciesData(cr.species);
    if (!spec) return false;
    if (c.likes === 'cheap') return spec.rarity === 'common';
    if (c.likes === 'rare') return spec.rarity !== 'common';
    return cr.level >= 3;
  };
  /** The dearest creature (the golden customer takes it: he pays a multiple of the tag). */
  const dearest = (): string | null => onSale().reduce<Creature | null>((best, cr) => (!best || appraisal(cr) > appraisal(best) ? cr : best), null)?.uid ?? null;
  // ---- Collector orders (docs/01b, section 5.3; M2-19): one at a time on the board, from species the player can get.
  const orderFits = (cr: Creature): boolean => {
    const o = s().order;
    return Boolean(o && owned('orders') && cr.species === o.species && cr.level >= o.level);
  };

  function newOrder(): void {
    const cfg = content.customers.orders;
    // Species of the rarities the open eggs can hatch.
    const rarities = new Set(eggs.eggs.filter(eggOpen).flatMap((e) => RARITIES_ALL.filter((r) => e.chances[r] > 0)));
    const pool = species.species.filter((x) => rarities.has(x.rarity));
    const spec = pool[rng.int(pool.length)];
    if (!spec) return;
    const top = Math.max(cfg.level.min, Math.min(cfg.level.max, spec.maxLevel));
    const level = cfg.level.min + rng.int(top - cfg.level.min + 1);
    const reward = coins(creatureValue(spec, level) * rng.range(cfg.rewardMult.min, cfg.rewardMult.max));
    const person = rng.int(content.customers.people.names.length);
    s().order = { species: spec.id, level, reward, left: cfg.minutes * 60, person };
    emit({ type: 'orderNew', species: spec.id, level, reward });
  }

  function runOrders(dt: number): void {
    const st = s();
    if (!owned('orders')) return;
    if (!st.order) {
      newOrder();
      commit();
      emit({ type: 'change' });
      return;
    }
    st.order.left -= dt;
    if (st.order.left > 0) return;
    // Missed: nothing is taken, a new collector writes a new order.
    const old = st.order.species;
    st.order = null;
    emit({ type: 'orderExpired', species: old });
  }

  let selectedUid: string | null = null;
  /** Game seconds since the player last touched the shop (taps, deals, eggs): helpers step in only when nobody plays. */
  let idleSec = 0;
  function creatureView(x: Creature): CreatureView {
    const spec = speciesData(x.species);
    const price = appraisal(x);
    return {
      uid: x.uid,
      species: x.species,
      rarity: spec?.rarity ?? 'common',
      level: x.level,
      maxLevel: spec?.maxLevel ?? 1,
      price,
      ...priceRange(price, content.market.range),
      ask: Math.max(1, coins(price * (x.askShare ?? 1))),
      askShare: x.askShare ?? 1,
      zone: priceZone(x.askShare ?? 1, content.market.slider),
      fed: x.fed,
      need: needOf(x),
      hold: Math.ceil((x.hold ?? 0) / 60),
      mark: x.mark ?? (weatherOn(x) ? (activeOf('weather')?.mark ?? '') : ''),
      tint: markOf(x)?.tint ?? (weatherOn(x) ? (species.marks.list.find((m) => m.id === activeOf('weather')?.mark)?.tint ?? '') : ''),
    };
  }

  /** The last tapped creature (on the shelf, in the inventory or in a chat), else the first on sale. */
  function selected(): string | null {
    if (selectedUid && s().creatures.some((x) => x.uid === selectedUid)) return selectedUid;
    selectedUid = onSale()[0]?.uid ?? s().creatures[0]?.uid ?? null;
    return selectedUid;
  }

  const queueSize = (): number => content.customers.queueSize + effectSum('queueSize');
  let decorKey = '';
  let decorCache: Record<string, number> = {};
  /** Bought upgrades that show in the shop (docs/01b, section 1.4), cached between purchases. */
  function decorLevels(): Record<string, number> {
    const key = `${JSON.stringify(s().upgrades)}|${s().guest.items.join(',')}|${s().guest.unpaid}`;
    if (key !== decorKey) {
      decorKey = key;
      decorCache = {};
      for (const u of content.upgrades.upgrades) if (u.decor && upgradeLevel(u.id) > 0) decorCache[u.decor] = upgradeLevel(u.id);
      // M4-05: the guest zone (level 2 — paid, 1 — the guests are bored: the upkeep failed).
      for (const id of s().guest.items) decorCache[`guest_${id}`] = s().guest.unpaid ? 1 : 2;
    }
    return decorCache;
  }

  /** Showcase places: the base of the showcase upgrade plus every bought level (showcase, stool). */
  function showcaseSlots(): number {
    const n = content.upgrades.upgrades.reduce((sum, u) => (u.effect.type === 'showcaseSlots' ? sum + (u.effect.base ?? 0) + upgradeLevel(u.id) * u.effect.perLevel : sum), 0);
    return n > 0 ? n : 3;
  }
  function freeSlots(): number {
    return Math.max(0, showcaseSlots() - s().showcase.length);
  }

  type Effect = UpgradeData['effect'];
  /** The effect of a bought upgrade of this type (helpers are one-level upgrades), or null. */
  function owned<T extends Effect['type']>(type: T): Extract<Effect, { type: T }> | null {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === type && upgradeLevel(x.id) > 0);
    return u ? (u.effect as Extract<Effect, { type: T }>) : null;
  }
  const helperSellShare = (): number => owned('autoSell')?.priceShare ?? (quiet ? content.upgrades.away.autoSell.priceShare : 1);
  let feedAcc = 0;
  let courierIn = 0;
  /** Seconds until the seller helper answers the next buyer. */
  let sellerIn = 0;
  let cuckooIn = 0;
  /** Shop positions open so far: a new one is announced once (docs/01b, section 1.7: mechanics as a reward). */
  let openShop = new Set<string>();
  let shopCheckIn = 0;
  const openShopIds = (): string[] => {
    const f = facts();
    return content.upgrades.shop.filter((id) => unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, f));
  };

  /** The cuckoo clock (docs/01b, section 5.1): every everySec all creatures get food. */
  function runClock(dt: number): void {
    const clock = owned('cuckoo');
    if (!clock) return;
    cuckooIn += dt;
    if (cuckooIn < clock.everySec) return;
    cuckooIn = 0;
    emit({ type: 'cuckoo' });
    for (const cr of [...s().creatures]) feed(cr, clock.fed, 'cuckoo');
  }

  // ---- Random events (docs/01b, section 3; M2-15): one at a time, only a plus, never in the first minute, never while away.
  type EventData = EventsData['events'][number];
  interface ActiveEvent {
    data: EventData;
    left: number;
    coins: Array<{ id: number; x: number; y: number; value: number }>;
    uid: string | null;
    egg: string | null;
    /** The golden buyer's chat (UB-05: the golden customer writes like everyone else). */
    chat: number | null;
  }
  let active: ActiveEvent | null = null;
  let twinsDone = false;
  let sessionSec = 0;
  let eventIn = rng.range(content.events.firstAfterSec.min, content.events.firstAfterSec.max);
  let nextCoinId = 1;
  const randInt = (r: { min: number; max: number }): number => r.min + rng.int(r.max - r.min + 1);
  /** The egg a gift brings: the warm one when it is open, else the basic one. */
  const giftEgg = (): string => (eggs.eggs.find((e) => e.id === 'egg_warm' && eggOpen(e)) ? 'egg_warm' : basicEgg);
  /** A spot for an egg: a free incubator (UB-05: eggs take no showcase place). */
  const eggSpot = (): number => s().incubators.findIndex((i) => !i.egg);

  function possible(e: EventData): boolean {
    if (e.weight <= 0 || sessionSec < e.fromMin * 60) return false;
    // M4-21: an event about a species comes only while one is on the shelf (the kettle whistles, the lampbug glows, the cat walks).
    if ('needs' in e && !onSale().some((cr) => cr.species === e.needs)) return false;
    if (e.kind === 'golden' || e.kind === 'sneeze' || e.kind === 'inspector' || e.kind === 'photo' || e.kind === 'weather') return onSale().length > 0;
    // M6-21: the parade brings an egg of the list that is open now.
    if (e.kind === 'parade') return e.eggs.some((id) => eggs.eggs.some((x) => x.id === id && eggOpen(x)));
    return true;
  }
  /** M4-21: the events that may come now (the unit test of the weights and the species). */
  const possibleEvents = (): string[] => content.events.events.filter(possible).map((e) => e.id);
  /** M4-21: the event of the moment, when it is of this kind. */
  const activeOf = <K extends EventKind>(kind: K): Extract<EventData, { kind: K }> | null => (active?.data.kind === kind ? (active.data as Extract<EventData, { kind: K }>) : null);

  function startEvent(from = content.events.events): void {
    const data = pickWeighted(from.filter(possible), rng.next());
    if (!data) return;
    const ev: ActiveEvent = { data, left: data.durationSec, coins: [], uid: null, egg: null, chat: null };
    if (data.kind === 'golden') {
      const uid = dearest();
      const cr = uid ? s().creatures.find((x) => x.uid === uid) : undefined;
      if (!cr) return;
      ev.chat = newChat(cr, data.priceMult).id;
    } else if (data.kind === 'sneeze') {
      const list = onSale();
      ev.uid = list[rng.int(list.length)]?.uid ?? null;
      const st = s().stats;
      const avgSale = st.deals > 0 ? st.coinsEarned / st.deals : 0;
      const n = randInt(data.coins);
      for (let i = 0; i < n; i++) ev.coins.push({ id: nextCoinId++, x: rng.next(), y: rng.next(), value: Math.max(randInt(data.coinValue), Math.round(avgSale * data.saleShare)) });
    } else if (data.kind === 'doorEgg') ev.egg = giftEgg();
    else if (data.kind === 'kettle') {
      // The kettle whistles: every neighbour on the shelf gets a few bites (feeding as if tapped).
      const kettle = onSale().find((cr) => cr.species === data.needs);
      ev.uid = kettle?.uid ?? null;
      for (const cr of onSale()) if (cr !== kettle) feed(cr, data.fedTaps, 'helper');
    } else if (data.kind === 'blink' || data.kind === 'catWalk') ev.uid = onSale().find((cr) => cr.species === data.needs)?.uid ?? null;
    active = ev;
    s().flags[`seen_event_${data.kind}`] = true;
    emit({ type: 'eventStarted', id: data.id, kind: data.kind, uid: ev.uid ?? undefined });
    emit({ type: 'change' });
  }

  function endEvent(outcome: 'done' | 'missed'): void {
    const ev = active;
    if (!ev) return;
    active = null;
    eventIn = rng.range(content.events.everySec.min, content.events.everySec.max);
    // The golden buyer leaves with the event if the deal is not done (the creature goes back on the shelf).
    const golden = ev.chat === null ? undefined : s().chats.find((c) => c.id === ev.chat && c.state === 'open');
    if (golden) chatGone(golden, false);
    emit({ type: 'eventEnded', id: ev.data.id, kind: ev.data.kind, outcome });
    emit({ type: 'change' });
  }

  function runEvents(dt: number): void {
    if (!s().flags[FLAGS.done]) return;
    sessionSec += dt;
    if (active) {
      active.left -= dt;
      // M6-21: the weather is a gift by itself — it ends done, not missed.
      if (active.left <= 0) endEvent(active.data.kind === 'weather' ? 'done' : 'missed');
      return;
    }
    eventIn -= dt;
    if (eventIn <= 0) {
      eventIn = rng.range(content.events.everySec.min, content.events.everySec.max);
      startEvent();
    }
  }

  // ---- Easter eggs (docs/01b, section 2; M2-16): counters in the save, a streak for «in a row».
  let clock = 0;
  const streaks: Record<string, { n: number; at: number }> = {};
  /** M6-20: recent tap times per creature (game seconds), for the tickle. */
  const tickles: Record<string, number[]> = {};
  /** M6-20: when a pet last paid a tickle coin (game seconds). */
  const tickledAt: Record<string, number> = {};

  function merchantOffer(): MerchantOffer | null {
    const ev = active;
    if (!ev || ev.data.kind !== 'merchant') return null;
    const open = eggs.eggs.filter(eggOpen).sort((a, b) => b.price.coins - a.price.coins);
    const best = open[0] ?? eggData(basicEgg)!;
    const check = (price: number): BuyCheck => {
      const incubator = eggSpot();
      if (incubator < 0) return { ok: false, reason: 'busy', price };
      if (s().coins + 1e-9 < price) return { ok: false, reason: 'coins', price };
      return { ok: true, incubator, price };
    };
    const discount = Math.max(1, Math.round(best.price.coins * (1 - ev.data.discount)));
    const mystery = eggData(ev.data.mysteryPriceOf)?.price.coins ?? 0;
    return {
      discount: { egg: best.id, price: discount, check: check(discount) },
      mystery: { egg: ev.data.mysteryEgg, price: mystery, check: check(mystery) },
    };
  }

  /** Announces shop positions that opened since the last look (flag up_new_<id> until the shop is opened). */
  function checkShop(dt: number): void {
    shopCheckIn -= dt;
    if (shopCheckIn > 0) return;
    shopCheckIn = 0.5;
    const now = openShopIds();
    const fresh = now.filter((id) => !openShop.has(id));
    openShop = new Set(now);
    for (const id of fresh) {
      s().flags[`up_new_${id}`] = true;
      emit({ type: 'upgradeUnlocked', id });
    }
    if (fresh.length) emit({ type: 'change' });
  }

  /** Helpers (docs/01, section 3.6): the feeder feeds the hungriest, the seller sells to a customer kept waiting, the courier brings eggs. */
  function runHelpers(dt: number): void {
    const st = s();
    const feeder = owned('autoFeed');
    if (feeder) {
      feedAcc += dt * feeder.tapsPerSec;
      while (feedAcc >= 1) {
        feedAcc -= 1;
        const hungry = st.creatures
          .filter((cr) => cr.level < (speciesData(cr.species)?.maxLevel ?? 0))
          .sort((a, b) => a.level - b.level || a.hatchedAt - b.hatchedAt)[0];
        if (!hungry) {
          feedAcc = 0;
          break;
        }
        feed(hungry, 1 + effectSum('feedPerTap'), 'helper');
      }
    }
    // The seller answers one buyer every delaySec, a chat that waited that long, while nobody plays (UB-05: buyers only write).
    // Q-027 B: away, the shop works on without bought helpers too (upgrades.json away) — the first night pays.
    const seller = owned('autoSell') ?? (quiet ? content.upgrades.away.autoSell : null);
    sellerIn = Math.max(0, sellerIn - dt);
    if (seller && sellerIn <= 0 && idleSec >= seller.delaySec) {
      const chat = s().chats.find((c) => c.state === 'open' && (c.age ?? 0) >= seller.delaySec);
      if (chat) {
        sellerIn = seller.delaySec;
        sellChat(chat, chat.order ? 1 : helperSellShare(), 'helper');
      }
    }
    const courier = owned('autoBuyEgg') ?? (quiet ? content.upgrades.away.autoBuyEgg : null);
    if (courier) {
      courierIn -= dt;
      if (courierIn <= 0) {
        courierIn = courier.everySec;
        // Only while the shelf has room for what the eggs hatch (UB-05: eggs take no shelf place, the courier would flood the shop).
        const coming = s().incubators.filter((i) => i.egg).length;
        if (freeSlots() > coming && canBuyEgg(courier.egg).ok) buyEggBy(courier.egg, 'helper');
      }
    }
  }

  /** Adds food to a creature (a tap, the feeder, the cuckoo); true on a level up. */
  function feed(cr: Creature, food: number, by: FeedBy): boolean {
    const spec = speciesData(cr.species);
    if (!spec) return false;
    const st = s();
    const maxed = cr.level >= spec.maxLevel;
    let levelUp = false;
    const before = appraisal(cr);
    if (!maxed) {
      cr.fed += food;
      if (cr.fed >= needOf(cr)) {
        cr.fed = 0;
        cr.level += 1;
        levelUp = true;
        st.stats.levelUps = (st.stats.levelUps ?? 0) + 1;
        if (by === 'tap') st.flags[FLAGS.fed] = true;
      }
    }
    const price = appraisal(cr);
    // A buyer writing about it sees it grow (UB-05): the offer follows the price, so feeding pays during a chat too.
    const chat = levelUp && before > 0 ? st.chats.find((c) => c.state === 'open' && c.uid === cr.uid) : undefined;
    const raised = chat ? Math.round((chat.offer * price) / before) : 0;
    if (chat && raised > chat.offer) {
      chat.offer = raised;
      chat.lines.push({ from: 'them', ctx: 'offer', i: pickLineIndex(chat.character, 'offer'), n: raised });
    }
    commit();
    emit({ type: 'fed', uid: cr.uid, level: cr.level, levelUp, maxed: cr.level >= spec.maxLevel, price, gain: price - before, by });
    if (chat && raised === chat.offer) emit({ type: 'chatReply', id: chat.id, ctx: 'offer' });
    return levelUp;
  }

  // ---- M4-20: finds (achievements) — every condition reads the save; a reward once, the mark find_<id> survives a move.
  type FindData = AchievementsData['items'][number];
  const findHave = (f: FindData): { have: number; need: number } => {
    const st = s();
    const w = f.when;
    if (w.type === 'stat') return { have: Math.floor(w.stat === 'dealsAll' ? Math.max(st.stats.dealsAll ?? 0, st.stats.deals) : (st.stats[w.stat] ?? 0)), need: w.n };
    if (w.type === 'level') return { have: sellerLevel(), need: w.n };
    if (w.type === 'city') return { have: st.prestige + 1, need: w.n };
    if (w.type === 'collected') {
      const all = species.species.length;
      return { have: species.species.filter((x) => (st.collection[x.id]?.seen ?? 0) > 0).length, need: w.n || all };
    }
    if (w.type === 'rows') return { have: RARITIES.filter((r) => st.flags[`row_${r}`]).length, need: w.n };
    if (w.type === 'upgrades') return { have: Object.values(st.upgrades).filter((n) => n > 0).length, need: w.n };
    if (w.type === 'guest') return { have: st.guest.items.length, need: w.n };
    return { have: st.flags[w.id] ? 1 : 0, need: 1 };
  };
  let findsIn = 0;
  function checkFinds(): void {
    const st = s();
    for (const f of content.achievements.items) {
      if (st.flags[`find_${f.id}`]) continue;
      const { have, need } = findHave(f);
      if (have < need) continue;
      // Found: marked at once; the reward waits for a tap in «Finds» (claimFind) — the genre's «collect» moment.
      st.flags[`find_${f.id}`] = true;
      commit({ flush: true });
      emit({ type: 'find', id: f.id, coins: f.reward.coins ?? 0, crystals: f.reward.crystals ?? 0 });
      emit({ type: 'change' });
    }
  }

  /** M4-01: a row of the collection just filled — crystals once, the price bonus from now on (flag row_<rarity>, kept by a move). */
  function checkRows(): void {
    const st = s();
    for (const r of RARITIES) {
      if (st.flags[`row_${r}`]) continue;
      const row = species.species.filter((x) => x.rarity === r);
      if (!row.length || !row.every((x) => (st.collection[x.id]?.seen ?? 0) > 0)) continue;
      st.flags[`row_${r}`] = true;
      st.crystals += content.collection.rowCrystals[r];
      emit({ type: 'rowDone', rarity: r, crystals: content.collection.rowCrystals[r], bonus: content.collection.rowBonus[r] });
    }
  }

  /** One deal (UB-05, one path: a chat answered by the player or the seller, or «sell now»): coins, crystals, counts, collection, order. */
  function closeDeal(cr: Creature, price: number, by: 'player' | 'helper' | 'now', chat?: Chat): void {
    const st = s();
    const districtsBefore = new Set(openDistricts().map((d) => d.id));
    const eggsBefore = new Set(eggs.eggs.filter(eggOpen).map((e) => e.id));
    const rarity = speciesData(cr.species)?.rarity ?? 'common';
    const doneOrder = chat?.order && orderFits(cr) ? st.order : null;
    if (doneOrder) st.order = null;
    const crystals = species.crystalsPerSale[rarity];
    st.crystals += crystals;
    const firstCrystal = crystals > 0 && !st.flags[FLAGS.crystal];
    if (firstCrystal) st.flags[FLAGS.crystal] = true;
    // UB-08: reputation — every deal, more for a rare one (the level before counts the deals before this one).
    const levelBefore = sellerLevel();
    // M5-02: the sales boost of the «Gifts» tile works in live play only (never away).
    if (!quiet && content.ads && (st.ads?.boostLeft ?? 0) > 0) price = coins(price * content.ads.boost.mult);
    if (by !== 'helper' && !quiet) lastDeal = { uid: cr.uid, coins: price };
    st.coins += price;
    if (!quiet) liveEarned += price;
    st.stats.deals += 1;
    st.stats.dealsAll = Math.max(st.stats.dealsAll ?? 0, st.stats.deals - 1) + 1;
    st.stats.coinsEarned += price;
    st.stats.xp = Math.max(st.stats.xp ?? 0, (st.stats.deals - 1 - (st.stats.awayDeals ?? 0)) * content.reputation.perDeal) + content.reputation.perDeal + (content.reputation.rarityBonus[rarity] ?? 0);
    const levelAfter = sellerLevel();
    st.creatures = st.creatures.filter((x) => x.uid !== cr.uid);
    st.showcase = st.showcase.filter((u) => u !== cr.uid);
    delete st.chatIn[cr.uid];
    const districts = openDistricts().filter((d) => !districtsBefore.has(d.id));
    const opened = eggs.eggs.filter((e) => eggOpen(e) && !eggsBefore.has(e.id));
    for (const e of opened) st.flags[`egg_new_${e.id}`] = true;
    const entry = (st.collection[cr.species] ??= { seen: 1, hatched: 0, sold: 0 });
    entry.sold += 1;
    if (selectedUid === cr.uid) selectedUid = null;
    commit({ flush: true });
    const type = chat ? customers.districts.find((d) => d.customer.id === chat.customer)?.customer : undefined;
    const liked = !chat || chat.customer === GOLDEN || (type ? likes(type, cr) : true);
    emit({ type: 'sold', uid: cr.uid, species: cr.species, rarity, price, crystals, customer: chat?.customer || 'now', customerId: chat?.id ?? 0, haggled: Boolean(chat?.countered), by, liked });
    if (chat) emit({ type: 'customerLeft', id: chat.id, reason: 'sold' });
    if (chat && chat.id === active?.chat) endEvent('done');
    if (levelAfter > levelBefore) emit({ type: 'repUp', level: levelAfter });
    if (firstCrystal) emit({ type: 'firstCrystal' });
    if (doneOrder) emit({ type: 'orderDone', species: doneOrder.species, reward: price });
    for (const d of districts) emit({ type: 'districtOpened', district: d.id, customer: d.customer.id });
    for (const e of opened) emit({ type: 'eggUnlocked', egg: e.id });
    emit({ type: 'change' });
  }

  /** «Sell now» (M3-05): no buyer, the low end of the price range; a deal like any other (counts, crystals, unlocks). */
  function sellNow(uid: string): boolean {
    const cr = s().creatures.find((x) => x.uid === uid);
    if (!cr || talkingAbout(uid) || cr.hold) return false;
    closeDeal(cr, priceRange(appraisal(cr), content.market.range).low, 'now');
    return true;
  }

  // Chats and the market draw from their own stream, seeded once from the game's rng (UB-05: buyers are the core of the economy,
  // so they vary with the seed and between visits instead of repeating from the profile's creation time).
  const side = createRng((rng.int(0x7fffffff) ^ 0x5eed5) >>> 0);
  // ---- Buyers (UB-05, one path): a buyer writes in «Chats» about a creature on the shelf; the scene queue shows the same buyers.
  let nextChatId = Math.max(0, ...s().chats.map((c) => c.id)) + 1;
  const characterOf = (id: string) => customers.characters.find((c) => c.id === id);
  const pickLineIndex = (character: string, ctx: string): number => {
    const pool = (characterOf(character)?.lines as Record<string, unknown[]> | undefined)?.[ctx];
    return pool?.length ? side.int(pool.length) : 0;
  };
  /** gentle (UB-10): the first deals pick among characters who pay fair (customers.json chat.gentleMinOffer). */
  const pickCharacter = (gentle = false) => {
    const all = customers.characters;
    const chars = gentle ? all.filter((c) => c.offer.max >= customers.chat.gentleMinOffer) : all;
    let roll = side.next() * chars.reduce((sum, c) => sum + c.weight, 0);
    return chars.find((c) => (roll -= c.weight) < 0) ?? chars[chars.length - 1]!;
  };
  /** The weighted mean share of all characters: a character's offer is read against it. */
  const characterMean = (() => {
    const w = customers.characters.reduce((sum, c) => sum + c.weight, 0);
    return w > 0 ? customers.characters.reduce((sum, c) => sum + c.weight * ((c.offer.min + c.offer.max) / 2), 0) / w : 1;
  })();
  const openChats = (): Chat[] => s().chats.filter((c) => c.state === 'open');
  const openChat = (id: number): Chat | undefined => s().chats.find((c) => c.id === id && c.state === 'open');
  const people = customers.people;
  /** The same person always wears the same outfit and accessory (M2-18). */
  const looks = (person: number): { outfit: string; accessory: string } =>
    person < 0 ? { outfit: '', accessory: 'none' } : { outfit: people.outfits[person % people.outfits.length] ?? '', accessory: people.accessories[person % people.accessories.length] ?? 'none' };
  /** The buyer's type: open districts by weight, raised when the type likes this creature (docs/01a, section 4). */
  function pickDistrict(cr: Creature): DistrictData | undefined {
    const pool = openDistricts().map((d) => ({ d, w: d.weight * (1 + (likes(d.customer, cr) ? d.attract : 0)) }));
    let roll = side.next() * pool.reduce((sum, x) => sum + x.w, 0);
    return (pool.find((x) => (roll -= x.w) < 0) ?? pool[pool.length - 1])?.d;
  }
  /** A person nobody among the open chats is (names never twice in the queue). */
  function pickPerson(): number {
    const taken = new Set(openChats().map((c) => c.person));
    const free = people.names.map((_, i) => i).filter((i) => !taken.has(i));
    return free[side.int(free.length)] ?? 0;
  }
  /** A buyer writes about a creature on the shelf: the offer is the character's share of the asking price with the type's bonuses. */
  function newChat(cr: Creature, golden?: number): Chat {
    const st = s();
    const ch = pickCharacter(st.stats.deals < customers.chat.gentleDeals);
    const c = pickDistrict(cr)?.customer;
    const spec = speciesData(cr.species);
    // The type pays its share; the character bargains around it (a troll lowballs, a rich one pays more).
    const base = c ? side.range(c.offer.min, c.offer.max) : 1;
    const roll = (base * side.range(ch.offer.min, ch.offer.max)) / characterMean;
    // Until the first deal the offer covers the next egg (first minute: sale → «buy a new egg»).
    // M4-21: a school excursion — small offers, but many and nobody leaves.
    const tour = activeOf('excursion');
    const share = (st.stats.deals === 0 ? Math.max(roll, content.ftue.firstOfferShare) : tour ? tour.offerShare : roll) * (cr.askShare ?? 1);
    let offer = golden
      ? coins(appraisal(cr) * golden)
      : spec
        ? offerFor(spec, cr.level, { share, mult: 1, rarityBonus: c?.rarityBonus, levelBonusPerLevel: c?.levelBonusPerLevel, cashBonus: effectSum('bargain') + guestBonus(), valueMult: valueMult(cr) })
        : 1;
    // M4-25: collectors love a singing one.
    if (!golden) offer = coins(offer * (markOf(cr)?.offerMult ?? 1));
    const order = !golden && orderFits(cr);
    // MU-12 (the game design review): the slider decides — a buyer agrees to the asking price with the chance of its zone
    // (market.json slider.agree): green — almost always, red — seldom; otherwise the character bargains as it likes.
    const agree = content.market.slider.agree;
    if (!golden && !order && !tour && st.stats.deals > 0 && agree && side.next() < (agree[priceZone(cr.askShare ?? 1, content.market.slider)] ?? 0))
      offer = Math.max(offer, Math.max(1, coins(appraisal(cr) * (cr.askShare ?? 1))));
    // MU-12 (the game design recheck): a price over the market never multiplies a generous offer — the buyer pays
    // the asking price or what it would give at the market price, whichever is more («Максимум» is not a jackpot).
    const ask = cr.askShare ?? 1;
    if (!golden && !order && !tour && st.stats.deals > 0 && agree && ask > 1) offer = Math.min(offer, Math.max(coins(appraisal(cr) * ask), coins(offer / ask)));
    if (order && st.order) offer = Math.max(offer, st.order.reward);
    offer = Math.max(1, offer);
    const chat: Chat = {
      id: nextChatId++,
      uid: cr.uid,
      species: cr.species,
      person: golden ? -1 : pickPerson(),
      character: ch.id,
      hobby: customers.hobbies[side.int(customers.hobbies.length)]?.id ?? '',
      customer: golden ? GOLDEN : (c?.id ?? ''),
      order,
      age: 0,
      offer,
      countered: false,
      state: 'open',
      unread: true,
      lines: [
        { from: 'them', ctx: 'greet', i: pickLineIndex(ch.id, 'greet') },
        { from: 'them', ctx: 'offer', i: pickLineIndex(ch.id, 'offer'), n: offer },
      ],
    };
    st.chats.push(chat);
    // Q-025: the creature leaves the shelf while the buyer writes; its slot takes the next one.
    if (customers.chat.holdOnShelf) st.showcase = st.showcase.filter((u) => u !== cr.uid);
    delete st.chatIn[cr.uid];
    const closed = st.chats.filter((x) => x.state !== 'open');
    if (closed.length > customers.chat.keep) {
      const drop = new Set(closed.slice(0, closed.length - customers.chat.keep).map((x) => x.id));
      st.chats = st.chats.filter((x) => !drop.has(x.id));
    }
    commit();
    emit({ type: 'chatNew', id: chat.id });
    emit({ type: 'customerArrived', id: chat.id, customer: chat.customer ?? '' });
    emit({ type: 'change' });
    return chat;
  }
  /** A chat ends without a deal (the player said no, the event is over): goodbye, the creature goes back on the shelf or to the inventory. */
  function chatGone(chat: Chat, mine: boolean): void {
    if (mine) chat.lines.push({ from: 'me', ctx: 'decline', i: 0 });
    chat.lines.push({ from: 'them', ctx: 'bye', i: pickLineIndex(chat.character, 'bye') });
    chat.state = 'gone';
    chat.unread = false;
    listIfRoom(chat.uid);
    commit({ flush: true });
    emit({ type: 'customerLeft', id: chat.id, reason: 'wait' });
    if (chat.id === active?.chat) endEvent('missed');
    emit({ type: 'change' });
  }
  /** The buyer of the chat pays (the player's «Sell for N» or the seller helper at priceShare of the offer). */
  function sellChat(chat: Chat, share: number, by: 'player' | 'helper'): boolean {
    const cr = s().creatures.find((x) => x.uid === chat.uid);
    if (!cr) return false;
    const price = Math.max(1, Math.round(chat.offer * share));
    chat.lines.push({ from: 'me', ctx: 'sell', i: 0, n: price }, { from: 'them', ctx: 'thanks', i: pickLineIndex(chat.character, 'thanks') });
    chat.state = 'sold';
    chat.unread = false;
    closeDeal(cr, price, by, chat);
    return true;
  }
  /** Seconds until a buyer writes: the price zone of the slider (M3-06), the sign upgrade makes it sooner; the very first one comes at once. */
  const writeIn = (cr: Creature): number =>
    s().stats.deals === 0 && !s().chats.length
      ? content.ftue.firstCustomerSec
      : replyDelay(cr.askShare ?? 1, side.next(), content.market) * Math.max(0.1, 1 + effectSum('spawnRate')) * (activeOf('excursion')?.writeMult ?? 1);
  function runChats(dt: number): void {
    const st = s();
    for (const c of st.chats) {
      if (c.state !== 'open') continue;
      c.age = (c.age ?? 0) + dt;
      // The creature is gone (sold some other way): the buyer says goodbye.
      if (!st.creatures.some((x) => x.uid === c.uid)) {
        c.state = 'gone';
        c.lines.push({ from: 'them', ctx: 'bye', i: pickLineIndex(c.character, 'bye') });
        emit({ type: 'customerLeft', id: c.id, reason: 'wait' });
      }
    }
    const listed = new Set(st.showcase);
    for (const uid of Object.keys(st.chatIn)) if (!listed.has(uid)) delete st.chatIn[uid];
    let room = queueSize() - openChats().length;
    for (const cr of onSale()) {
      if (talkingAbout(cr.uid) || cr.hold) continue;
      const left = (st.chatIn[cr.uid] ??= writeIn(cr)) - dt;
      st.chatIn[cr.uid] = left;
      if (left <= 0 && room > 0) {
        room -= 1;
        newChat(cr);
      }
    }
  }

  // The market (M3-09): sellers bring lots of the species the player's open eggs hatch; some below the market.
  let nextLotId = Math.max(0, ...s().market.lots.map((l) => l.id)) + 1;
  const lotValue = (l: { species: string; level: number }): number => appraisal({ uid: '', species: l.species, level: l.level, fed: 0, hatchedAt: 0, age: 0 });
  const verdict = (price: number, value: number): LotView['verdict'] => (price < value * 0.95 ? 'below' : price <= value * 1.05 ? 'market' : 'above');
  /** Coins, crystals and an egg into «my eggs» (gifts, codes). */
  /** FB-04: a reward with incomeMin in whole coins of the current income (at least its coins). */
  function rewardFor(r: RewardData): RewardData {
    if (r.incomeMin === undefined) return r;
    const { incomeMin, ...rest } = r;
    return { ...rest, coins: Math.max(r.coins ?? 0, coins(incomeMin * incomeNow())) };
  }
  function giveReward(reward: RewardData, from: 'subscribe' | 'review' | 'daily' | 'code' | 'return'): void {
    const st = s();
    const r = rewardFor(reward);
    if (r.coins) st.coins += r.coins;
    if (r.crystals) st.crystals += r.crystals;
    if (r.egg && eggData(r.egg)) {
      st.myEggs[r.egg] = (st.myEggs[r.egg] ?? 0) + 1;
      // FB-15: a gift egg hatches as a free reward (capped), even a ladder one.
      const gifts = (st.giftEggs ??= {});
      gifts[r.egg] = (gifts[r.egg] ?? 0) + 1;
    }
    commit({ flush: true });
    emit({ type: 'gift', from, reward: r });
    if (r.egg) placeMine();
    emit({ type: 'change' });
  }
  // ---- M4-07: the anomaly of the day and the goals of the day — by the device date (calendar.json daily and tasks).
  const TASK_STAT = { deals: 'dealsAll', hatch: 'hatched', feed: 'taps', earn: 'coinsEarned', haggle: 'haggles' } as const;
  /** The species of the day: one of the rarer kinds (calendar.json daily.rarities), the same all day for this save. */
  function daySpecies(day: string): (typeof species.species)[number] | undefined {
    const pool = species.species.filter((x) => content.calendar.daily.rarities.includes(x.rarity));
    return day && pool.length ? pool[dayHash(day, s().createdAt) % pool.length] : undefined;
  }
  /** FB-02: ×priceMultiplier over what its egg (the egg of the day) gives that rarity — the egg counts from the player's income. */
  const dayMult = (kind: (typeof species.species)[number], egg: EggData): number => content.calendar.daily.priceMultiplier * hatchMult(egg, kind.rarity, species, incomeNow());
  /** A new device date: three goals from the pool (stable for the day and save), progress counts from here, the egg waits again. */
  function rollDay(day: string): void {
    const st = s();
    if (!day || st.daily.day === day) return;
    const t = content.calendar.tasks;
    const order = (id: string): number => dayHash(`${day}:${id}`, st.createdAt);
    const goals = [...t.pool].sort((a, b) => order(a.id) - order(b.id)).slice(0, t.perDay).map((x) => x.id);
    const back = Boolean(st.daily.day);
    st.daily = { day, base: { ...st.stats }, goals, claimed: [], egg: false };
    commit({ flush: true });
    // FB-04: the bonus for coming back — once a new day, not on the very first one.
    if (back && content.calendar.returnBonus) giveReward(content.calendar.returnBonus, 'return');
  }
  function dayGoals(): DayView['goals'] {
    const st = s();
    return st.daily.goals.flatMap((id) => {
      const g = content.calendar.tasks.pool.find((x) => x.id === id);
      if (!g) return [];
      const stat = TASK_STAT[g.type];
      const now = st.stats[stat] ?? 0;
      const have = Math.max(0, Math.floor(now - (st.daily.base[stat] ?? now)));
      return [{ id, have: Math.min(have, g.count), need: g.count, done: have >= g.count, claimed: st.daily.claimed.includes(id), reward: rewardFor(g.reward) }];
    });
  }

  function stockMarket(): void {
    const st = s();
    const m = content.market;
    const open = eggs.eggs.filter(eggOpen);
    const lots: Lot[] = [];
    // M4-00: at most perSpecies lots of one kind (the usability reviewer: three kettles in a row read as a bug); a few retries, then the lot is skipped.
    const count = new Map<string, number>();
    for (let i = 0; i < m.lots && open.length; i++) {
      let kind: ReturnType<typeof pickSpecies> | undefined;
      for (let tries = 0; tries < 8 && !kind; tries++) {
        const egg = open[side.int(open.length)]!;
        const k = pickSpecies(species, pickRarity(egg.chances, side.next()), side.next());
        if ((count.get(k.id) ?? 0) < m.perSpecies) kind = k;
      }
      if (!kind) continue;
      count.set(kind.id, (count.get(kind.id) ?? 0) + 1);
      const level = m.level.min + side.int(Math.max(1, Math.min(m.level.max, kind.maxLevel) - m.level.min + 1));
      const value = lotValue({ species: kind.id, level });
      const factor = side.next() < m.goodShare ? side.range(m.price.min, 0.94) : side.range(0.96, m.price.max);
      lots.push({ id: nextLotId++, species: kind.id, level, price: Math.max(1, coins(value * factor)), person: side.int(customers.people.names.length), character: pickCharacter().id, hobby: customers.hobbies[side.int(customers.hobbies.length)]?.id ?? '', sold: false, hobbyDone: false, bargained: false });
    }
    st.market = { lots, refreshIn: side.range(m.refreshSec.min, m.refreshSec.max) };
    commit();
    emit({ type: 'marketNew' });
  }
  function runMarket(dt: number): void {
    const mk = s().market;
    mk.refreshIn -= dt;
    if (mk.refreshIn <= 0 || !mk.lots.length) stockMarket();
  }

  function canBuyEgg(eggId = basicEgg): BuyCheck {
    const egg = eggData(eggId);
    const price = egg?.price.coins ?? 0;
    if (!egg || !eggOpen(egg)) return { ok: false, reason: 'locked', price };
    const incubator = s().incubators.findIndex((i) => !i.egg);
    if (incubator < 0) return { ok: false, reason: 'busy', price };
    if (s().coins + 1e-9 < price) return { ok: false, reason: 'coins', price };
    return { ok: true, incubator, price };
  }

  function buyEggBy(eggId: string, by: 'player' | 'helper'): boolean {
    const check = canBuyEgg(eggId);
    if (!check.ok) {
      if (by === 'player') emit({ type: 'denied', action: 'buyEgg', reason: check.reason });
      return false;
    }
    s().coins -= check.price;
    if (by === 'player') {
      s().flags[FLAGS.bought] = true;
      delete s().flags[`egg_new_${eggId}`];
    }
    placeEgg(check.incubator, eggId, false);
    // FB-08: the courier opens the eggs it brought; the player's own wait for the tap.
    if (by === 'helper') s().incubators[check.incubator]!.auto = true;
    commit({ flush: true });
    emit({ type: 'eggBought', incubator: check.incubator, egg: eggId, price: check.price, by });
    emit({ type: 'change' });
    return true;
  }

  /** «My eggs» go into free incubators by themselves (the first kind first). */
  function placeMine(): void {
    const mine = s().myEggs;
    for (let spot = eggSpot(); spot >= 0; spot = eggSpot()) {
      const id = Object.keys(mine).find((k) => (mine[k] ?? 0) > 0 && eggData(k));
      if (!id) return;
      mine[id] = (mine[id] ?? 0) - 1;
      if ((mine[id] ?? 0) <= 0) delete mine[id];
      placeEgg(spot, id, false);
      const gifts = s().giftEggs ?? {};
      if ((gifts[id] ?? 0) > 0) {
        gifts[id] = (gifts[id] ?? 0) - 1;
        if ((gifts[id] ?? 0) <= 0) delete gifts[id];
        s().incubators[spot]!.free = true;
      }
      commit({ flush: true });
      emit({ type: 'eggBought', incubator: spot, egg: id, price: 0, by: 'gift' });
      emit({ type: 'change' });
    }
  }

  function placeEgg(index: number, eggId: string, waiting: boolean): void {
    const inc = s().incubators[index];
    if (!inc) return;
    Object.assign(inc, emptyIncubator(), { egg: eggId, startedAt: store.state.savedAt, waiting });
  }

  function hatch(index: number, by: 'tap' | 'self' = 'self'): void {
    const inc = s().incubators[index];
    const egg = inc?.egg ? eggData(inc.egg) : undefined;
    if (!inc || !egg) return;
    const st = s();
    // The first minute (docs/01, section 4): the first creature is common, the second one rare.
    const forced = st.stats.hatched === 0 ? content.ftue.firstRarity : st.stats.hatched === 1 && !st.flags[FLAGS.done] ? content.ftue.secondRarity : null;
    // The first egg of a dearer kind gives at least its firstRarity (once per kind, flag first_<egg>).
    const firstOf = egg.firstRarity && !st.flags[`first_${egg.id}`] ? egg.firstRarity : null;
    if (egg.firstRarity) st.flags[`first_${egg.id}`] = true;
    let rarity = forced ?? pickRarity(careChances(egg.chances, careOf(inc), egg.careTop ?? eggs.care.topShare), rng.next());
    if (!forced && firstOf && RARITY_RANK[rarity] < RARITY_RANK[firstOf]) rarity = firstOf;
    // M4-07: the egg of the day hatches the species of the day, dearer and settling in for a while.
    const dayKind = egg.special === 'daily' ? daySpecies(st.daily.day) : undefined;
    const kind = dayKind ?? pickSpecies(species, rarity, rng.next());
    st.stats.hatched += 1;
    const uid = `c${st.stats.hatched.toString(36)}${rng.int(1296).toString(36)}`;
    // M4-25: a mark now and then — not on the first two (the first minute is the same for everyone) nor on the anomaly of the day.
    const mark = forced || dayKind ? undefined : markFor(uid);
    // FB-02: the value table of the egg; a free egg (no coin price: a gift, a reward, the egg of the day) is worth at most rewardCap.
    let mult = dayKind ? dayMult(kind, egg) : hatchMult(egg, kind.rarity, species, incomeNow());
    if (egg.price.coins <= 0 || inc.free) mult = Math.min(mult, rewardCap() / kind.basePrice);
    st.creatures.push({ uid, species: kind.id, level: 1, fed: 0, hatchedAt: st.savedAt, age: 0, mult, ...(dayKind ? { hold: content.calendar.daily.holdMinutes * 60 } : {}), ...(mark ? { mark } : {}) });
    // M4-21: twins — the egg of the event gives two of a kind (the second waits in the inventory).
    if (activeOf('twins')) {
      st.creatures.push({ uid: `${uid}t`, species: kind.id, level: 1, fed: 0, hatchedAt: st.savedAt, age: 0, mult });
      twinsDone = true;
    }
    // FB-08: the first tapped hatches after the first minute are counted (marks tap_hatch_N): the finger shows until then.
    if (by === 'tap' && st.flags[FLAGS.done])
      for (let n = 1; n <= content.ftue.fingerHatches; n++)
        if (!st.flags[`tap_hatch_${n}`]) {
          st.flags[`tap_hatch_${n}`] = true;
          break;
        }
    // Tapped (UB-03): the player decides in the result (keep, sell now, to the shop). By itself (helpers, away) it goes on sale if there is room.
    Object.assign(inc, emptyIncubator());
    if (by === 'self') listIfRoom(uid);
    const entry = (st.collection[kind.id] ??= { seen: 0, hatched: 0, sold: 0 });
    entry.seen += 1;
    entry.hatched += 1;
    st.flags[`seen_rarity_${kind.rarity}`] = true;
    checkRows();
    const done = st.stats.hatched >= 2 && !st.flags[FLAGS.done];
    if (done) st.flags[FLAGS.done] = true;
    commit({ flush: true });
    emit({ type: 'hatched', incubator: index, uid, species: kind.id, rarity: kind.rarity, by, egg: egg.id });
    if (done) emit({ type: 'ftueDone' });
    if (twinsDone) {
      twinsDone = false;
      emit({ type: 'twins', species: kind.id });
      endEvent('done');
    }
    emit({ type: 'change' });
  }

  /** Incubators follow the incubator upgrade (1 + bought × perLevel), also for saves made before a purchase. */
  function syncIncubators(): void {
    const u = content.upgrades.upgrades.find((x) => x.effect.type === 'slots');
    const want = 1 + (u && u.effect.type === 'slots' ? upgradeLevel(u.id) * u.effect.perLevel : 0);
    const list = s().incubators;
    while (list.length < want) list.push(emptyIncubator());
  }
  syncIncubators();

  function upgradeView(id: string): UpgradeView | null {
    const u = content.upgrades.upgrades.find((x) => x.id === id);
    if (!u) return null;
    const level = upgradeLevel(id);
    const maxed = level >= u.levels;
    const price = maxed ? 0 : upgradePrice(u, level);
    const wallet = u.currency === 'crystals' ? s().crystals : s().coins;
    return { id, level, levels: u.levels, price, affordable: !maxed && wallet + 1e-9 >= price, maxed, fresh: Boolean(s().flags[`up_new_${id}`]) };
  }

  // Saves from before M3 kept every creature on the showcase: they all start on sale (as many as there are slots).
  if (!s().flags.showcase_m3) {
    const st = s();
    const known = new Set(st.creatures.map((c) => c.uid));
    st.showcase = st.showcase.filter((u) => known.has(u));
    if (!st.showcase.length) st.showcase = st.creatures.slice(0, showcaseSlots()).map((c) => c.uid);
    st.flags.showcase_m3 = true;
  }
  // The starter egg (docs/01, section 4): already in the incubator on the very first visit, waiting for a tap.
  {
    const st = s();
    if (!st.flags[FLAGS.starter] && st.stats.hatched === 0 && st.creatures.length === 0 && st.incubators[0] && !st.incubators[0].egg) {
      placeEgg(0, basicEgg, content.ftue.starterWaitsForTap);
      st.flags[FLAGS.starter] = true;
      commit({ flush: true });
    }
  }

  openShop = new Set(openShopIds());

  const game: Game = {
    store,
    content,
    events,
    get state() {
      return s();
    },
    canBuyEgg,
    eggList() {
      return eggs.eggs
        .filter(eggOpen)
        .sort((a, b) => a.price.coins - b.price.coins)
        .map((e) => ({ id: e.id, check: canBuyEgg(e.id), fresh: Boolean(s().flags[`egg_new_${e.id}`]) }));
    },
    buyEgg(eggId = basicEgg) {
      return buyEggBy(eggId, 'player');
    },
    sellNow,
    market() {
      const mk = s().market;
      return {
        refreshIn: Math.max(0, mk.refreshIn),
        lots: mk.lots.map((l) => {
          const value = lotValue(l);
          return { ...l, rarity: speciesData(l.species)?.rarity ?? 'common', value, verdict: verdict(l.price, value) };
        }),
      };
    },
    refreshMarket() {
      idleSec = 0;
      stockMarket();
      emit({ type: 'change' });
    },
    buyLot(id, price) {
      idleSec = 0;
      const st = s();
      const lot = st.market.lots.find((l) => l.id === id && !l.sold);
      const pay = Math.max(1, Math.round(price ?? lot?.price ?? 0));
      if (!lot || st.coins + 1e-9 < pay) {
        emit({ type: 'denied', action: 'buyEgg', reason: lot ? 'coins' : 'locked' });
        return false;
      }
      st.coins -= pay;
      lot.sold = true;
      const uid = `m${lot.id.toString(36)}${side.int(1296).toString(36)}`;
      st.creatures.push({ uid, species: lot.species, level: lot.level, fed: 0, hatchedAt: st.savedAt, age: 0 });
      (st.collection[lot.species] ??= { seen: 0, hatched: 0, sold: 0 }).seen += 1;
      checkRows();
      listIfRoom(uid);
      commit({ flush: true });
      emit({ type: 'lotBought', id, uid, price: pay });
      emit({ type: 'change' });
      return true;
    },
    redeemCode(input) {
      const code = input.trim().toUpperCase().replace(/\s+/g, '');
      const item = content.codes.codes.find((c) => c.code === code);
      if (!item) return 'unknown';
      if (s().codes.includes(code)) return 'used';
      s().codes.push(code);
      giveReward(item.reward, 'code');
      return 'ok';
    },
    workView() {
      const lv = s().work;
      const w = content.work;
      return { level: lv, pay: workPay(lv, w), price: lv < w.levels ? workPrice(lv, w) : null };
    },
    workTap() {
      idleSec = 0;
      const pay = workPay(s().work, content.work);
      s().coins += pay;
      s().stats.taps += 1;
      commit();
      emit({ type: 'work', coins: pay });
      emit({ type: 'change' });
      return pay;
    },
    workUp() {
      idleSec = 0;
      const st = s();
      const w = content.work;
      if (st.work >= w.levels) return false;
      const price = workPrice(st.work, w);
      if (st.coins + 1e-9 < price) {
        emit({ type: 'denied', action: 'buyEgg', reason: 'coins' });
        return false;
      }
      st.coins -= price;
      st.work += 1;
      commit({ flush: true });
      emit({ type: 'workUp', level: st.work });
      emit({ type: 'change' });
      return true;
    },
    giftsView(today) {
      const g = s().gifts;
      return { subscribed: { ...g.subscribed }, reviewed: g.reviewed, day: g.days % content.gifts.daily.length, dailyReady: g.lastDay !== today };
    },
    claimSubscribe(id) {
      const g = s().gifts;
      const item = content.gifts.subscribe.find((x) => x.id === id);
      if (!item || g.subscribed[id]) return false;
      g.subscribed[id] = true;
      giveReward(item.reward, 'subscribe');
      return true;
    },
    claimReview() {
      const g = s().gifts;
      if (g.reviewed) return false;
      g.reviewed = true;
      giveReward(content.gifts.review.reward, 'review');
      return true;
    },
    claimDaily(today) {
      const g = s().gifts;
      if (!today || g.lastDay === today) return false;
      const item = content.gifts.daily[g.days % content.gifts.daily.length];
      if (!item) return false;
      g.days += 1;
      g.lastDay = today;
      giveReward(item.reward, 'daily');
      return true;
    },
    lotHobby(id) {
      idleSec = 0;
      const lot = s().market.lots.find((l) => l.id === id && !l.sold);
      if (!lot || lot.hobbyDone) return 0;
      const { min, max } = content.market.hobbyDiscount;
      const off = side.range(min, max);
      lot.price = Math.max(1, coins(lot.price * (1 - off)));
      lot.hobbyDone = true;
      commit();
      emit({ type: 'change' });
      return off;
    },
    lotBargain(id, price) {
      idleSec = 0;
      const lot = s().market.lots.find((l) => l.id === id && !l.sold);
      const ch = lot ? customers.characters.find((c) => c.id === lot.character) : undefined;
      if (!lot || !ch || lot.bargained) return 'done';
      const want = Math.max(1, Math.round(price));
      lot.bargained = true;
      if (want < lot.price * (1 - ch.give) - 1e-9) {
        commit();
        emit({ type: 'change' });
        return 'no';
      }
      if (s().coins + 1e-9 < want) {
        lot.bargained = false;
        return 'coins';
      }
      return game.buyLot(id, want) ? 'yes' : 'coins';
    },
    chats() {
      return [...s().chats].reverse();
    },
    chatSell(id) {
      idleSec = 0;
      const chat = openChat(id);
      return chat ? sellChat(chat, 1, 'player') : false;
    },
    chatDecline(id) {
      idleSec = 0;
      const chat = openChat(id);
      if (!chat) return false;
      chatGone(chat, true);
      emit({ type: 'chatReply', id, ctx: 'bye' });
      return true;
    },
    canCounter(id) {
      const chat = openChat(id);
      return Boolean(chat && !chat.countered && chat.customer !== GOLDEN && (customers.chat.firstCounter || s().stats.deals > 0));
    },
    chatCounter(id) {
      idleSec = 0;
      const chat = openChat(id);
      const cr = chat ? s().creatures.find((x) => x.uid === chat.uid) : undefined;
      const ch = chat ? characterOf(chat.character) : undefined;
      if (!chat || !cr || !ch || !game.canCounter(id)) return false;
      const ask = Math.max(1, coins(appraisal(cr) * (cr.askShare ?? 1)));
      // The door mat makes buyers give a bit more (UB-05).
      const give = ch.give + effectSum('give');
      chat.countered = true;
      chat.lines.push({ from: 'me', ctx: 'counter', i: 0, n: ask });
      if (ask <= chat.offer * (1 + give)) {
        chat.offer = Math.max(chat.offer, ask);
        chat.lines.push({ from: 'them', ctx: 'accept', i: pickLineIndex(ch.id, 'accept') });
      } else {
        const last = Math.max(chat.offer, coins(chat.offer * (1 + give)));
        chat.lines.push({ from: 'them', ctx: 'refuse', i: pickLineIndex(ch.id, 'refuse') }, { from: 'them', ctx: 'last', i: pickLineIndex(ch.id, 'last'), n: last });
        chat.offer = last;
      }
      s().stats.haggles += 1;
      commit();
      emit({ type: 'chatReply', id, ctx: chat.lines[chat.lines.length - 1]!.ctx });
      emit({ type: 'change' });
      return true;
    },
    chatRead(id) {
      const chat = s().chats.find((c) => c.id === id);
      if (!chat || !chat.unread) return;
      chat.unread = false;
      commit();
      emit({ type: 'change' });
    },
    list(uid) {
      idleSec = 0;
      const ok = listIfRoom(uid);
      if (!ok) emit({ type: 'denied', action: 'buyEgg', reason: 'full' });
      commit({ flush: true });
      emit({ type: 'change' });
      return ok;
    },
    unlist(uid) {
      const st = s();
      if (!st.showcase.includes(uid)) return false;
      st.showcase = st.showcase.filter((u) => u !== uid);
      if (selectedUid === uid) selectedUid = null;
      commit({ flush: true });
      emit({ type: 'change' });
      return true;
    },
    setAsk(uid, share) {
      const cr = s().creatures.find((x) => x.uid === uid);
      if (!cr || !Number.isFinite(share)) return false;
      const { min, max } = content.market.slider;
      cr.askShare = Math.min(max, Math.max(min, share));
      commit();
      emit({ type: 'change' });
      return true;
    },
    eggShop() {
      const st = s();
      const show = eggs.eggs.filter((e) => !e.special && e.section !== 'reward');
      return {
        my: Object.entries(st.myEggs)
          .filter(([id, n]) => n > 0 && eggData(id))
          .map(([id, count]) => ({ id, count })),
        eggs: show.map((e) => {
          const open = e.section === 'free' ? eggUnlocked(e, facts()) : eggOpen(e);
          return {
            id: e.id,
            section: e.section,
            price: e.price.coins,
            open,
            affordable: open && st.coins + 1e-9 >= e.price.coins,
            fresh: Boolean(st.flags[`egg_new_${e.id}`]),
            freeIn: e.section === 'free' ? Math.max(0, st.freeIn[e.id] ?? 0) : null,
          };
        }),
      };
    },
    buyEggs(eggId, n) {
      const egg = eggData(eggId);
      const count = Math.max(1, Math.floor(n));
      if (!egg || !eggOpen(egg)) {
        emit({ type: 'denied', action: 'buyEgg', reason: 'locked' });
        return false;
      }
      const total = egg.price.coins * count;
      if (s().coins + 1e-9 < total) {
        emit({ type: 'denied', action: 'buyEgg', reason: 'coins' });
        return false;
      }
      const st = s();
      st.coins -= total;
      st.flags[FLAGS.bought] = true;
      delete st.flags[`egg_new_${eggId}`];
      let stored = 0;
      for (let i = 0; i < count; i++) {
        const spot = eggSpot();
        if (spot >= 0) {
          placeEgg(spot, eggId, false);
          emit({ type: 'eggBought', incubator: spot, egg: eggId, price: egg.price.coins, by: 'player' });
        } else stored += 1;
      }
      if (stored) st.myEggs[eggId] = (st.myEggs[eggId] ?? 0) + stored;
      commit({ flush: true });
      if (stored) emit({ type: 'eggsStored', egg: eggId, count: stored });
      emit({ type: 'change' });
      return true;
    },
    claimFree(eggId) {
      const egg = eggData(eggId);
      const st = s();
      if (!egg || egg.section !== 'free' || !egg.freeEverySec || !eggUnlocked(egg, facts()) || (st.freeIn[eggId] ?? 0) > 0) return false;
      st.freeIn[eggId] = egg.freeEverySec;
      st.myEggs[eggId] = (st.myEggs[eggId] ?? 0) + 1;
      // Круг правок FB-3 п. 6: a gift egg taken is the first minute's «new egg» too.
      st.flags[FLAGS.bought] = true;
      commit({ flush: true });
      emit({ type: 'freeEgg', egg: eggId });
      placeMine();
      emit({ type: 'change' });
      return true;
    },
    giveEggs(eggId, n) {
      if (!eggData(eggId) || n < 1) return;
      s().myEggs[eggId] = (s().myEggs[eggId] ?? 0) + Math.floor(n);
      commit({ flush: true });
      emit({ type: 'eggsStored', egg: eggId, count: Math.floor(n) });
      placeMine();
      emit({ type: 'change' });
    },
    tapIncubator(index) {
      idleSec = 0;
      const inc = s().incubators[index];
      if (!inc) return;
      if (!inc.egg) {
        game.buyEgg();
        return;
      }
      s().stats.taps += 1;
      // UB-03: the very first egg opens with one tap (ftue.json firstEggOneTap) — the case show starts at once.
      if (eggReady(inc)) {
        hatch(index, 'tap');
        return;
      }
      if (inc.waiting && s().stats.hatched === 0 && content.ftue.firstEggOneTap) {
        // The tap is the player's first touch (the funnel's first_tap), then the egg opens at once.
        emit({ type: 'eggTap', incubator: index, started: true });
        hatch(index, 'tap');
        return;
      }
      const started = inc.waiting;
      inc.waiting = false;
      inc.progress += eggs.tapSpeedupSec;
      // Warmth (care): taps while the egg is still hatching.
      inc.careTaps = (inc.careTaps ?? 0) + 1;
      commit();
      emit({ type: 'eggTap', incubator: index, started });
    },
    feedEgg(index) {
      const inc = s().incubators[index];
      const price = inc ? feedPrice(inc) : null;
      if (!inc || price === null || s().coins < price) return false;
      s().coins -= price;
      inc.careFed = (inc.careFed ?? 0) + 1;
      commit({ flush: true });
      emit({ type: 'eggFed', incubator: index, price, level: careLevel(careOf(inc), eggs.care) });
      emit({ type: 'change' });
      return true;
    },
    tapCreature(uid) {
      idleSec = 0;
      const st = s();
      const cr = st.creatures.find((x) => x.uid === uid);
      if (!cr) return;
      const changed = selectedUid !== uid;
      selectedUid = uid;
      st.stats.taps += 1;
      // M6-20: a tickle — taps quick taps on the same creature (01b §2); the run starts again after it.
      const tk = content.secrets.tickle;
      const run = (tickles[uid] ??= []);
      run.push(clock);
      while (run.length && clock - run[0]! > tk.sec) run.shift();
      if (run.length >= tk.taps) {
        run.length = 0;
        const paid = clock - (tickledAt[uid] ?? -Infinity) >= tk.cooldownSec ? tk.coins : 0;
        if (paid) tickledAt[uid] = clock;
        st.coins += paid;
        st.stats.coinsEarned += paid;
        emit({ type: 'tickle', uid, coins: paid });
      }
      if (feed(cr, 1 + effectSum('feedPerTap'), 'tap') || changed) emit({ type: 'change' });
    },
    selected,
    tick(dt) {
      idleSec += dt;
      const st = s();
      if (!quiet && dt > 0) {
        // FB-15: whole minutes of live play; the income is their mean without the best one.
        minuteCoins += liveEarned;
        liveEarned = 0;
        minuteSec += dt;
        if (minuteSec >= 60) {
          minuteSec -= 60;
          const mins = [...(st.incomeMinutes ?? []), minuteCoins].slice(-eggs.income.windowMin);
          minuteCoins = 0;
          st.incomeMinutes = mins;
          st.stats.income = incomeOf(mins, eggs.income.spikeMedians);
        }
      }
      runPoint(dt);
      // M4-20: the finds look at the save once a second (cheap: 30 conditions).
      findsIn -= dt;
      if (findsIn <= 0 && !quiet) {
        findsIn = 1;
        checkFinds();
      }
      for (const cr of onSale()) cr.age = (cr.age ?? 0) + dt;
      for (const cr of st.creatures) if (cr.hold && (cr.hold = Math.max(0, cr.hold - dt)) === 0) delete cr.hold;
      // No dead end (genre standard): an empty shop without coins for the cheapest egg gets one for free.
      if (st.creatures.length === 0 && st.incubators[0] && !st.incubators.some((i) => i.egg) && !Object.keys(st.myEggs).length && st.stats.hatched > 0) {
        const cheapest = Math.min(...eggs.eggs.filter(eggOpen).map((e) => e.price.coins));
        if (st.coins + 1e-9 < cheapest) {
          placeEgg(0, eggs.rescueEgg, false);
          commit({ flush: true });
          emit({ type: 'rescueEgg', incubator: 0 });
          emit({ type: 'change' });
        }
      }
      for (let i = 0; i < st.incubators.length; i++) {
        const inc = st.incubators[i]!;
        if (!inc.egg || inc.waiting) continue;
        const egg = eggData(inc.egg);
        if (!egg) {
          Object.assign(inc, emptyIncubator());
          continue;
        }
        if (eggReady(inc)) {
          // Ready: it ripens while it waits for a tap. Away it hatches at once (as in M2); the courier opens it once the player
          // leaves the shop alone for helperIdleSec (a playing player sees the show); an idle shop without one — after selfSec.
          inc.ripeSec = (inc.ripeSec ?? 0) + dt;
          const helper = owned('autoBuyEgg') && idleSec >= eggs.care.ripe.helperIdleSec;
          // FB-08: with selfOpen off the player's egg waits for the tap — it never opens by itself, away neither; the eggs the
          // courier brought (the shop's automation, inc.auto) open as before.
          if ((inc.auto || eggs.care.ripe.selfOpen) && (quiet || helper || inc.ripeSec >= eggs.care.ripe.selfSec)) hatch(i);
          continue;
        }
        inc.elapsed += dt;
        inc.progress += dt;
        if (eggReady(inc)) {
          inc.ripeSec = 0;
          if (quiet) hatch(i);
          else emit({ type: 'eggReady', incubator: i });
        }
      }
      // Free egg timers (M3-04) and «my eggs» into free incubators.
      for (const id of Object.keys(st.freeIn)) st.freeIn[id] = Math.max(0, (st.freeIn[id] ?? 0) - dt);
      if (st.ads) {
        st.ads.eggIn = Math.max(0, st.ads.eggIn - dt);
        if (!quiet) st.ads.boostLeft = Math.max(0, st.ads.boostLeft - dt);
      }
      if (Object.keys(st.myEggs).length) placeMine();
      // Buyers write while the player is away too: the seller helper answers them (offline income).
      runChats(dt);
      if (!quiet) runMarket(dt);
      runHelpers(dt);
      runClock(dt);
      runOrders(dt);
      if (!quiet) {
        clock += dt;
        checkShop(dt);
        runEvents(dt);
      }
    },
    view() {
      return {
        city: s().prestige + 1,
        incubators: s().incubators.map((inc) => {
          const care = careOf(inc);
          return {
            egg: inc.egg,
            waiting: inc.waiting,
            share: inc.egg ? hatchShare(inc.progress, needFor(inc.egg)) : 0,
            ready: eggReady(inc),
            care,
            careLevel: careLevel(care, eggs.care),
            feedPrice: feedPrice(inc),
            leftSec: inc.egg && !eggReady(inc) ? Math.max(0, needFor(inc.egg) - inc.progress, Math.min(needFor(inc.egg), eggs.minHatchSec) - inc.elapsed) : 0,
          };
        }),
        inventory: s()
          .creatures.filter((x) => !s().showcase.includes(x.uid) && !talkingAbout(x.uid))
          .map((x) => creatureView(x)),
        creatures: onSale().map((x) => creatureView(x)),
        talking: openChats()
          .map((c) => s().creatures.find((x) => x.uid === c.uid))
          .filter((x): x is Creature => x !== undefined)
          .map((x) => creatureView(x)),
        selected: selected(),
        slots: showcaseSlots(),
        queueSize: queueSize(),
        order: owned('orders') ? s().order : null,
        event: active ? { id: active.data.id, kind: active.data.kind, left: active.left, coins: active.coins.map(({ id, x, y }) => ({ id, x, y })), uid: active.uid, egg: active.egg } : null,
        decor: decorLevels(),
        queue: openChats()
          .slice(0, queueSize())
          .map((c) => ({ id: c.id, customer: c.customer || (openDistricts()[0]?.customer.id ?? ''), person: c.person, ...looks(c.person), uid: c.uid, offer: c.offer })),
      };
    },
    upgradeList() {
      const f = facts();
      return content.upgrades.shop
        .filter((id) => unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, f))
        .map(upgradeView)
        .filter((x): x is UpgradeView => x !== null);
    },
    buyUpgrade(id) {
      const listed = content.upgrades.shop.includes(id) && unlockMet(content.upgrades.upgrades.find((u) => u.id === id)?.unlock, facts());
      const view = listed ? upgradeView(id) : null;
      const u = content.upgrades.upgrades.find((x) => x.id === id);
      if (!view || !u) {
        emit({ type: 'denied', action: 'upgrade', reason: 'locked' });
        return false;
      }
      if (view.maxed || !view.affordable) {
        emit({ type: 'denied', action: 'upgrade', reason: view.maxed ? 'max' : 'coins' });
        return false;
      }
      const st = s();
      if (u.currency === 'crystals') st.crystals -= view.price;
      else st.coins -= view.price;
      st.upgrades[id] = view.level + 1;
      syncIncubators();
      commit({ flush: true });
      emit({ type: 'upgradeBought', id, level: view.level + 1, price: view.price });
      emit({ type: 'change' });
      return true;
    },
    districts() {
      return openDistricts().map((d) => d.id);
    },
    tapEvent() {
      const ev = active;
      if (!ev) return;
      if (ev.data.kind === 'merchant') {
        emit({ type: 'merchantOpen' });
        return;
      }
      const st = s();
      const pay = (coins: number, crystals = 0): void => {
        const c = Math.max(0, Math.round(coins));
        st.coins += c;
        st.stats.coinsEarned += c;
        st.crystals += crystals;
        commit({ flush: true });
        emit({ type: 'eventGift', coins: c, crystals });
        endEvent('done');
      };
      const city = cityMult(st.prestige, content.upgrades.prestige.incomeBonusPerPrestige);
      const data = ev.data;
      // M4-21: the things to tap — the inspector's note, the photographer, the pie, the lampbug's glow, the cat on the sign.
      if (data.kind === 'inspector') return pay(data.perCreature * onSale().length * city);
      if (data.kind === 'photo') {
        const uid = dearest();
        const cr = uid ? st.creatures.find((x) => x.uid === uid) : undefined;
        return pay(cr ? appraisal(cr) * data.share : 0);
      }
      if (data.kind === 'pie' || data.kind === 'mouse') return pay(randInt(data.coins) * city);
      if (data.kind === 'blink') {
        const bug = st.creatures.find((x) => x.uid === ev.uid);
        return pay((bug?.level ?? 1) * data.coinsPerLevel * city);
      }
      if (data.kind === 'catWalk') return rng.next() < data.crystalChance ? pay(0, 1) : pay(randInt(data.coins) * city);
      // M6-21: a tap on the parade takes one of the rolling eggs (a random open one), like the egg at the door.
      if (data.kind === 'parade') {
        const open = data.eggs.filter((id) => eggs.eggs.some((x) => x.id === id && eggOpen(x)));
        ev.egg = open[rng.int(open.length)] ?? basicEgg;
      }
      if ((ev.data.kind !== 'doorEgg' && ev.data.kind !== 'parade') || !ev.egg) return;
      const at = eggSpot();
      if (at >= 0) {
        placeEgg(at, ev.egg, false);
        emit({ type: 'eggBought', incubator: at, egg: ev.egg, price: 0, by: 'gift' });
      } else {
        // No room: the gift comes as the egg's price (nothing is ever lost).
        const value = eggData(ev.egg)?.price.coins ?? 0;
        st.coins += value;
        st.stats.coinsEarned += value;
        emit({ type: 'eventGift', coins: value });
      }
      commit({ flush: true });
      endEvent('done');
    },
    tapEventCoin(id) {
      const ev = active;
      const coin = ev?.coins.find((c) => c.id === id);
      if (!ev || !coin) return;
      ev.coins = ev.coins.filter((c) => c.id !== id);
      s().coins += coin.value;
      s().stats.coinsEarned += coin.value;
      commit();
      emit({ type: 'eventCoin', id, value: coin.value });
      if (!ev.coins.length) endEvent('done');
    },
    tapThing(target) {
      const st = s();
      for (const sec of content.secrets.secrets.filter((x) => x.target === target)) {
        const count = (st.secrets[sec.id] = (st.secrets[sec.id] ?? 0) + 1);
        const streak = (streaks[sec.id] ??= { n: 0, at: -Infinity });
        streak.n = clock - streak.at <= content.secrets.streakSec ? streak.n + 1 : 1;
        streak.at = clock;
        emit({ type: 'thingTapped', target, first: sec.first, count });
        sec.steps.forEach((step, i) => {
          const hit = step.streak ? streak.n === step.at : count === step.at;
          if (!hit) return;
          const flag = `secret_${sec.id}_${i}`;
          const repeat = Boolean(st.flags[flag]);
          const coinsWon = repeat ? 0 : step.coins;
          st.flags[flag] = true;
          // M4-20: the easter egg's step is a mark the finds read.
          st.flags[`seen_secret_${sec.id}_${step.show}`] = true;
          st.coins += coinsWon;
          st.stats.coinsEarned += coinsWon;
          if (step.streak) streak.n = 0;
          emit({ type: 'secret', id: sec.id, target, show: step.show, coins: coinsWon, repeat });
        });
      }
      commit();
    },
    setShopName(raw) {
      const rule = content.secrets.shopName;
      const name = raw.replace(/\s+/g, ' ').trim();
      if (!name) return 'empty';
      if ([...name].length > rule.maxLength) return 'long';
      if (nameBlocked(name, rule.blocked)) return 'blocked';
      const st = s();
      st.shopName = name;
      const key = normalWord(name);
      const secret = rule.secret.some((x) => normalWord(x.ru) === key || normalWord(x.en) === key);
      if (secret) st.flags.seen_secret_name = true;
      commit({ flush: true });
      emit({ type: 'shopNamed', name, secret });
      emit({ type: 'change' });
      return 'ok';
    },
    chime(hour) {
      const ch = content.secrets.chime;
      if (!ch.hours.includes(hour)) return false;
      emit({ type: 'chime', hour, fed: ch.fed });
      for (const cr of [...s().creatures]) feed(cr, ch.fed, 'chime');
      commit();
      return true;
    },
    merchantOffer,
    merchantBuy(choice) {
      const offer = merchantOffer()?.[choice];
      if (!offer) return false;
      if (!offer.check.ok) {
        emit({ type: 'denied', action: 'buyEgg', reason: offer.check.reason });
        return false;
      }
      s().coins -= offer.price;
      placeEgg(offer.check.incubator, offer.egg, false);
      commit({ flush: true });
      emit({ type: 'eggBought', incubator: offer.check.incubator, egg: offer.egg, price: offer.price, by: 'merchant' });
      endEvent('done');
      return true;
    },
    nextGoal() {
      const st = s();
      // M4-06: a move that is ready is the goal of the moment.
      const ready = game.rebirthView();
      if (ready.ready) return { kind: 'rebirth', id: 'rebirth', have: ready.have, need: ready.need, unit: 'coins' };
      const goals: GoalView[] = [];
      for (const u of game.upgradeList()) {
        if (u.maxed || u.affordable) continue;
        const crystals = content.upgrades.upgrades.find((x) => x.id === u.id)?.currency === 'crystals';
        goals.push({ kind: 'upgrade', id: u.id, have: crystals ? st.crystals : st.coins, need: u.price, unit: crystals ? 'crystals' : 'coins' });
      }
      for (const d of content.customers.districts) {
        if (d.unlock.type === 'deals' && st.stats.deals < d.unlock.count) goals.push({ kind: 'district', id: d.id, have: st.stats.deals, need: d.unlock.count, unit: 'deals' });
      }
      for (const e of eggs.eggs) {
        if (e.section === 'ladder' && !e.special && e.unlock.type === 'deals' && st.stats.deals < e.unlock.count) goals.push({ kind: 'egg', id: e.id, have: st.stats.deals, need: e.unlock.count, unit: 'deals' });
        // M4-08: an open ladder egg not bought yet («New!») is a goal of its own — the top of the ladder is the week goal of a city.
        if (e.section === 'ladder' && st.flags[`egg_new_${e.id}`] && eggOpen(e) && st.coins < e.price.coins) goals.push({ kind: 'egg', id: e.id, have: st.coins, need: e.price.coins, unit: 'coins' });
      }
      // UB-08: the next seller level opens eggs, districts and upgrades.
      const rep = game.reputation();
      if (rep.next !== null) goals.push({ kind: 'level', id: String(rep.level + 1), have: rep.xp, need: rep.next, unit: 'xp' });
      const share = (g: GoalView): number => (g.need > 0 ? g.have / g.need : 1);
      const best = goals.reduce<GoalView | null>((a, g) => (!a || share(g) > share(a) + 1e-9 ? g : a), null);
      const city = game.rebirthView();
      return best ?? { kind: 'rebirth', id: 'rebirth', have: city.have, need: city.need, unit: 'coins' };
    },
    eventsPossible: () => possibleEvents(),
    startEventNow(id) {
      if (active || !possibleEvents().includes(id)) return false;
      const keep = content.events.events;
      startEvent(keep.filter((e) => e.id === id));
      return active !== null;
    },
    finds() {
      const st = s();
      return content.achievements.items.map((f) => ({ id: f.id, got: Boolean(st.flags[`find_${f.id}`]), claimed: Boolean(st.flags[`find_claimed_${f.id}`]), hidden: f.hidden, ...findHave(f) }));
    },
    claimFind(id) {
      const st = s();
      const f = content.achievements.items.find((x) => x.id === id);
      if (!f || !st.flags[`find_${id}`] || st.flags[`find_claimed_${id}`]) return false;
      st.flags[`find_claimed_${id}`] = true;
      st.coins += f.reward.coins ?? 0;
      st.crystals += f.reward.crystals ?? 0;
      commit({ flush: true });
      emit({ type: 'findClaimed', id, coins: f.reward.coins ?? 0, crystals: f.reward.crystals ?? 0 });
      emit({ type: 'change' });
      return true;
    },
    guestZone() {
      const st = s();
      const full = new Set(guestSets().map((x) => x.theme));
      return {
        open: unlockMet(content.decor.unlock, facts()),
        bonus: guestBonus(),
        upkeep: guestUpkeep(),
        unpaid: st.guest.unpaid,
        items: content.decor.items.map((x) => ({ id: x.id, owned: st.guest.items.includes(x.id), price: x.price, bargain: x.bargain, upkeep: x.upkeep, theme: x.theme, affordable: st.coins + 1e-9 >= x.price })),
        sets: content.decor.sets.map((x) => ({ theme: x.theme, done: full.has(x.theme), bonus: x.bonus })),
      };
    },
    buyGuest(id) {
      const st = s();
      const item = content.decor.items.find((x) => x.id === id);
      if (!item || st.guest.items.includes(id) || !unlockMet(content.decor.unlock, facts())) {
        emit({ type: 'denied', action: 'upgrade', reason: 'locked' });
        return false;
      }
      if (st.coins + 1e-9 < item.price) {
        emit({ type: 'denied', action: 'upgrade', reason: 'coins' });
        return false;
      }
      st.coins -= item.price;
      st.guest.items.push(id);
      commit({ flush: true });
      emit({ type: 'guestBought', id });
      emit({ type: 'change' });
      return true;
    },
    removeGuest(id) {
      const st = s();
      if (!st.guest.items.includes(id)) return false;
      st.guest.items = st.guest.items.filter((x) => x !== id);
      if (!st.guest.items.length) st.guest = { items: [], unpaid: false, due: 0 };
      commit({ flush: true });
      emit({ type: 'change' });
      return true;
    },
    setDay(day) {
      if (day === today) return;
      today = day;
      rollDay(day);
      emit({ type: 'change' });
    },
    dayView(day) {
      rollDay(day);
      const st = s();
      const kind = daySpecies(st.daily.day);
      return { species: kind?.id ?? '', rarity: kind?.rarity ?? 'common', egg: content.calendar.daily.eggId, eggTaken: st.daily.egg, mult: content.calendar.daily.priceMultiplier, holdMin: content.calendar.daily.holdMinutes, goals: dayGoals() };
    },
    claimDayEgg(day) {
      rollDay(day);
      const st = s();
      if (st.daily.egg || !daySpecies(st.daily.day) || !eggData(content.calendar.daily.eggId)) return false;
      st.daily.egg = true;
      giveReward({ egg: content.calendar.daily.eggId }, 'daily');
      return true;
    },
    rewardFor,
    claimDayGoal(day, id) {
      rollDay(day);
      const st = s();
      const g = dayGoals().find((x) => x.id === id);
      if (!g?.done || g.claimed) return false;
      st.daily.claimed.push(id);
      giveReward(g.reward, 'daily');
      return true;
    },
    mood() {
      const m = mood();
      return m ? { ...m, hotMult: content.market.mood.hot, coldMult: content.market.mood.cold } : null;
    },
    collection() {
      const st = s();
      const inShop = new Set(st.creatures.map((c) => c.species));
      const rows = RARITIES.map((r) => {
        const list = species.species
          .filter((x) => x.rarity === r)
          .map((x) => ({ id: x.id, status: (inShop.has(x.id) ? 'shop' : (st.collection[x.id]?.seen ?? 0) > 0 ? 'sold' : 'none') as CollectionStatus }));
        const have = list.filter((x) => x.status !== 'none').length;
        return { rarity: r, have, all: list.length, done: Boolean(st.flags[`row_${r}`]), bonus: content.collection.rowBonus[r], crystals: content.collection.rowCrystals[r], species: list };
      }).filter((row) => row.all > 0);
      return { have: rows.reduce((n, r) => n + r.have, 0), all: rows.reduce((n, r) => n + r.all, 0), rows };
    },
    rebirthView() {
      const st = s();
      const p = content.upgrades.prestige;
      const need = rebirthNeed(st.prestige, p);
      const have = Math.max(0, st.stats.coinsEarned - st.cityEarnedAt);
      return { city: st.prestige + 1, have, need, ready: have >= need, mult: cityMult(st.prestige, p.incomeBonusPerPrestige), nextMult: cityMult(st.prestige + 1, p.incomeBonusPerPrestige), startCoins: p.startCoins, giftEgg: p.giftEgg && eggData(p.giftEgg) ? p.giftEgg : '' };
    },
    rebirth() {
      if (!game.rebirthView().ready) {
        emit({ type: 'denied', action: 'rebirth', reason: 'locked' });
        return false;
      }
      const st = s();
      // M4-06: the shop moves to a new city — coins, upgrades, creatures, eggs, buyers and the seller level start over;
      // the collection, crystals, finds, gifts, the side job and settings stay; every creature is worth more from now on.
      st.prestige += 1;
      st.cityEarnedAt = st.stats.coinsEarned;
      st.coins = content.upgrades.prestige.startCoins;
      st.upgrades = {};
      st.helpers = {};
      st.creatures = [];
      st.showcase = [];
      st.myEggs = {};
      st.chats = [];
      st.chatIn = {};
      st.order = null;
      st.guest = { items: [], unpaid: false, due: 0 };
      st.stats.deals = 0;
      st.stats.xp = 0;
      st.incubators = [emptyIncubator()];
      for (const k of Object.keys(st.flags)) if (k.startsWith('egg_new_')) delete st.flags[k];
      syncIncubators();
      // The new city greets with an egg on the counter (M4-09: its gift egg when there is one) and its own new egg of the ladder top («New!»).
      const gift = content.upgrades.prestige.giftEgg && eggData(content.upgrades.prestige.giftEgg) ? content.upgrades.prestige.giftEgg : undefined;
      placeEgg(0, gift ?? basicEgg, false);
      for (const e of eggs.eggs) if (e.unlock.type === 'city' && eggOpen(e)) st.flags[`egg_new_${e.id}`] = true;
      stockMarket();
      commit({ flush: true });
      emit({ type: 'rebirth', city: st.prestige + 1, ...(gift ? { gift } : {}) });
      emit({ type: 'change' });
      return true;
    },
    reputation() {
      const xp = repXp();
      return { xp, ...repLevel(xp, content.reputation.levels) };
    },
    seenTab(tab) {
      const key = `tab_${tab}`;
      if (s().flags[key]) return false;
      s().flags[key] = true;
      commit();
      return true;
    },
    seenShop() {
      const st = s();
      let changed = false;
      for (const key of Object.keys(st.flags)) {
        if (!key.startsWith('up_new_')) continue;
        delete st.flags[key];
        changed = true;
      }
      if (changed) {
        commit();
        emit({ type: 'change' });
      }
    },
    freeSlots,
    showcaseSlots,
    adEggs(day) {
      const a = content.ads;
      if (!a) return [];
      const st = adsOf();
      const left = st.day === day ? Math.max(0, a.eggs.perDay - st.eggs) : a.eggs.perDay;
      const ladder = eggs.eggs.filter((e) => e.section === 'ladder' && eggOpen(e)).at(-1)?.id ?? basicEgg;
      return a.eggs.cards.map((c) => ({ id: c.id, egg: c.egg === 'ladder' ? ladder : c.egg, left, waitSec: st.eggIn }));
    },
    claimAdEgg(day, id) {
      const card = game.adEggs(day).find((c) => c.id === id);
      const a = content.ads;
      if (!card || !a || card.left <= 0 || card.waitSec > 0) return false;
      const st = adsOf();
      newDay(day);
      st.eggs += 1;
      st.eggIn = a.eggs.gapSec;
      // An ad egg is a free reward: it hatches in the gift prices (FB-15), like the egg of the gifts.
      s().giftEggs = { ...(s().giftEggs ?? {}), [card.egg]: (s().giftEggs?.[card.egg] ?? 0) + 1 };
      game.giveEggs(card.egg, 1);
      return true;
    },
    hatchNow(index) {
      const inc = s().incubators[index];
      if (!inc?.egg || eggReady(inc)) return false;
      const need = needFor(inc.egg);
      inc.waiting = false;
      inc.progress = Math.max(inc.progress, need);
      inc.elapsed = Math.max(inc.elapsed, Math.min(need, eggs.minHatchSec));
      inc.ripeSec = 0;
      commit({ flush: true });
      emit({ type: 'eggReady', incubator: index });
      emit({ type: 'change' });
      return true;
    },
    dealToDouble: () => (lastDeal ? { ...lastDeal } : null),
    adDouble() {
      const c = lastDeal?.coins ?? 0;
      if (c <= 0) return 0;
      lastDeal = null;
      s().coins += c;
      s().stats.coinsEarned += c;
      commit({ flush: true });
      emit({ type: 'change' });
      return c;
    },
    startBoost(day) {
      if (!content.ads || game.boostsLeft(day) <= 0) return false;
      newDay(day);
      const a = adsOf();
      a.boosts = (a.boosts ?? 0) + 1;
      a.boostLeft = content.ads.boost.sec;
      commit({ flush: true });
      emit({ type: 'change' });
      return true;
    },
    boostsLeft(day) {
      if (!content.ads) return 0;
      const a = s().ads;
      return a?.day === day ? Math.max(0, content.ads.boost.perDay - (a.boosts ?? 0)) : content.ads.boost.perDay;
    },
    boostLeft: () => s().ads?.boostLeft ?? 0,
    grantPack(give) {
      const st = s();
      const c = give.coinsMin ? (rewardFor({ incomeMin: give.coinsMin }).coins ?? 0) : 0;
      st.coins += c;
      st.crystals += give.crystals ?? 0;
      commit({ flush: true });
      for (const [id, n] of Object.entries(give.eggs ?? {})) game.giveEggs(id, n);
      emit({ type: 'change' });
      return c;
    },
    shopMark(mark) {
      const st = s();
      st.shop ??= { noAds: false, bought: {}, starterEnds: 0 };
      if (mark.bought) st.shop.bought[mark.bought] = (st.shop.bought[mark.bought] ?? 0) + 1;
      if (mark.noAds) st.shop.noAds = true;
      if (mark.starterEnds !== undefined) st.shop.starterEnds = mark.starterEnds;
      commit({ flush: true });
      emit({ type: 'change' });
    },
    awayDouble() {
      const c = lastAway;
      if (c <= 0) return 0;
      lastAway = 0;
      s().coins += c;
      s().stats.coinsEarned += c;
      commit({ flush: true });
      emit({ type: 'change' });
      return c;
    },
    offline(awaySec) {
      const st = s();
      const away = Math.max(0, Math.min(content.upgrades.offlineMaxHours * 3600, Number.isFinite(awaySec) ? awaySec : 0));
      const worked = away * content.upgrades.offlineRate;
      const before = { coins: st.coins, deals: st.stats.deals, hatched: st.stats.hatched, levelUps: st.stats.levelUps ?? 0, level: sellerLevel() };
      quiet = true;
      try {
        for (let t = 0; t < worked - 1e-9; t += OFFLINE_STEP_SEC) game.tick(Math.min(OFFLINE_STEP_SEC, worked - t));
      } finally {
        quiet = false;
      }
      // FB-03 (Q-039 B): the coins away are offlineShare of the income of live play for the time away (up to offlineMaxHours) —
      // the helpers' sales count, but never above the max share and never below the min one.
      const live = (incomeNow() * away) / 60;
      const got = st.coins - before.coins;
      const want = Math.min(Math.max(got, live * content.upgrades.offlineShare.min), live * content.upgrades.offlineShare.max);
      if (worked > 0 && want !== got) {
        const add = Math.max(-st.coins, want - got);
        st.coins += add;
        st.stats.coinsEarned = Math.max(0, st.stats.coinsEarned + add);
      }
      // The seller level grows at most offlineMaxLevels away: the points above it are not counted, the deals away not either.
      const top = content.reputation.levels[Math.min(content.reputation.levels.length - 1, before.level + content.upgrades.offlineMaxLevels)];
      if (top !== undefined && before.level + content.upgrades.offlineMaxLevels < content.reputation.levels.length && sellerLevel() > before.level + content.upgrades.offlineMaxLevels) {
        st.stats.xp = Math.min(st.stats.xp ?? 0, top - 1e-6);
        st.stats.awayDeals = (st.stats.awayDeals ?? 0) + (st.stats.deals - before.deals);
      }
      lastAway = Math.max(0, st.coins - before.coins);
      const report: OfflineReport = {
        awaySec: away,
        realSec: Math.max(0, Number.isFinite(awaySec) ? awaySec : 0),
        workedSec: worked,
        coins: st.coins - before.coins,
        sold: st.stats.deals - before.deals,
        hatched: st.stats.hatched - before.hatched,
        levelUps: (st.stats.levelUps ?? 0) - before.levelUps,
      };
      if (worked > 0) {
        commit({ flush: true });
        emit({ type: 'change' });
      }
      return report;
    },
  };
  return game;
}
