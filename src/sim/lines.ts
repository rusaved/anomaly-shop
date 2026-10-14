// What: the line pick for creatures and customers (docs/01b, section 4; M2-17): a random line of the pool, never one of the last few.
// Called by: src/ui/chatter.ts; tests/lines.test.ts.
// Keep: pure; a roll in [0, 1) comes in; the texts live in content/lines.json, the code knows no jokes.

/** Index into a pool of `size` lines, skipping the last `noRepeat` shown (when the pool is big enough). */
export function pickLine(size: number, recent: readonly number[], noRepeat: number, roll: number): number {
  if (size <= 0) return -1;
  const avoid = new Set(recent.slice(-Math.min(noRepeat, size - 1)));
  const free: number[] = [];
  for (let i = 0; i < size; i++) if (!avoid.has(i)) free.push(i);
  return free[Math.min(free.length - 1, Math.floor(Math.max(0, roll) * free.length))] ?? 0;
}
