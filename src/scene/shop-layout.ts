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
  /** On the wall under the showcase, left. */
  board: Rect;
  /** Feeder by the showcase, seller by the counter, courier at the door. */
  feeder: Spot;
  seller: Spot;
  courier: Spot;
}

export const SHOP = { showcaseSlots: 3, queueSpots: 3, minUnit: 18 };

export function computeShopLayout(
  stage: Rect,
  hudHeight: number,
  floorShare: number,
  outlineWidth: number,
  cornerRadius: number,
  incubatorCount = 1,
  slotCount = SHOP.showcaseSlots,
  queueCount = SHOP.queueSpots,
): ShopLayout {
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
  const slot = Math.min(u * 1.75, (n <= 3 ? stage.w * 0.6 - u * 0.8 : availW) / (cols + 0.18 * (cols + 1)), (wallFree * 0.8) / (1.36 * rows + rowGap));
  const gap = slot * 0.18;
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
  const counterW = Math.min(stage.w * 0.58, u * 6, door.x - spotR * 2.6 - u * 0.6 - stage.x);
  const counterH = Math.min(u * 1.1, floor.h * 0.45);
  const counter: Rect = { x: stage.x + Math.min(stage.w * 0.42 - counterW / 2, door.x - spotR * 2.6 - counterW - stage.x), y: floorY + floor.h * 0.3, w: counterW, h: counterH };
  const counterTop: Rect = { x: counter.x - u * 0.15, y: counter.y - u * 0.25, w: counterW + u * 0.3, h: u * 0.35 };
  // Incubators stand side by side on the left part of the counter; the right part stays free for the deal.
  const count = Math.max(1, Math.floor(incubatorCount));
  const incR = Math.min(u * 0.9, counterW * 0.2, counterW / (count * 2.4 + 0.2));
  const incubators: Spot[] = [];
  for (let i = 0; i < count; i++) incubators.push({ x: counter.x + incR * 1.3 + i * incR * 2.4, y: counterTop.y - incR * 0.95, r: incR });
  const incubator = incubators[0] as Spot;

  const signH = Math.min(u * 0.75, Math.max(u * 0.4, door.y - top - u * 0.7));
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
    clock: { x: stage.x + stage.w * 0.56, y: stage.y + Math.max(u * 0.75, top * 0.55), r: u * 0.42 },
    lamp: { x: stage.x + stage.w * 0.4, y: stage.y + Math.max(u * 0.6, top * 0.45), r: u * 0.28 },
    board: { x: showcase.x + u * 0.1, y: Math.min(floorY - u * 1.0, showcase.y + showcase.h + u * 0.6), w: u * 1.3, h: u * 0.9 },
    feeder: { x: Math.max(stage.x + u * 0.35, counter.x - u * 0.05), y: Math.min(stage.y + stage.h - u * 0.45, counter.y + counter.h + u * 0.25), r: u * 0.3 },
    seller: { x: Math.min(sideX + u * 0.5, door.x - spotR * 2.2), y: counter.y + counter.h * 0.8, r: u * 0.38 },
    courier: { x: door.x + door.w - u * 0.1, y: door.y - u * 0.05, r: u * 0.24 },
  };

  // The clock steps left of the radio when they would meet over the showcase (wide screens).
  const k = decor.clock;
  if (k.x + k.r * 1.1 > decor.radio.x && k.x - k.r * 1.1 < decor.radio.x + decor.radio.w && k.y + k.r * 1.7 > decor.radio.y - decor.radio.h) k.x = decor.radio.x - k.r * 1.6;

  return { stage, unit: u, wall, floor, counter, counterTop, incubator, incubators, showcase, slots, slotGap: gap, door, queue, decor, outline, radius };
}
