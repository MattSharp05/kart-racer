#!/usr/bin/env bash
# Regenerates screenshot baselines in the same Linux image CI uses, so they match pixel for pixel.
# Usage: scripts/update-visual-baselines.sh   (needs Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm --platform linux/amd64 -v "$PWD":/work -w /work -e CI=true -e HOME=/root \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -c '
    corepack enable >/dev/null 2>&1
    corepack prepare pnpm@10.8.1 --activate >/dev/null 2>&1
    mkdir -p /tmp/w
    tar --exclude=node_modules --exclude=.git -cf - . 2>/dev/null | (cd /tmp/w && tar xf -)
    cd /tmp/w
    pnpm install --frozen-lockfile >/dev/null 2>&1
    pnpm test:visual --update-snapshots
    cp -r tests/visual/__screenshots__/. /work/tests/visual/__screenshots__/
  '
