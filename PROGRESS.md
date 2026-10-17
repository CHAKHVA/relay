# PROGRESS.md

Build log for Relay (autonomous mode). Resume from the first unfinished step.

## Status

| Milestone | Status | Verified how |
|---|---|---|
| M0 Versions + scaffold | ✅ done | preflight all ✅; `pnpm i`, `pnpm -r typecheck`, `pnpm -r lint`, core tests, `pnpm --filter web build` pass; CI workflow added (checked on GitHub after push) |
| M1 packages/core | ✅ done | 91 unit tests (windows incl. wrap, DST spring/fall, same-day; before-reset; headroom rollover/stale/in-flight; eligibility; matching order; ledger; recurring; digest; stats; issue metadata; results); coverage 98.9% lines |
| M2 DB + auth + onboarding | ⏳ next | |

## Real fires used
0 / 3

## Open issues
- none

## Needs human
- (none yet)

## Next step
M2: Drizzle schema, migrations, Better Auth, onboarding.
