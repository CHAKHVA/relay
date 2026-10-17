# PROGRESS.md

Build log for Relay (autonomous mode). Resume from the first unfinished step.

## Status

| Milestone | Status | Verified how |
|---|---|---|
| M0 Versions + scaffold | ✅ done | preflight all ✅; `pnpm i`, `pnpm -r typecheck`, `pnpm -r lint`, core tests, `pnpm --filter web build` pass; CI workflow added (checked on GitHub after push) |
| M1 packages/core | ✅ done | 91 unit tests (windows incl. wrap, DST spring/fall, same-day; before-reset; headroom rollover/stale/in-flight; eligibility; matching order; ledger; recurring; digest; stats; issue metadata; results); coverage 98.9% lines |
| M2 DB + auth + onboarding | ✅ done | Drizzle migrations applied to dev Neon; 6 integration tests (test login → Better Auth session, create workspace → owner, invite → accept (idempotent, single-use), owner-only invites, cross-workspace 404). Real run: `next dev`, `/api/auth/sign-in/social` returns GitHub authorize URL with Relay Dev client id + localhost callback; HTTP flow create→invite→accept→team page lists both members; screenshots of onboarding/team in light+dark reviewed |
| M3 GitHub App + issue sync | ⏳ next | |

## Real fires used
0 / 3

## Open issues
- none

## Needs human
- (none yet)

## Next step
M3: GitHub App install/setup, labels, webhook issue sync, board-created issues; smee e2e.
