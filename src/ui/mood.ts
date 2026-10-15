// What: the mood chip of the market (M4-23, docs/01b §5.6): «In fashion ×1.3» / «Fed up ×0.8» next to a price.
// Called by: the sales card, the chat item, the lot card and the inventory tiles (through src/main.ts lookups).
// Keep: the species and the multipliers come from game.mood(); the chip is plain text with a colored edge, no new colors.

export type MoodKind = 'hot' | 'cold';

/** The chip's html for a species, '' when the market has no mood about it. */
export function moodChip(kind: MoodKind | null, mult: number, t: (key: string, vars?: Record<string, string | number>) => string, lang: string): string {
  if (!kind) return '';
  const x = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(mult);
  return `<span class="mood-chip mood-${kind}" data-mood="${kind}">${t(`mood.${kind}`, { x })}</span>`;
}
