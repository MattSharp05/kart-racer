# MK8 fixture pack (MK-97)

A tiny stand-in for the local-only MK8 pack (ADR 0009), in the format `pnpm mk8:build` writes
(`tools/mk8/manifest.ts`). No Nintendo files: two solid-colour 64 px WebP tiles made with `sharp`
and the synthesized sine from `../mk8-sine.m4a`. `tests/e2e/mk8.ts` serves it at `/mk8/` with
Playwright route interception, so the loader's e2e tests run in CI, which never has the real pack.
