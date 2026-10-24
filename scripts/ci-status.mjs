// `npm run ci:status` (RD-01, docs/05, section 2): the result of the last GitHub Actions runs on main — verify (ci/verify.yml,
// installed by the producer as .github/workflows/verify.yml) and pages (the producer's link) — in a few lines: status,
// commit, time, the failed stage and its tail from the run's annotations. The session reads this, never the whole log.
//   --sha <commit>   wait for the runs of this commit (polls every 30 s up to --wait minutes, default 0: no waiting)
//   --step-summary   inside CI: turn .cache/verify-summary.json into the job summary and annotations (what the reader shows)
// The GitHub API is read with curl (the cloud session's proxy is set for it); a token is optional (public repository).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const TAIL = 15;

if (args.includes('--step-summary')) {
  const file = resolve(root, '.cache/verify-summary.json');
  if (!existsSync(file)) {
    console.log('::error title=verify::no .cache/verify-summary.json: verify did not start');
    process.exit(0);
  }
  const s = JSON.parse(readFileSync(file, 'utf8'));
  const failed = s.stages.find((st) => !st.ok);
  const md = [`### verify (${s.mode}): ${s.ok ? 'green' : `FAIL ${failed?.name ?? ''}`} in ${s.seconds} s`, '', '| stage | result | s |', '|---|---|---|'];
  for (const st of s.stages) md.push(`| ${st.name} | ${st.ok ? 'ok' : 'FAIL'} | ${st.seconds} |`);
  if (failed) md.push('', '```', ...s.failedTail.slice(-TAIL * 2), '```');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  // Annotations are readable without a token: the reader below takes the result from them.
  const esc = (t) => t.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
  const stages = s.stages.map((st) => `${st.ok ? 'ok' : 'FAIL'} ${st.name} ${st.seconds}s`).join('\n');
  if (failed) console.log(`::error title=verify: FAIL ${failed.name}::${esc(stages + '\n--- tail ---\n' + s.failedTail.slice(-TAIL).join('\n'))}`);
  else console.log(`::notice title=verify: green in ${s.seconds} s::${esc(stages)}`);
  process.exit(0);
}

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
const repo = (remote.match(/github\.com[/:]([^/]+\/[^/.]+)/) || [])[1];
if (!repo) {
  console.error(`ci:status: origin is not a GitHub repository (${remote})`);
  process.exit(1);
}
const api = (path) => {
  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (process.env.GITHUB_TOKEN) headers.push('-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`);
  const out = execFileSync('curl', ['-sS', '--max-time', '30', ...headers, `https://api.github.com/repos/${repo}${path}`], { encoding: 'utf8' });
  return JSON.parse(out);
};

const sha = opt('sha');
const waitMin = Number(opt('wait', '0'));
const when = (t) => (t ? t.replace('T', ' ').replace(/:\d\dZ$/, ' UTC') : '—');

function report(file) {
  const runs = api(`/actions/workflows/${file}/runs?branch=main&per_page=10`);
  if (runs.message) return { done: true, lines: [`${file}: not installed (${runs.message})${file === 'verify.yml' ? ' — ci/verify.yml waits for the producer, Q-049' : ''}`] };
  const run = (runs.workflow_runs || []).find((r) => !sha || r.head_sha.startsWith(sha));
  if (!run) return { done: false, lines: [`${file}: no run${sha ? ` for ${sha}` : ''} yet`] };
  const lines = [`${file}: ${run.status}${run.conclusion ? ` / ${run.conclusion}` : ''} · ${run.head_sha.slice(0, 7)} · ${when(run.updated_at)} · ${run.html_url}`];
  if (run.status === 'completed') {
    const jobs = api(`/actions/runs/${run.id}/jobs`).jobs || [];
    for (const job of jobs) {
      const bad = (job.steps || []).filter((st) => st.conclusion && !['success', 'skipped'].includes(st.conclusion));
      lines.push(`  job ${job.name}: ${job.conclusion}${bad.length ? ` — step ${bad.map((st) => `«${st.name}» ${st.conclusion}`).join(', ')}` : ''}`);
      const notes = api(`/check-runs/${job.id}/annotations`);
      for (const a of Array.isArray(notes) ? notes : []) {
        if (!a.title?.startsWith('verify')) continue;
        lines.push(`  ${a.title}`, ...a.message.split('\n').map((l) => `    ${l}`));
      }
    }
  }
  return { done: run.status === 'completed', lines };
}

const deadline = Date.now() + waitMin * 60_000;
for (;;) {
  const results = ['verify.yml', 'pages.yml'].map(report);
  const done = results.every((r) => r.done);
  if (done || Date.now() >= deadline) {
    console.log(results.flatMap((r) => r.lines).join('\n'));
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 30_000));
}
