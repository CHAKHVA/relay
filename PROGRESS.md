# PROGRESS.md

Build log for Relay (autonomous mode). Resume from the first unfinished step.

## Status

| Milestone | Status | Verified how |
|---|---|---|
| M0 Versions + scaffold | ✅ done | preflight all ✅; `pnpm i`, `pnpm -r typecheck`, `pnpm -r lint`, core tests, `pnpm --filter web build` pass; CI workflow added (checked on GitHub after push) |
| M1 packages/core | ✅ done | 91 unit tests (windows incl. wrap, DST spring/fall, same-day; before-reset; headroom rollover/stale/in-flight; eligibility; matching order; ledger; recurring; digest; stats; issue metadata; results); coverage 98.9% lines |
| M2 DB + auth + onboarding | ✅ done | Drizzle migrations applied to dev Neon; 6 integration tests (test login → Better Auth session, create workspace → owner, invite → accept (idempotent, single-use), owner-only invites, cross-workspace 404). Real run: `next dev`, `/api/auth/sign-in/social` returns GitHub authorize URL with Relay Dev client id + localhost callback; HTTP flow create→invite→accept→team page lists both members; screenshots of onboarding/team in light+dark reviewed |
| M3 GitHub App + issue sync | ✅ done | 7 GitHub tests vs sandbox repo (connect → labels + import; webhook upsert/idempotent/cancel/reactivate; foreign installation ignored; board task opens issue; rate limit) + smee e2e (real GitHub → smee → next dev → task row; close cancels). Fixed Relay Dev app webhook URL (was a github.com URL, deliveries 403) via `PATCH /app/hook/config` to SMEE_URL. Install UI lands in M15 checklist |
| M4 My seat + routine + usage tokens | ✅ done | 11 integration tests: settings validation/persistence, routine AES-GCM encrypted + masked (`trig_…XYZ`), URL allowlist, test-fire dry-run + 1/min limit, usage tokens hashed/shown once, beacon rejects missing/bad/cookie auth and only updates token owner, manual usage self/owner-for-simulated, test window 15–60, workspace settings owner-only; `lib/routine.ts` is the only Anthropic call |
| M5 Engine + DRY RUN | ✅ done | tick w/ advisory lock; dispatch/wait/block; result handling (triage, PR, comment, review); reconcile + dry-run completion + stale; status comments; state/tick/cron/health/task-action APIs. 7 GitHub engine tests (§16.3 tasks 1–3: shared onto builder seat, task 3 blocked then dispatched; simulated never executes; next-window text; Run now; test window; business comment on GitHub; retry/cancel; concurrent ticks; real push→draft PR idempotent + failed check) + Playwright e2e (settings→routine→task→run-now→done→isolation, real pages). Visual deferred to M11 |
| M6 Triage | ✅ done | 3 GitHub tests: vague issue → triaging (webhook-driven tick) → metadata block rewritten on the real issue (human text untouched), type label, “Triaged by” comment → queued → runs → done; “Triage now” outside window; invalid triage retries once then fails; own-edit webhook echo is a no-op |
| M11 Board UI + stats + demo mode | ✅ done | Pages: landing, /guide, /privacy, /onboarding, board (seats/queue/ledger/activity, stats strip), task detail, team, my seat (windows, sharing/pause, test window, routine wizard, usage tokens), settings (repo connect, dry run, demo tools: load team, jump window, reset), getting-started checklist. Backend: demo service, onboarding, sample task, pulls. 5 integration tests (stats vs fixtures, demo clock jump, reset, checklist); 3 UI e2e + engine e2e; visual screenshots light/dark @1440/768 reviewed in `apps/web/test-artifacts/screens/m11` (fixed hero art scale) |
| M12 Demo repo | ✅ done | `demo-repo/` (billing/auth/format, one passing test, docs, README with the 7 prepared tasks, lockfile); `pnpm install --ignore-workspace && pnpm test` passes (1 test, <1 s) |
| M14 Deploy | ✅ done (live) | https://relay-chakhva.vercel.app deployed with `scripts/deploy-prod.mjs` (project nextjs/root apps/web, 13 prod env vars, prod migrations applied, GH Actions secrets RELAY_TICK_URL/CRON_SECRET/RELAY_PROD_URL, tick workflow every 5 min). `scripts/prod-smoke.mjs` passes: landing, guide, privacy, health (db+github), auth redirect, sign-in → GitHub with prod callback, test-login 404, cron 401/200, webhook unsigned 401 + signed ping 200; Playwright smoke passes against prod. Redeploy after each later milestone |
| M13 Real routine integration | ✅ done (3/3 fires) | see Real fires used: real code task → branch → draft PR; real triage → metadata written back; third fire ran the triaged docs task → draft PR. Review fire not run |

## Real fires used
3 / 3 (all in M13, all against `CHAKHVA/relay-sandbox`, routine from `.env.setup`; session URLs are claude.ai links, no secrets)

| # | Time (UTC) | Task | Session | Outcome |
|---|---|---|---|---|
| 1 | 2026-10-17 23:41 | code `rtwvk` “Add a greet() helper” (`src/greeting.js`, doneCheck passed) | https://claude.ai/code/cse_014Uwn4HgBWUv6yQ8aTXggys | branch `claude/relay-rtwvk` pushed, result file valid, **draft PR #112** opened by Relay with “Closes #111”, status comment ✅ Done, finished in ~35 s |
| 2 | 2026-10-17 23:43 | triage `ra2if` (vague issue “Make the readme more helpful”) | https://claude.ai/code/cse_01HEwgYof1csuve49Td1Nod7 | metadata block rewritten on the real issue (human text kept), `relay:type/docs` label, title clarified, “Triaged by @… seat” comment, task → queued |
| 3 | 2026-10-17 23:43 | work run of the just-triaged `ra2if` (Run now was still set, so it took the third fire instead of the planned review) | https://claude.ai/code/cse_01VExX1e5UV6dUNseMhqbh63 | docs task → **draft PR #115**, done. The planned review fire did **not** run: budget was spent (see Needs human) |

All test issues/PRs/branches in the sandbox were closed/deleted afterwards.

## Open issues
- none

## Needs human
- M13: the real **review → PR comment** fire was not exercised (budget spent; the review path is covered by dry-run + GitHub tests). To check it live: in a workspace with a real routine, create a review task targeting an open PR and press Run now.

## Order (overnight, see DECISIONS #14)
M3 ✅, M4, M5, M6, M11, M12, M14 (deploy), M13, M15, M7, M8, M9, M10

## Next step
M13: real routine fires (budget 3) against sandbox repo.
