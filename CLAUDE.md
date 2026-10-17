# CLAUDE.md — How to build Relay (autonomous mode)

You are building **Relay** from scratch, **unattended**, with full permissions. The human has already completed `SETUP.md`: accounts, GitHub Apps, database, Vercel project, routine, and all secrets are in `.env.setup`. Your job is to build, test, deploy, and verify everything in `SPEC.md` without stopping.

`SPEC.md` is the single source of truth. Read it fully before writing code, and re-read the relevant sections before each milestone. If this file and SPEC.md disagree, SPEC.md wins. If SPEC.md is ambiguous, choose the simplest option consistent with its Decisions log (§0), record it in `DECISIONS.md`, and continue. **Do not ask the human questions during the build.**

## Start of every session
1. Read `CLAUDE.md`, `SPEC.md`, `SETUP.md`.
2. If `PROGRESS.md` exists, you are resuming (e.g. after a usage-limit pause or context reset): read it and continue from the first unfinished step. Never redo finished milestones.
3. If not resuming: run M0, starting with the preflight (SPEC.md §22.4).

## The only allowed early stops
- Preflight fails: print the ❌ items with the exact `SETUP.md` step to fix each, then stop.
- A required external action is impossible without a human (e.g. a browser-only GitHub setting missing from setup): record it in `PROGRESS.md` under **Needs human**, skip only what depends on it, and **keep building everything else**.

Otherwise, do not end your turn between milestones. Continue until the Definition of done.

## Build loop (every milestone, M0 → M15, then stretch items)
1. Re-read the spec sections for the milestone.
2. Write tests first (unit for `packages/core`; integration, GitHub, e2e, and visual as SPEC.md §22.1 requires for that milestone).
3. Implement.
4. Verify — all must pass before moving on:
   - `pnpm -r typecheck`
   - `pnpm -r lint`
   - `pnpm test` (unit + integration)
   - `pnpm test:github` from M3
   - `pnpm test:e2e` from M5
   - `pnpm test:visual` on milestones that change UI. Open the screenshots and fix anything broken, cramped, unreadable, or inconsistent between light and dark.
   - `pnpm --filter web build`
   - The milestone's acceptance check in SPEC.md §20, exercised for real (run the app, call the endpoints, look at GitHub), not just inferred.
5. If something fails, debug and fix the root cause. Do not skip, weaken, or delete tests to make them pass. If a test is wrong, fix the test and note why in `DECISIONS.md`.
6. Commit: `M<n>: <summary>` (the pre-commit secret check must pass). Push to `origin main`.
7. Update `PROGRESS.md`: milestone status, what was verified and how, real fires used, open issues, next step.

## Environment and secrets
- `.env.setup` (git-ignored) holds every value. In M0, generate `apps/web/.env.local` (dev) and `apps/web/.env.test` from it. Read private keys from the `.pem` paths given there and store them as single-line `\n`-escaped values where an env var needs them.
- Dev and tests use the **dev** database, the **Relay Dev** GitHub App, smee, and the sandbox repo (`TEST_REPO`).
- Production uses `PROD_*` values. In M14, set them on Vercel with `vercel env add ... production` (non-interactive, `--token "$VERCEL_TOKEN"`), deploy with `vercel deploy --prod`, run migrations against `PROD_DATABASE_URL`, and set GitHub Actions secrets with `gh secret set` (`RELAY_TICK_URL`, `CRON_SECRET`).
- Never print, log, echo, or commit secret values (routine URL/token, usage tokens, GitHub keys/secrets, database URLs, Vercel token). Mask them in any output you write.

## Versions
Use the **latest stable** release of every tool. In M0, resolve versions with `pnpm view <pkg> version`, install them, and record them in `VERSIONS.md`. Respect the floors and fallbacks in SPEC.md §4 (Next.js ≥ 16.3 with `proxy.ts`, Tailwind ≥ 4.3, Vitest 5, Drizzle 1.x, Better Auth, not Auth.js; Node 26; TypeScript latest with a 6.x fallback if 7.x breaks tooling). When an API differs from what you expect, read the installed package's types and docs instead of guessing.

## Hard rules
- **Web only.** No desktop, menubar, Electron, or Tauri app.
- **Real routine fires:** at most `REAL_FIRE_BUDGET` (default 3) in the entire build, only in M13, only against `TEST_REPO`. Everything else runs with `dryRun` on. Log every real fire in `PROGRESS.md`.
- **No LLM/Anthropic API calls from the Relay server.** The only Anthropic call is `fire()` in `apps/web/lib/routine.ts`.
- **Scope of action (you have full permissions — use them carefully):**
  - Only modify files inside this project directory.
  - Only write to these GitHub repositories: this project's repo, `TEST_REPO`, and `DEMO_TEMPLATE_REPO`. Never delete repositories, never force-push to `main`, never change settings of other repos.
  - Test data in `TEST_REPO` is labeled `relay-test` and cleaned up (issues closed, test branches deleted) after tests.
  - Do not change global machine configuration beyond installing project tools.
- `packages/core` is pure: no I/O, no `Date.now()` inside logic; `now` is always a parameter.
- Simulated members are always labeled "Simulated" and can never be an executing seat.
- All "$" and quota figures are labeled "est.".
- Webhook and tick handlers are idempotent (no duplicate issues, comments, or PRs).
- `routine/ROUTINE_PROMPT.md` is byte-identical to SPEC.md §9 (add a test that checks this).
- The test-login route must be impossible to enable in production (SPEC.md §22.2).

## Public product rules (SPEC.md §21)
- The live app must work for strangers with their own GitHub account, repo, and Claude plan. Never hard-code the builder's repo, account, or routine outside seed/demo helpers and tests.
- Every API route enforces workspace isolation; test cross-workspace access.
- Onboarding must be completable from the UI alone, guided by `/w/[id]/start`.

## Quality bar
- TypeScript strict mode; no `any` without a comment explaining why.
- zod-validate every API input and every external payload (webhooks, routine results, beacon).
- Accessible UI (keyboard, focus, non-color status cues). Use the `frontend-design` mindset: intentional, consistent, not templated.
- README covers: "For judges" (top), architecture, local setup (incl. smee.io), GitHub App setup, routine setup, statusLine + usage token setup, demo script (SPEC.md §16.4), deployment, testing.

## Definition of done
All acceptance checks in SPEC.md §20 pass and are recorded in `PROGRESS.md` with how they were verified; CI is green; production is live and passes `pnpm test:prod`; `PROGRESS.md` ends with a **Final report**: live URL, what was verified, real fires used, and a short **Needs human** list (at minimum: the M15 second-account check and recording the demo video).
