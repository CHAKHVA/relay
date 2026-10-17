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
