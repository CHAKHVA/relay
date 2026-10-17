# DECISIONS.md

Choices made where SPEC.md was ambiguous or tooling forced a deviation. Each is the simplest option consistent with SPEC §0.

| # | Milestone | Decision | Why |
|---|---|---|---|
| 1 | M0 | `.env.setup` repo values (`TEST_REPO`, `DEMO_TEMPLATE_REPO`, `APP_REPO`) may be full GitHub URLs; scripts normalize them to `owner/name`. | The human's `.env.setup` uses URLs; SETUP.md shows `owner/name`. Accept both. |
| 2 | M0 | Preflight validates the Vercel token by reading the project (`/v9/projects/<name>?slug=<scope>`) rather than `/v2/user`. | The token is team-scoped; `/v2/user` returns 404 for team tokens even when valid. |
| 3 | M0 | TypeScript pinned to 6.0.3; Drizzle on 1.0.0-rc.4. | See VERSIONS.md "Deviations". |
| 4 | M0 | `packages/core` is consumed as TypeScript source (`exports: ./src/index.ts`, Next `transpilePackages`), no build step. | Simplest workspace setup; one source of truth for types. |
| 5 | M0 | The real routine URL/token are not copied into `apps/web/.env.*`; the M13 runner reads them straight from `.env.setup`. | Minimizes where the real routine credentials live; tests can never fire the real routine by accident. |
| 6 | M0 | CI runs typecheck, lint, core unit tests, the ROUTINE_PROMPT byte check, and the web build; DB integration tests run in CI only if a `CI_DATABASE_URL` secret is set. | SPEC §22.1: "otherwise unit only". Sharing the dev Neon branch with CI would make local and CI runs truncate each other's tables. |
| 7 | M1 | `activeWindowKind` order: off-hours > before-reset > temporary test window. | Spec says off_hours wins over before_reset; a test window only matters when no real window is active, so real windows keep their kind for stats. |
| 8 | M1 | Run now / Triage now jobs are ordered before others (then priority, then oldest), and still respect `maxConcurrent`. | The user explicitly asked for the run; respecting maxConcurrent avoids two routines racing on one seat. If the own seat can't take it, normal matching still applies and the reason starts with "Run now waiting:". |
| 9 | M1 | Off-hours window with start == end is empty (never active). | Avoids an ambiguous "always on" window. |
| 10 | M1 | In-flight accounting counts dispatches on the seat since max(usageUpdatedAt, now−5h, last rollover). Weekly estimate does not add in-flight cost (different scale). | Spec §10.2; prevents old runs from inflating a rolled-over window. |
| 11 | M1 | `blocked` tasks are candidates in each tick (re-evaluated); triage waits keep status `needs_triage`, work waits use `waiting_window`. | Spec §10.5 "each tick re-evaluates blocked tasks". |
| 12 | M1 | Stats add `tasksManual` (Run now/test-window runs). `estCreditsAvoidedUsd` = tokens of shared completed runs whose requester was at/over their reserve × $6/MTok. | Spec §10.10 lists off-hours/before-reset only; manual runs are shown separately so totals add up. |
| 13 | M2 | React Compiler runs via Next's native `experimental.turbopackRustReactCompiler` instead of the Babel plugin. | With the Babel plugin, `next dev` (Turbopack 16.4.2) did a full page reload after every first load, which broke e2e/visual tests. The Rust port has no reload and is faster. |
