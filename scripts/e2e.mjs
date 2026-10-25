// `npm run e2e` / `npm run e2e:full` (docs/05, section 2): Playwright in two runs — every project but perf, then perf alone.
// Why two runs: Playwright never applies --grep to the projects a project depends on, so the old `perf → dependencies`
// ran every @full test inside `e2e` and the whole suite again inside `e2e:full` (D-02, 25.10). Two runs keep the perf
// budgets measured with no busy neighbour (M4-09) and let the grep cut each run.
//   (default)  tests without @full;   --full  only @full tests.   Other arguments go to Playwright as they are.
// Called by: package.json (e2e, e2e:full), scripts/verify.mjs through them.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const full = args.includes('--full');
const rest = args.filter((a) => a !== '--full');
const grep = full ? ['--grep', '@full'] : ['--grep-invert', '@full'];

for (const part of ['main', 'perf']) {
  console.log(`e2e${full ? ':full' : ''}: ${part === 'perf' ? 'perf alone' : 'every project but perf'}`);
  const r = spawnSync('npx', ['playwright', 'test', ...grep, '--pass-with-no-tests', ...rest], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, E2E_PART: part },
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
