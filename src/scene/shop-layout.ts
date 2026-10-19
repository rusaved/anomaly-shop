// What: where the shop pieces sit inside the stage rect (pure numbers): wall, floor, counter, incubator, showcase slots, door, queue spots.
// Called by: src/scene/shop.ts on every layout change; tests/shop-layout.test.ts.
// Keep: everything scales from u = min(stage.w, stage.h) / 10 and the floor share of style.json; no PixiJS here.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Spot {
  x: number;
  y: number;
  r: number;
}

export interface ShopLayout {
  stage: Rect;
  unit: number;
  wall: Rect;
  floor: Rect;
  counter: Rect;
  counterTop: Rect;
  /** First incubator (M0 shape); all of them are in incubators. */
  incubator: Spot;
  incubators: Spot[];
  showcase: Rect;
  slots: Rect[];
  /** MU-03: a portrait phone shows the showcase as the «Витрина» strip on the floor under the room; the wall keeps a picture frame here. */
  strip: boolean;
  frame: Rect;
  /** The bottom of the room (the strip floor starts here); the stage bottom without a strip. */
  roomBottom: number;
  /** Space between two showcase places; the tap zone of a place takes half of it on each side. */
  slotGap: number;
  door: Rect;
  queue: Spot[];
  /** Where the bought things of the shop stand (M2-07, M2-12): sign, register, ladder items, helpers. */
  decor: Decor;
  outline: number;
  radius: number;
}

export interface Decor {
  /** Above the queue label, over the door. */
  sign: Rect;
  /** On the front of the counter, right end. */
  register: Rect;
  /** Hanging by the door, top left. */
  bell: Spot;
  /** On the floor at the door, under the first customer. */
  mat: Rect;
  /** On the floor in front of the counter. */
  bowl: Spot;
  stool: Spot;
  /** On top of the showcase, right corner. */
  radio: Rect;
  /** On the wall at the top, between the HUD chips. */
  clock: Spot;
  lamp: Spot;
  /** On the front of the counter, left end (the register is at the right end). */
  board: Rect;
  /** Feeder by the showcase, seller by the counter, courier at the door. */
  feeder: Spot;
  seller: Spot;
  courier: Spot;
  /** M4-05: the pickup point — parcel shelves on the wall between the showcase and the door, its sign, the parcel locker by the door,
   * the clerk at the counter's left end, the guest zone along the bottom of the floor, the poster under the showcase. */
  shelves: Rect;
  pointSign: Spot;
  locker: Rect;
  clerk: Spot;
  guests: Rect;
  poster: Rect;
}

export const SHOP = { showcaseSlots: 3, queueSpots: 3, minUnit: 18, minSlot: 44, slotGap: 8 };

export function computeShopLayout(
  stage: Rect,
  hudHeight: number,
  floorShare: number,
  outlineWidth: number,
  cornerRadius: number,
  incubatorCount = 1,
  slotCount = SHOP.showcaseSlots,
  queueCount = SHOP.queueSpots,
  shelf: Rect | null = null,
  roomH = 0,
): ShopLayout {
  // MU-03: with a shelf strip the room is the top roomH of the stage (the floor runs on under the strip).
  const full = stage;
  if (shelf) stage = { x: stage.x, y: stage.y, w: stage.w, h: Math.max(1, roomH || shelf.y - stage.y) };
  // The round of fixes, item 5: sideways on a phone the room is the top roomH of the stage — the scene buttons stand on the floor under it.
  else if (roomH > 0 && roomH < stage.h) stage = { x: stage.x, y: stage.y, w: stage.w, h: roomH };
  const u = Math.max(SHOP.minUnit, Math.min(stage.w, stage.h) / 10);
  const outline = Math.max(2, Math.min(outlineWidth, u * 0.2));
  const radius = Math.min(cornerRadius, u * 0.6);
  const top = stage.y + Math.min(hudHeight, stage.h * 0.3);
  const floorY = stage.y + stage.h * (1 - floorShare);
  const wall: Rect = { x: stage.x, y: stage.y, w: stage.w, h: floorY - stage.y };
  const floor: Rect = { x: stage.x, y: floorY, w: stage.w, h: stage.y + stage.h - floorY };
  const wallFree = Math.max(1, floorY - top);

  // Door on the right of the wall, queue spots on the floor in front of it.
  const doorW = Math.min(u * 1.7, stage.w * 0.22);
  const doorH = Math.min(u * 2.8, wallFree * 0.8);
  const door: Rect = { x: stage.x + stage.w - doorW - u * 0.5, y: floorY - doorH, w: doorW, h: doorH };
  const spotR = Math.min(u * 0.5, doorW * 0.32);
  // The queue forms in front of the door, towards the viewer, so it never reaches the counter.
  const queue: Spot[] = [];
  const spots = Math.max(2, Math.floor(queueCount));
  const spotStep = Math.min(spotR * 1.5, Math.max(spotR * 0.7, (floor.h - spotR * 2.2) / (spots - 1)));
  for (let i = 0; i < spots; i++) {
    queue.push({ x: door.x + door.w / 2 - i * spotR * 0.5, y: floorY + spotR * 1.1 + i * spotStep, r: spotR });
  }

  // Showcase shelf on the wall, left of the door: one row up to 4 places, two rows above (M2-02: 3 → 9 places).
  // Creatures sit here and take taps (feeding): slots large enough for a portrait and a 44 px tap.
  const n = Math.max(1, Math.floor(slotCount));
  const rows = n <= 4 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const shelfX = stage.x + u * 0.5;
  const availW = Math.max(stage.w * 0.6 - u * 0.8, door.x - u * 0.6 - shelfX);
  // Rows sit apart so the price pill of the upper row stays clear of the lower one.
  const rowGap = rows > 1 ? 0.34 : 0;
  // Круг правок FB п. 2: a place is 44 px or more (07 rule 4), places stand 8 px apart; the frame grows with them, a «+» never leaves it.
  const gap = SHOP.slotGap;
  const byW = ((n <= 3 ? stage.w * 0.6 - u * 0.8 : availW) - (cols + 1) * gap) / cols;
  const byH = (wallFree * 0.8 - (rows + 1) * gap) / (1.18 * rows + rowGap);
  const slot = Math.max(SHOP.minSlot, Math.min(u * 1.75, byW, byH));
  const showcaseW = cols * slot + (cols + 1) * gap;
  const showcaseH = rows * slot + (rows + 1) * gap + (rows - 1) * slot * rowGap;
  const showcase: Rect = { x: shelfX, y: top + Math.max(0, wallFree * 0.5 - showcaseH / 2 - (rows > 1 ? slot * 0.15 : 0)), w: showcaseW, h: showcaseH };
  const slots: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    slots.push({ x: showcase.x + gap + col * (slot + gap), y: showcase.y + gap + row * (slot + gap + slot * rowGap), w: slot, h: slot });
  }

  // Counter on the floor, centred; incubator stands on its left end.
  // MU-02: u * 6.4 — four incubators keep their 44 px tap zones in the 45 % room of a landscape phone (l1).
  const counterW = Math.min(stage.w * 0.58, u * 6.4, door.x - spotR * 2.6 - u * 0.6 - stage.x);
  const counterH = Math.min(u * 1.1, floor.h * 0.45);
  // Incubators stand side by side on the left part of the counter; the right part stays free for the deal.
  const count = Math.max(1, Math.floor(incubatorCount));
  const incR = Math.min(u * 0.9, counterW * 0.2, counterW / (count * 2.4 + 0.2));
  // Круг правок FB (арт-ревизия): the shelf never lies on the incubators — the counter steps down onto the free floor (8 px between them).
  let counterY = floorY + floor.h * 0.3;
  const clash = showcase.y + showcase.h + 8 - (counterY - u * 0.25 - incR * 1.95);
  if (clash > 0) counterY = Math.max(counterY, Math.min(counterY + clash, stage.y + stage.h - counterH - u * 0.15));
  const counter: Rect = { x: stage.x + Math.min(stage.w * 0.42 - counterW / 2, door.x - spotR * 2.6 - counterW - stage.x), y: counterY, w: counterW, h: counterH };
  const counterTop: Rect = { x: counter.x - u * 0.15, y: counter.y - u * 0.25, w: counterW + u * 0.3, h: u * 0.35 };
  const incubators: Spot[] = [];
  for (let i = 0; i < count; i++) incubators.push({ x: counter.x + incR * 1.3 + i * incR * 2.4, y: counterTop.y - incR * 0.95, r: incR });
  const incubator = incubators[0] as Spot;

  const signH = Math.min(u * 0.75, Math.max(u * 0.4, door.y - top - u * 0.7));
  /** The hanging lamp: between the showcase and the door when there is room, else over the showcase, under the HUD. */
  const lampSpot = (): Spot => {
    const r = u * 0.28;
    const gapL = showcase.x + showcase.w;
    const gapR = door.x - u * 0.3;
    if (gapR - gapL >= r * 4) return { x: (gapL + gapR) / 2, y: top + u * 0.45, r };
    return { x: stage.x + stage.w * 0.45, y: Math.min(top + u * 0.35, showcase.y - r * 1.2), r };
  };
  /** M4-05: where the pickup point stands — in the free wall between the showcase and the door, along the floor bottom. */
  const pointSpots = () => {
    // Beside the showcase when the wall there is wide enough, else one long shelf under it (a wide showcase takes the wall).
    const left = showcase.x + showcase.w + u * 0.35;
    const right = door.x - u * 0.45;
    const shelfH = Math.min(u * 1.5, wallFree * 0.42);
    const under = { x: showcase.x + u * 1.05, y: showcase.y + showcase.h + u * 0.75, w: door.x - u * 1.3 - showcase.x - u * 1.05, h: floorY - u * 0.3 - (showcase.y + showcase.h + u * 0.75) };
    const shelves: Rect = right - left >= u * 2.2 ? { x: left, y: floorY - shelfH - u * 0.15, w: right - left, h: shelfH } : { ...under, w: Math.max(0, under.w), h: Math.max(0, under.h) };
    const bottom = stage.y + stage.h;
    const guestsH = Math.min(u * 0.95, Math.max(u * 0.5, bottom - (counter.y + counter.h) - u * 0.1));
    return {
      shelves,
      pointSign: { x: left + u * 0.45, y: Math.max(top + u * 0.4, shelves.y - u * 0.7), r: u * 0.32 },
      locker: { x: door.x - u * 0.85, y: floorY - u * 1.4, w: u * 0.65, h: u * 1.25 },
      clerk: { x: Math.max(stage.x + u * 0.45, counter.x - u * 0.15), y: counter.y - u * 0.05, r: u * 0.36 },
      guests: { x: stage.x + u * 0.2, y: bottom - guestsH - u * 0.05, w: Math.max(u * 2, counter.x + counter.w * 0.75 - stage.x - u * 0.2), h: guestsH },
      poster: { x: showcase.x + u * 0.1, y: showcase.y + showcase.h + u * 0.35, w: u * 0.75, h: Math.min(u * 0.95, Math.max(u * 0.4, floorY - showcase.y - showcase.h - u * 0.6)) },
    };
  };
  const signW = door.w * 1.3;
  const sideX = counter.x + counter.w;
  const decor: Decor = {
    sign: { x: door.x + door.w / 2 - signW / 2, y: Math.max(top + 2, door.y - u * 0.62 - signH), w: signW, h: signH },
    register: { x: counter.x + counter.w - u * 1.05, y: counter.y + counter.h * 0.14, w: u * 0.85, h: counter.h * 0.72 },
    bell: { x: door.x - u * 0.28, y: door.y + u * 0.35, r: u * 0.22 },
    mat: { x: door.x - u * 0.25, y: floorY + outline, w: door.w + u * 0.5, h: Math.min(u * 0.45, floor.h * 0.2) },
    bowl: { x: counter.x + u * 1.05, y: Math.min(stage.y + stage.h - u * 0.3, counter.y + counter.h + u * 0.45), r: u * 0.32 },
    stool: { x: counter.x + counter.w * 0.6, y: Math.min(stage.y + stage.h - u * 0.45, counter.y + counter.h + u * 0.55), r: u * 0.36 },
    radio: { x: showcase.x + showcase.w - u * 1.2, y: showcase.y - u * 0.5, w: u * 0.9, h: u * 0.55 },
    clock: { x: stage.x + stage.w * 0.63, y: stage.y + Math.max(u * 0.75, top * 0.55), r: u * 0.42 },
    lamp: lampSpot(),
    board: { x: counter.x + u * 0.2, y: counter.y + counter.h * 0.14, w: Math.min(u * 1.1, counter.h * 1.1), h: counter.h * 0.72 },
    feeder: { x: Math.max(stage.x + u * 0.35, counter.x - u * 0.05), y: Math.min(stage.y + stage.h - u * 0.45, counter.y + counter.h + u * 0.25), r: u * 0.3 },
    seller: { x: Math.min(sideX + u * 0.5, door.x - spotR * 2.2), y: counter.y + counter.h * 0.8, r: u * 0.38 },
    courier: { x: door.x + door.w - u * 0.1, y: door.y - u * 0.05, r: u * 0.24 },
    ...pointSpots(),
  };

  // The clock steps left of the radio when they would meet over the showcase (wide screens).
  const k = decor.clock;
  if (k.x + k.r * 1.1 > decor.radio.x && k.x - k.r * 1.1 < decor.radio.x + decor.radio.w && k.y + k.r * 1.7 > decor.radio.y - decor.radio.h) k.x = decor.radio.x - k.r * 1.6;

  if (!shelf) return { stage: full, unit: u, wall, floor: { ...floor, h: full.y + full.h - floorY }, counter, counterTop, incubator, incubators, showcase, slots, slotGap: gap, door, queue, decor, outline, radius, strip: false, frame: showcase, roomBottom: stage.y + stage.h };
  // MU-03 (s1-shop-scene): the places of the «Витрина» strip — 4 in a row (5 from 9 places), the size of a card picture.
  const sCols = n <= 8 ? 4 : 5;
  const sGap = 10;
  // s1: a place 76 wide and 64 high (the round of fixes, the mockup check).
  const sSize = Math.min(76, (shelf.w - (sCols - 1) * sGap) / sCols);
  const sH = Math.round(sSize * 0.84);
  const strip: Rect[] = [];
  for (let i = 0; i < n; i++) strip.push({ x: shelf.x + (i % sCols) * (sSize + sGap), y: shelf.y + Math.floor(i / sCols) * (sH + sGap), w: sSize, h: sH });
  const rowsN = Math.ceil(n / sCols);
  const stripBox: Rect = { x: shelf.x, y: shelf.y, w: shelf.w, h: rowsN * sH + (rowsN - 1) * sGap };
  return { stage: full, unit: u, wall, floor: { ...floor, h: full.y + full.h - floorY }, counter, counterTop, incubator, incubators, showcase: stripBox, slots: strip, slotGap: sGap, door, queue, decor, outline, radius, strip: true, frame: { ...showcase, w: Math.min(showcase.w, slot + gap * 2), h: showcase.h }, roomBottom: stage.y + stage.h };
}
