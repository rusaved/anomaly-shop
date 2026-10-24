// `npm run verify` (docs/05-milestones-and-tests.md, section 2): the chain of checks, each stage named before
// and timed after.
//   --fast     typecheck + unit + validate:content + sim:balance: after every feature, budget 10 minutes.
//   (default)  the whole chain with e2e: only at the end of a milestone, once (plus one retry at most).
//   --full     the whole chain + e2e:full (M6 and submission).
//   --no-e2e   the whole chain without e2e stages (a build check in the middle of a milestone).
//   --log <f>  full output of every stage and the stage lines go to this file (default .cache/verify.log).
// RD-01: the result also goes to .cache/verify-summary.json (stages, seconds, the failed stage's tail) — CI and
// `npm run ci:status` read that, not the log.
// The console gets only stage lines and, on failure, the last 40 lines of the failed stage: the context stays small.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const full = args.includes('--full');
const noE2e = args.includes('--no-e2e');
const logIndex = args.indexOf('--log');
const logFile = resolve(root, logIndex >= 0 ? args[logIndex + 1] : '.cache/verify.log');
const summaryFile = resolve(root, '.cache/verify-summary.json');
const FAST_BUDGET_SEC = 600;
const TAIL_LINES = 40;

// e2e: true — the stage runs Playwright and belongs to the end of a milestone only.
const STAGES = [
  { name: 'typecheck', fast: true },
  { name: 'test', fast: true },
  { name: 'validate:content', fast: true },
  { name: 'sim:balance', fast: true },
  { name: 'build:e2e' },
  { name: 'e2e', e2e: true },
  { name: 'build' },
  { name: 'size' },
  { name: 'pack' },
  { name: 'check-release' },
  { name: 'e2e:release', e2e: true },
  { name: 'build:youtube' },
  { name: 'check:youtube' },
];
if (full) STAGES.push({ name: 'e2e:full', e2e: true });

const stages = STAGES.filter((s) => (fast ? s.fast : !(noE2e && s.e2e)));
mkdirSync(dirname(logFile), { recursive: true });
const log = createWriteStream(logFile);
// Stage lines go to the console and to the log, so the log alone shows the whole run.
const say = (line, err = false) => {
  (err ? console.error : console.log)(line);
  log.write(line + '\n');
};

function run(stage) {
  return new Promise((done) => {
    const tail = [];
    const push = (chunk) => {
      log.write(chunk);
      for (const line of chunk.toString().split('\n')) {
        tail.push(line);
        if (tail.length > TAIL_LINES) tail.shift();
      }
    };
    const child = spawn('npm', ['run', '--silent', stage], {
      cwd: root,
      env: process.env,
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('close', (code) => done({ code: code ?? 1, tail }));
  });
}

const mode = fast ? 'fast' : full ? 'full' : noE2e ? 'no-e2e' : 'milestone';
say(`verify (${mode}): ${stages.length} stages, full log ${logFile}`);
const started = Date.now();
const summary = { mode, started: new Date(started).toISOString(), ok: false, seconds: 0, stages: [], failedTail: [] };
const writeSummary = () => {
  summary.seconds = Math.round((Date.now() - started) / 1000);
  mkdirSync(dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, JSON.stringify(summary, null, 1) + '\n');
};
for (const stage of stages) {
  const mark = stage.e2e ? ' [e2e: end of milestone only]' : '';
  log.write(`\n== verify: ${stage.name}${mark}\n`);
  const t0 = Date.now();
  const { code, tail } = await run(stage.name);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  summary.stages.push({ name: stage.name, ok: code === 0, seconds: Number(sec) });
  if (code !== 0) {
    summary.failedTail = tail;
    writeSummary();
    say(`FAIL ${stage.name}${mark} after ${sec} s (exit ${code})`, true);
    console.error(`last ${TAIL_LINES} lines:\n${tail.join('\n')}`);
    log.end(() => process.exit(code));
    await new Promise(() => {});
  }
  say(`ok   ${stage.name}${mark} ${sec} s`);
}
const total = Math.round((Date.now() - started) / 1000);
say(`verify (${mode}): all ${stages.length} stages green in ${total} s`);
summary.ok = true;
writeSummary();
if (fast && total > FAST_BUDGET_SEC) say(`verify:fast took ${total} s, budget ${FAST_BUDGET_SEC} s: write it to progress.md`, true);
log.end();
