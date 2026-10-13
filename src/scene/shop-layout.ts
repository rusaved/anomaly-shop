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
  incubator: Spot;
  showcase: Rect;
  slots: Rect[];
  door: Rect;
  queue: Spot[];
  outline: number;
  radius: number;
}

export const SHOP = { showcaseSlots: 3, queueSpots: 3, minUnit: 18 };

export function computeShopLayout(stage: Rect, hudHeight: number, floorShare: number, outlineWidth: number, cornerRadius: number): ShopLayout {
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
  const spotStep = Math.min(spotR * 1.5, Math.max(spotR * 0.8, (floor.h - spotR * 2.2) / (SHOP.queueSpots - 1)));
  for (let i = 0; i < SHOP.queueSpots; i++) {
    queue.push({ x: door.x + door.w / 2 - i * spotR * 0.5, y: floorY + spotR * 1.1 + i * spotStep, r: spotR });
  }

  // Showcase shelf on the wall, left half.
  const slot = Math.min(u * 1.3, (stage.w * 0.55 - u * 0.8) / SHOP.showcaseSlots);
  const gap = slot * 0.18;
  const showcaseW = SHOP.showcaseSlots * slot + (SHOP.showcaseSlots + 1) * gap;
  const showcaseH = slot + gap * 2;
  const showcase: Rect = { x: stage.x + u * 0.5, y: top + Math.max(0, wallFree * 0.5 - showcaseH / 2), w: showcaseW, h: showcaseH };
  const slots: Rect[] = [];
  for (let i = 0; i < SHOP.showcaseSlots; i++) slots.push({ x: showcase.x + gap + i * (slot + gap), y: showcase.y + gap, w: slot, h: slot });

  // Counter on the floor, centred; incubator stands on its left end.
  const counterW = Math.min(stage.w * 0.58, u * 6, door.x - spotR * 2.6 - u * 0.6 - stage.x);
  const counterH = Math.min(u * 1.1, floor.h * 0.45);
  const counter: Rect = { x: stage.x + Math.min(stage.w * 0.42 - counterW / 2, door.x - spotR * 2.6 - counterW - stage.x), y: floorY + floor.h * 0.3, w: counterW, h: counterH };
  const counterTop: Rect = { x: counter.x - u * 0.15, y: counter.y - u * 0.25, w: counterW + u * 0.3, h: u * 0.35 };
  const incR = Math.min(u * 0.9, counterW * 0.2);
  const incubator: Spot = { x: counter.x + incR * 1.3, y: counterTop.y - incR * 0.95, r: incR };

  return { stage, unit: u, wall, floor, counter, counterTop, incubator, showcase, slots, door, queue, outline, radius };
}
