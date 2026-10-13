// `npm run validate:content` (docs/02-tech.md, section 5): game.json and every content/**/*.json (except
// *.schema.json) against the schemas of src/content/validate.ts (valibot, feature M0-05).
// Contract: validateContent(files: Record<path, json>, game: json) => { ok: boolean, errors: string[] }.
// Exit 1 with "file: path — problem". Imports a .ts module: Node >= 22.18 strips types by itself.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const contentDir = resolve(root, 'content');
const validatorFile = resolve(root, 'src/content/validate.ts');

/** Every content json by its path relative to content/ ("eggs.json", "i18n/ru.json"). */
export function loadContent() {
  const files = {};
  const errors = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && !e.name.endsWith('.schema.json')) {
        const rel = relative(contentDir, p).split('\\').join('/');
        try {
          files[rel] = JSON.parse(readFileSync(p, 'utf8'));
        } catch (err) {
          errors.push(`${rel}: invalid JSON — ${err.message}`);
        }
      }
    }
  };
  if (existsSync(contentDir)) walk(contentDir);
  return { files, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { files, errors } = loadContent();
  let game = null;
  try {
    game = JSON.parse(readFileSync(resolve(root, 'game.json'), 'utf8'));
  } catch (err) {
    errors.push(`game.json: ${err.message}`);
  }
  if (Object.keys(files).length === 0) errors.push('content/: no json files');
  if (!existsSync(validatorFile)) errors.push('src/content/validate.ts is missing (feature M0-05): the content schemas live there');
  else if (errors.length === 0) {
    const { validateContent } = await import(pathToFileURL(validatorFile).href);
    const result = validateContent(files, game);
    if (!result.ok) errors.push(...result.errors);
  }
  if (errors.length) {
    console.error(`validate:content: ${errors.length} problem(s)`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`validate:content: game.json and ${Object.keys(files).length} content files — ok`);
}
