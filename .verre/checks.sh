#!/usr/bin/env bash
# Uncorked has no test suite or CI yet, so this is the one automatic check: the TypeScript typecheck that
# most roadmap items list under "Done when". The agent runs it while it works; the workflow runs the base
# branch's copy afterwards and puts the result in the pull request.
set -euo pipefail
npm run typecheck
