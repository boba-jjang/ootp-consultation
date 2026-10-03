#!/bin/bash
# Runs at the start of every Claude Code session.
# Installs workspace dependencies in cloud sessions only; exits at once locally.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
if [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile || pnpm install || true
elif [ -f package.json ]; then
  pnpm install || true
fi
exit 0
