# Kart Racer

A low-poly 3D arcade kart racer for the browser (desktop + mobile), inspired by classic kart racers — original characters and assets.

- **Play:** production URL on the Vercel project (see `CLAUDE.md`)
- **Test any state directly:** `/dev` lists every scenario link (with QR codes for phones)
- **Plan & tickets:** Notion project page (link in `CLAUDE.md`)

## Develop

```bash
pnpm install
pnpm exec playwright install chromium webkit   # first time only
pnpm dev                                       # http://localhost:5173 (also on your LAN for phones)
```

| Command            | What it does                                                  |
| ------------------ | ------------------------------------------------------------- |
| `pnpm check`       | Everything CI runs locally: lint, typecheck, unit, build, e2e |
| `pnpm test`        | Unit tests (Vitest)                                           |
| `pnpm test:e2e`    | Playwright on desktop Chrome/Safari, iPhone, Pixel, iPad      |
| `pnpm test:visual` | Screenshot tests — run in CI (Docker image) so pixels match   |

## CI & deploys

- Every PR runs GitHub Actions (checks → e2e + visual) and gets a Vercel preview URL.
- Merging to `main` deploys to production.
- Visual baselines: run the CI workflow manually on your branch (`gh workflow run CI --ref <branch>`), then `gh run download <run-id> -n visual-snapshots` and commit the updated `tests/visual/__screenshots__`.
