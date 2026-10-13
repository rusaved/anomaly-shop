#!/usr/bin/env bash
# Session start (CLAUDE.md, «Как работать» p. 1): Node >= 22.18, dependencies, Chromium for Playwright, browser smoke.
# No package-lock.json yet (before M0) -> npm install creates it; commit it with the first feature.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

need="22.18.0"
have="$(node -v 2>/dev/null | sed 's/^v//')" || { echo "init.sh: node not found" >&2; exit 1; }
if [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
  echo "init.sh: Node >= $need required (scripts import .ts files), found $have" >&2; exit 1
fi
echo "init.sh: node $have, npm $(npm -v)"

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
  echo "init.sh: package-lock.json created, commit it"
fi
bash scripts/ensure-chromium.sh

if [ -f e2e/smoke.spec.ts ]; then
  echo "init.sh: browser smoke"
  npm run --silent build:e2e >/dev/null
  npx playwright test e2e/smoke.spec.ts --project desktop --grep "environment" 2>&1 | tail -n 20
else
  echo "init.sh: e2e/smoke.spec.ts not written yet (milestone M0), browser smoke skipped"
fi
echo "init.sh: ok"
