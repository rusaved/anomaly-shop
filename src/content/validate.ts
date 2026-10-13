// What: content validator for `npm run validate:content` and the unit tests: game.json and every content/*.json.
// Called by: scripts/validate-content.mjs (Node, no bundler: relative imports with .ts only), tests/content.test.ts.
// Keep: the contract validateContent(files, game) => { ok, errors }; errors read "file: path — problem".

type Json = unknown;

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Milestone M0-01 version: shapes only; the valibot schemas arrive with feature M0-05. */
export function validateContent(files: Record<string, Json>, game: Json): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(game)) errors.push('game.json: — not an object');
  else {
    for (const key of ['id', 'title', 'languages', 'fallbackLanguage', 'bootBackground', 'profiles']) {
      if (!(key in game)) errors.push(`game.json: ${key} — missing`);
    }
  }
  for (const [name, json] of Object.entries(files)) {
    if (!isRecord(json)) errors.push(`${name}: — not an object`);
  }
  return { ok: errors.length === 0, errors };
}
