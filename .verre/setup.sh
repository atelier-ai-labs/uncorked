#!/usr/bin/env bash
# Verre's agent workflows run this before the agent starts, with no AI involved (atelier-hq,
# docs/mission-control/AGENTS.md, "Project checks").
set -euo pipefail
npm ci --no-audit --no-fund
