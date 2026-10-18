# Relay

**Relay makes sure the AI limits your team already pays for get used.** Each person's queued tasks run on their own Claude seat after work hours or just before their 5-hour limit resets. Members who opt in let their idle seat pick up teammates' tasks automatically. Everything is a GitHub issue; results come back as a draft PR or a comment, attributed to the seat that did the work.

Web only. Built unattended with Claude Code from [`SPEC.md`](SPEC.md); the build log is in [`PROGRESS.md`](PROGRESS.md) and every judgment call in [`DECISIONS.md`](DECISIONS.md).

## For judges

| | |
|---|---|
| **Live app** | https://relay-chakhva.vercel.app |
| **Demo video** | _Needs human: record it with the demo script below and put the link here._ |
| **Try it on your own project** | Sign in with GitHub → follow **Getting started** (about 5 minutes). Guide: https://relay-chakhva.vercel.app/guide |
| **Demo template repo** | https://github.com/CHAKHVA/relay-demo (click *Use this template*) |

**What you need:** a GitHub account and a repository you can install an app on (or a copy of the demo template), and a Claude Pro / Max / Team / Enterprise plan with Claude Code routines. No dependency on the builder's accounts.

**The 5-minute path**
1. Sign in with GitHub and create a workspace.
2. *Connect a repository*: install the Relay GitHub App on one repo (or create a copy of the demo repo first).
3. *Connect your Claude seat*: create a routine named `Relay worker` on claude.ai/code/routines for that repo, paste the prompt Relay shows you, add an API trigger, paste its URL and token into Relay.
4. *Set your windows* (defaults are fine), then *Try it now*: create the sample task and press **Run now**, or open a 60-minute test window. Prefer a rehearsal? Turn on **Dry run** in Settings: nothing is fired and runs complete in ~20 s.
5. Optional: turn on **demo mode** in Settings → *Load demo team* to see sharing with simulated (always labeled) teammates, and the demo clock's *Jump to next window*.

**Known limitations**
- Routine runs take minutes, and the `/fire` API is a research preview (all calls live in `apps/web/lib/routine.ts`).
- Team/Enterprise admins can disable routines; Relay can't run there.
- Claude Code's status payload field names aren't guaranteed; the manual usage slider always works.
- All "$" and quota figures are estimates and are labeled "est.".
- The second-account self-serve check and the demo video are the two items that need a human (see `PROGRESS.md`).

## How it works

```
GitHub issues (label "relay")  ──webhook──▶  Relay (Next.js on Vercel)  ──fire──▶  member's Claude routine
        ▲                                        │  Postgres (Neon)                      │
        └──── draft PR / comment / status ───────┴──── push webhook + result file ◀──────┘
```

- **Issue = task.** The board creates issues; labeling an existing issue `relay` imports it. A metadata block at the end of the body (`type`, `likelyFiles`, `doneCheck`, `size`, `targetPr`) makes it runnable; anything vague is **triaged** by an agent first.
- **Scheduler tick** (`apps/web/lib/engine/tick.ts`) runs every 5 minutes (GitHub Actions), after webhooks and after task creation, under a Postgres advisory lock. It creates due recurring tasks, reconciles running tasks, plans with the pure scheduler in `packages/core`, dispatches, and posts digests.
- **Own seat first**, then opted-in teammates with the most spare headroom. A **change ledger** blocks two agents from claiming the same files.
- **GitHub is the message bus.** A routine can't call Relay, so it pushes `claude/relay-<id>` plus `.relay/results/<id>.json`; Relay reads it on the `push` webhook (or by polling) and opens the draft PR or posts the comment.
- **No AI calls from Relay.** The only Anthropic request is `fire()` in `apps/web/lib/routine.ts`, using the member's own routine token (stored AES-256-GCM encrypted).
- **Simulated members** (demo mode) are always labeled and can never execute.

```
apps/web/        Next.js 16 app: UI, API routes, engine, GitHub App integration, Drizzle schema + migrations
packages/core/   Pure scheduling logic (windows, headroom, matching, ledger, digest, stats…), 91 unit tests
routine/         ROUTINE_PROMPT.md — byte-identical to SPEC §9 (checked in CI)
scripts/         preflight, env generation, deploy, smoke tests, statusLine script
demo-repo/       The demo template repository
```

## Local setup

Requirements: Node ≥ 24, pnpm 12, a Postgres database (Neon works), a GitHub App for development, and a [smee.io](https://smee.io) channel.

```bash
pnpm install
# create .env.setup as described in SETUP.md (git-ignored)
pnpm preflight                        # checks tools, secrets, DB, GitHub App, smee, Vercel
node scripts/gen-env.mjs              # writes apps/web/.env.local and .env.test
pnpm --filter web db:migrate
pnpm --filter web dev                 # http://localhost:3000
npx smee-client --url "$SMEE_URL" --target http://localhost:3000/api/github/webhook   # forwards GitHub webhooks
```

`RELAY_ENABLE_TEST_LOGIN=1` (dev/test only; impossible in production) adds `POST /api/test/login` for automated tests.

## GitHub App setup

Create one app for development ("Relay Dev": webhook URL = your smee URL, callback `http://localhost:3000/api/auth/callback/github`, setup URL `http://localhost:3000/api/github/setup`) and one public app for production (URLs on your domain, **installable by any account**).

- Repository permissions: **Issues** read/write, **Pull requests** read/write, **Contents** read, **Metadata** read. Account permission: **Email addresses** read.
- Subscribe to events: Issues, Pull request, Push (installation events are automatic).
- Check "Request user authorization (OAuth) during installation" is **off**; sign-in uses the same app's client ID/secret.
- `node scripts/prod-webhook.mjs` verifies the production app's webhook URL and secret.

## Routine setup (each member, once)

1. claude.ai/code/routines → **New routine**, name `Relay worker`, select the workspace repository, Default environment.
2. Paste the prompt from `routine/ROUTINE_PROMPT.md` (also shown in Relay under *My seat*), remove connectors.
3. Add an **API trigger**, copy the URL and generate a token, paste both into Relay (*My seat → Claude routine*). *Send test run* is optional and uses one routine run.

## Usage data (statusLine)

Relay is more accurate when it knows your real 5-hour usage. On *My seat → Usage data*:

```bash
mkdir -p ~/.relay && curl -fsSL https://relay-chakhva.vercel.app/relay-statusline.mjs -o ~/.relay/relay-statusline.mjs
```

then add to `~/.claude/settings.json` (Relay pre-fills your URL and token):

```json
{
  "statusLine": { "type": "command", "command": "node ~/.relay/relay-statusline.mjs" },
  "env": { "RELAY_URL": "https://relay-chakhva.vercel.app", "RELAY_USAGE_TOKEN": "<token from Relay>" }
}
```

The script has no dependencies, finishes in well under 300 ms, never throws, posts at most once a minute unless values change, and keeps the raw payload in `~/.relay/statusline-last.json` for debugging. Without it, use the slider on your seat card.

## Demo script (3–4 minutes)

1. **Problem:** per-seat limits are never pooled; Ana is maxed out (96%), my seat is mostly idle.
2. **Board:** seats column (my live usage from the statusLine, simulated teammates) and the stats strip.
3. Ana's high-priority task runs on **my seat** (sharing), because she is above her reserve. Open the live session link.
4. Create the two `src/auth.ts` tasks: the second shows **Blocked on src/auth.ts by r…** (change ledger).
5. My own task waits for my off-hours: **Jump to next window** (demo clock) and it dispatches.
6. Label a vague GitHub issue `relay`: **Needs triage**, then the triage result fills in the metadata.
7. Show a finished draft PR and a business comment (fired before the talk).
8. Notification bell and a browser notification: "Your task r… is ready"; quick-add with `N` / `⌘K`.
9. Next morning: show the digest comment.
10. Close: "Same seats, more output, nothing pooled, every action attributed."

Fallback: flip **Dry run** on and replay; **Reset demo data** returns a clean slate between takes.

## Deployment (Vercel)

```bash
node scripts/deploy-prod.mjs all       # project settings, env vars, prod migrations, GH Actions secrets, deploy
node scripts/prod-webhook.mjs          # webhook URL/secret check for the production GitHub App
pnpm test:prod                         # production smoke test
```

`.github/workflows/tick.yml` calls `GET /api/cron/tick` (Bearer `CRON_SECRET`) every 5 minutes; `smoke.yml` runs the production smoke tests hourly and on every push. Secrets never leave `.env.setup` / Vercel / GitHub secrets, and the pre-commit hook (`scripts/check-secrets.mjs`) blocks commits that contain them.

## Testing

| Command | What it runs |
|---|---|
| `pnpm test` | Unit tests (`packages/core`, coverage ≥ 90%) and integration tests against Postgres |
| `pnpm test:github` | Sandbox-repo tests through the Relay Dev app, including the webhook round trip via smee |
| `pnpm test:e2e` | Playwright against `next dev`: API flows and UI flows (DRY RUN workspaces, test login) |
| `pnpm test:visual` | Light/dark screenshots at 1440 and 768 px into `apps/web/test-artifacts/screens/` |
| `pnpm test:prod` | Production smoke test (set `RELAY_PROD_URL` to point elsewhere) |

All automated tests run with DRY RUN on; real routine fires are limited to the M13 budget and are logged in `PROGRESS.md`.
