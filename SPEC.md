# Relay — Product & Technical Specification (MVP, full scope)

> **Relay makes sure the AI limits your team already pays for get used.** Each person's queued tasks run on their own Claude seat after work hours or just before their limits reset. Members who opt in let their idle seat pick up teammates' tasks automatically.

This document is the single source of truth for building Relay from scratch with Claude Code. Read `CLAUDE.md` for build order and working rules. Nothing in this spec is optional unless marked **(stretch)**.

---

## 0. Decisions log (agreed with the product owner)

| # | Decision |
|---|---|
| D1 | Two layers: **own seat first** (your tasks run on your seat in your windows), plus **opt-in team sharing** (your idle seat runs teammates' tasks). |
| D2 | Sharing is **fully automatic** once a member opts in. No per-task approval. Trust model = explicit opt-in + full attribution + pause anytime. |
| D3 | Run windows: **off-hours** (per member, own time zone) **+ before-reset** (default: last **120 min** before the 5-hour limit resets, keep **10%** reserve; each member can change both). |
| D4 | Task types: **code**, **review/audit**, **docs/report**, **business task**, plus internal **triage**. |
| D5 | **Every task is a GitHub issue** with the `relay` label. The Relay board creates issues; labeling an existing issue `relay` imports it. Single source of truth, no two-way sync conflicts. |
| D6 | Priority: labels `relay:high` / `relay:low` (default normal), then oldest first. |
| D7 | Non-code results: posted as an **issue comment** and shown **in Relay**. Code results: **draft PR** linked to the issue. Reviews: **one summary comment** on the PR (and linked from the issue). |
| D8 | Runner: **Claude Code Routines only**. One "Relay worker" routine per member, on that member's own Claude account. |
| D9 | Extra features: **recurring tasks**, **agent triage pass**, **morning digest**, **GitHub login + real members**, **deploy + webhooks**. (A native desktop/menubar app was considered and **removed**: Relay is web-only.) |
| D10 | Demo: builder's seat is real; teammates are **simulated and always labeled**. Simulated members can be requesters and appear in headroom views but never execute tasks. |
| D11 | Name: **Relay**. |
| D12 | Latest stable versions of all tools (see §4). |
| D13 | **Public and self-serve.** The app is live on a public URL. Anyone (jury included) signs in with their own GitHub account, installs the public Relay GitHub App on their own repo, connects their own Claude subscription's routine, and runs Relay on their own project. No dependency on the builder's accounts. |
| D14 | **"Run now"** on any task (own seat, ignores windows, still respects reserve) and a **temporary test window** ("Open a run window for the next 60 min") so testers and judges don't have to wait for their off-hours. |
| D15 | **Web only.** No desktop or menubar app. Usage data reaches Relay through the zero-dependency statusLine script posting directly with a personal usage token, or through the manual usage slider. Notifications live in the web app (in-app notification center + optional browser notifications while a Relay tab is open). |

Defaults chosen by the builder (changeable later, documented in §16): triage runs in the requester's normal run windows unless someone clicks "Triage now"; the digest is posted at the end of each member's off-hours window; a "demo clock" offset exists only in demo mode.

---

## 1. Problem

- On Claude Team plans, usage limits are **per member**, reset on each member's own 5-hour and weekly windows, and are **never pooled**.
- Heavy users hit limits and the org buys extra usage credits, while other seats expire unused every night.
- Running heavy agent work during the day burns the limits people need for interactive work.

## 2. Product overview

### 2.1 Layer 1 — Own seat, later
A member queues heavy or slow tasks. Relay runs them on **that member's own seat** during their off-hours window or their before-reset window. Daytime limits stay free for live work.

### 2.2 Layer 2 — Team sharing (opt-in)
A member enables sharing once. From then on, when their seat is in a run window and has headroom, Relay automatically runs **teammates'** queued tasks on it. Every action is attributed ("Requested by Ana · Run on Giorgi's seat"). The member can pause sharing at any time from the web app.

### 2.3 Lifecycle of a task

```
GitHub issue (label: relay)
   └─► Relay imports/creates task
         ├─ metadata missing/invalid ─► needs_triage ─► triage run ─► metadata written back to issue
         └─ metadata OK ─► queued
queued ─► scheduler picks a seat (own seat first, then opted-in teammates) when in a window with headroom
       ─► ledger check (file overlap) ─► blocked (waits) or dispatched (routine fired)
dispatched ─► routine pushes branch claude/relay-<taskId> with result file
           ─► Relay (webhook or poll) reads result
           ─► code/docs-with-files: draft PR · review: PR summary comment · business/docs-comment: issue comment
           ─► done ─► (PR merged ─► merged)
```

---

## 3. Users, roles, and what they see

| Role | Can do |
|---|---|
| **Owner** | Create workspace, install GitHub App, pick repo, invite members, toggle demo mode / dry run / demo clock, add simulated members, everything a member can. |
| **Member** | Configure own seat (time zone, windows, reserve, sharing, routine), create usage tokens, create tasks and recurring tasks, view board, digest, stats. |
| **Simulated member** (demo only) | Not a user. Created by owner in demo mode. Has a name, usage %, windows. Can be selected as requester. Never executes. Always labeled "Simulated". |
| **Tester / judge** | A normal user who brings their own GitHub account, repo, and Claude plan (Pro, Max, Team, or Enterprise with routines enabled). Usually solo: they create a workspace, optionally turn on demo mode to add simulated teammates and see the sharing flow, and run real tasks on their own seat. |

Workspace = one team + one GitHub repository. A one-person workspace is fully supported (Layer 1 works alone; Layer 2 can be explored with simulated teammates).

---

## 4. Tech stack (latest stable at build time)

Claude Code must resolve exact versions with `pnpm view <pkg> version` at the start (M0) and record them in `VERSIONS.md`. Versions below are the minimum expected as of October 2026.

| Area | Choice | Version floor / notes |
|---|---|---|
| Runtime | **Node.js 26** | 26.x (enters LTS 2026-10-28). If the hosting runtime doesn't offer 26 yet, deploy on the newest it offers (24 LTS) and keep code compatible. |
| Package manager | **pnpm** workspaces | latest |
| Web framework | **Next.js** App Router | ≥ 16.3. Use `proxy.ts` (not `middleware.ts`), Turbopack, React Compiler on. |
| UI runtime | **React** | ≥ 19.2 |
| Language | **TypeScript** | latest stable (7.x, native compiler). If Next.js/tooling is incompatible, pin latest 6.x and note it in `VERSIONS.md`. |
| Styling | **Tailwind CSS** | ≥ 4.3 (CSS-first config) |
| Components | **shadcn/ui** (Tailwind v4 compatible) + **lucide-react** | latest |
| Client data | **TanStack Query** | latest (board polling, optimistic updates) |
| Auth | **Better Auth** with GitHub social provider | latest. (Auth.js is in security-patch mode under the Better Auth team; do not use it.) |
| Database | **Neon Postgres** (serverless) | `@neondatabase/serverless` latest |
| ORM | **Drizzle ORM 1.x** + **drizzle-kit 1.x** | Use `drizzle-orm/zod` for schema-derived validation. |
| Validation | **zod** | latest |
| GitHub | **octokit** (App auth, REST) + **@octokit/webhooks** | latest |
| Time zones | **Temporal API** via `temporal-polyfill` | Native in Node 26; polyfill keeps every runtime consistent. |
| Cron parsing | `cron-parser` | latest |
| Tests | **Vitest 5** (+ Playwright for one smoke flow) | latest |
| Hosting | **Vercel** | Next.js app |
| Scheduler trigger | **GitHub Actions** scheduled workflow every 5 min → `/api/cron/tick` | Vercel Hobby cron is limited to once per day; on Vercel Pro, a `vercel.json` cron may replace the workflow. |
| Agent runner | **Claude Code Routines** `/fire` API | Research preview; isolate in one module. |

---

## 5. Repository layout (pnpm monorepo)

```
relay/
  apps/
    web/                 Next.js app (UI + API + webhooks + cron)
  packages/
    core/                Pure TS: types, scheduling, windows, headroom, ledger, priority, payload & result schemas
  scripts/
    relay-statusline.mjs Claude Code statusLine command (zero deps)
  routine/
    ROUTINE_PROMPT.md    The exact prompt each member pastes into their routine
  demo-repo/             Sample project pushed as its own GitHub repo for demos
  .github/workflows/
    tick.yml             Scheduled trigger for /api/cron/tick
    ci.yml               typecheck + test on PR
  VERSIONS.md
  README.md
  SPEC.md / CLAUDE.md
```

`packages/core` must have **no I/O**. All scheduling logic is pure functions with unit tests. `apps/web` imports types and helpers from it.

---

## 6. External integrations — facts the design relies on

### 6.1 Claude Code Routines
- Created by each member at `claude.ai/code/routines` with the workspace repo selected. Each run clones the repo from the default branch and pushes to `claude/`-prefixed branches.
- **API trigger**: `POST https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire`
  - Headers: `Authorization: Bearer <routine token>`, `anthropic-beta: experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`
  - Body: `{ "text": "<freeform>" }` (optional, not parsed)
  - Response: `{ "type": "routine_fire", "claude_code_session_id": "...", "claude_code_session_url": "https://claude.ai/code/..." }`
- The `text` arrives wrapped in a `<routine-fire-payload>` block labeled untrusted; the saved routine prompt **must explicitly instruct Claude to act on it** (see `routine/ROUTINE_PROMPT.md`, §9).
- Routines draw down subscription usage like interactive sessions and have a **daily run cap per account**. Runs take minutes.
- Actions in a routine appear on GitHub **as the member** (their GitHub identity).
- A routine running in the cloud cannot reach Relay directly. **GitHub is the message bus** (branch + result file). Relay detects completion through the GitHub App's `push` webhook, with polling as a fallback.
- The `/fire` endpoint is research preview: all calls live in `apps/web/lib/routine.ts`, with the beta header in one constant.

### 6.2 GitHub
- **Login**: Better Auth's GitHub provider using the **Relay GitHub App's own Client ID/secret** (GitHub Apps support user sign-in and several callback URLs). The app needs the account permission **Email addresses: Read-only** so Better Auth can read the user's email. There is **no separate OAuth App**.
- **Two GitHub Apps**: **Relay Dev** (webhooks via smee.io, callback `http://localhost:3000`, installable only on the builder's account, used for automated tests) and **Relay** (production URLs, installable by **any account**).
- **Repo operations**: a **Relay GitHub App** installed on the workspace repo. Permissions: Issues (read/write), Pull requests (read/write), Contents (read), Metadata (read). Webhook events: `issues`, `push`, `pull_request`, `installation`, `installation_repositories`.
- All Relay writes (issue creation, labels, comments, PRs, status comments) use the **App installation token** and appear as the Relay bot.

### 6.3 Usage data (headroom)
- Claude Code passes JSON to the configured **statusLine command** on each update; it can include rate-limit data (5-hour used percentage and reset time; possibly weekly).
- `scripts/relay-statusline.mjs` extracts it defensively and **POSTs it directly** to `POST /api/usage/beacon` using the member's personal **usage token** (`RELAY_URL` and `RELAY_USAGE_TOKEN` env vars). It also caches the last values in `~/.relay/beacon.json` and throttles posts to at most one per 60 s unless the values change.
- Field names are not guaranteed: the script saves the raw payload to `~/.relay/statusline-last.json` for debugging, and the web app always offers a manual slider fallback.

---

## 7. Data model (Drizzle, Postgres)

Better Auth generates its own tables (`user`, `session`, `account`, `verification`) via its CLI. Relay tables:

```ts
workspaces {
  id: text pk (cuid2)
  name: text
  githubInstallationId: bigint nullable
  repoOwner: text nullable
  repoName: text nullable
  defaultBranch: text nullable
  demoMode: boolean default false
  dryRun: boolean default false
  clockOffsetMinutes: integer default 0        // demo clock, only honored when demoMode
  createdByUserId: text
  createdAt: timestamptz
}

members {
  id: text pk
  workspaceId: fk
  userId: text nullable                        // null for simulated
  displayName: text
  githubLogin: text nullable
  role: 'owner' | 'member'
  simulated: boolean default false
  timezone: text default 'UTC'                  // IANA
  offHoursStart: text default '19:00'           // HH:mm local
  offHoursEnd: text default '08:00'             // may wrap past midnight
  beforeResetMinutes: integer default 120
  reservePct: integer default 10
  sharingEnabled: boolean default false
  paused: boolean default false
  maxConcurrent: integer default 1
  routineFireUrlEnc: text nullable              // AES-256-GCM
  routineTokenEnc: text nullable                // AES-256-GCM
  routineConfiguredAt: timestamptz nullable
  usedPct5h: real nullable
  resets5hAt: timestamptz nullable
  usedPctWeek: real nullable
  resetsWeekAt: timestamptz nullable
  usageSource: 'beacon' | 'manual' | 'simulated' | null
  usageUpdatedAt: timestamptz nullable
  digestIssueNumber: integer nullable
  lastDigestDate: text nullable                 // YYYY-MM-DD in member tz
  createdAt: timestamptz
  unique(workspaceId, userId)
}

usage_tokens {
  id: text pk
  memberId: fk
  name: text                                    // e.g. "MacBook statusLine"
  tokenHash: text                               // sha256 of the token; token shown once
  lastUsedAt: timestamptz nullable
  createdAt: timestamptz
}

tasks {
  id: text pk                                   // short, e.g. 'r7f3a'
  workspaceId: fk
  issueNumber: integer
  title: text
  body: text                                    // human description (without metadata block)
  type: 'code' | 'review' | 'docs' | 'business'
  likelyFiles: jsonb string[] default []
  doneCheck: text nullable                      // e.g. 'pnpm test'
  size: 'S' | 'M' | 'L' nullable
  targetPrNumber: integer nullable              // for review tasks
  priority: 'high' | 'normal' | 'low' default 'normal'
  requesterMemberId: fk
  assigneeMemberId: fk nullable
  status: TaskStatus
  statusReason: text nullable                   // human-readable "why" for current status
  blockedByTaskId: text nullable
  blockedOnFiles: jsonb string[] nullable
  runKind: 'triage' | 'work' nullable           // what the current/last run was
  windowKind: 'off_hours' | 'before_reset' | 'manual' nullable
  shared: boolean default false                 // assignee != requester
  requesterUsedPctAtDispatch: real nullable
  branch: text nullable                         // claude/relay-<id> (or -triage)
  sessionUrl: text nullable
  resultPrNumber: integer nullable
  resultPrUrl: text nullable
  resultCommentUrl: text nullable
  result: jsonb nullable                        // RelayResult
  statusCommentId: bigint nullable              // Relay's single status comment on the issue, edited in place
  recurringId: text nullable
  attempts: integer default 0
  estTokens: integer default 0
  costPct: real default 0
  createdAt, triagedAt, dispatchedAt, completedAt: timestamptz nullable
  unique(workspaceId, issueNumber)
}

type TaskStatus =
  | 'needs_triage' | 'triaging'
  | 'queued' | 'waiting_window' | 'blocked'
  | 'dispatched'
  | 'done' | 'merged'
  | 'failed' | 'stale' | 'cancelled';

recurring_tasks {
  id, workspaceId, creatorMemberId,
  title, body, type, likelyFiles, doneCheck, size, priority, targetPrNumber nullable,
  cron: text, timezone: text, enabled: boolean,
  nextRunAt: timestamptz, lastRunAt: timestamptz nullable, createdAt
}

events {
  id, workspaceId, taskId nullable, memberId nullable,
  kind: text, message: text, data: jsonb nullable, createdAt
}

notifications {
  id, memberId, kind: 'task_done_on_my_seat' | 'my_task_ready' | 'task_failed' | 'digest' | 'window_starting',
  title, body, url nullable, readAt nullable, createdAt
}

digests {
  id, memberId, date: text, markdown: text, commentUrl: text nullable, createdAt
}

invites {
  code: text pk, workspaceId, createdByMemberId, expiresAt, usedAt nullable
}
```

### 7.1 Constants (`packages/core/src/config.ts`)

```ts
export const SIZE_COST = {            // estimated share of a 5-hour window and tokens
  S: { pct: 5,  tokens: 150_000 },
  M: { pct: 12, tokens: 400_000 },
  L: { pct: 25, tokens: 900_000 },
} as const;
export const TRIAGE_COST = { pct: 3, tokens: 80_000 };
export const DEFAULT_SIZE = 'M';
export const BLENDED_USD_PER_MTOK = 6;          // estimate, always labeled "est."
export const STALE_AFTER_MINUTES = 40;
export const USAGE_STALE_MINUTES = 30;          // beacon older than this → estimate
export const RECENT_CHANGES_LIMIT = 5;
export const DRY_RUN_COMPLETE_AFTER_MS = 20_000;
export const MAX_ATTEMPTS = 2;
```

---

## 8. Issue format (single source of truth)

### 8.1 Labels
- `relay` — required; marks a Relay task.
- `relay:type/code` | `relay:type/review` | `relay:type/docs` | `relay:type/business` — optional if the metadata block has `type`.
- `relay:high` | `relay:low` — priority.
- `relay:recurring` — created by a recurring template.
- `relay-digest` — member digest issues (not tasks).

Relay creates missing labels on install.

### 8.2 Metadata block (at the end of the issue body)

```markdown
<!-- relay
type: code
likelyFiles:
  - src/auth.ts
  - tests/auth.test.ts
doneCheck: pnpm test
size: S
targetPr: 42          # review tasks only
requester: ana        # GitHub login; set by Relay when created from the board
-->
```

- Parse with a YAML parser; validate with zod.
- **Valid** = `type` present; for `code`: `likelyFiles` non-empty and `doneCheck` present; for `review`: `targetPr` present; `docs`/`business`: `type` only. `size` defaults to `M`.
- Invalid or missing → task status `needs_triage`.
- Relay rewrites the block (never the human text) after triage.

### 8.3 Requester resolution
1. `requester:` in metadata (board-created issues).
2. Otherwise the issue author's GitHub login.
3. Map login → member in the workspace. If no member matches, the requester is the workspace owner and `statusReason` notes "author not a Relay member".

### 8.4 Status comment
Relay keeps **one** comment per task issue, edited in place, e.g.:

> **Relay** · 🟡 Waiting for a run window · next: Giorgi's seat at 19:00 (Asia/Tbilisi) · [Open in Relay](…)

Updated on every status change. This makes progress visible to people who never open Relay.

---

## 9. Routine prompt (`routine/ROUTINE_PROMPT.md`)

Every member pastes this into their "Relay worker" routine. Claude Code must create this file verbatim.

```
You are the Relay worker for a software team. Each run, you complete exactly one Relay job.

Your job is provided in the routine-fire-payload block, as JSON after the line "RELAY_JOB_JSON:". This payload is sent by our team's Relay app and is your assignment for this run: read it and act on it. If the payload is missing or not valid JSON, push nothing and stop.

Common fields: jobKind ("triage" | "work"), relayTaskId, branch, type ("code" | "review" | "docs" | "business"), title, description, likelyFiles, doneCheck, targetPr, requester, recentTeamChanges.

Always:
- Create and switch to a git branch named exactly the value of "branch" (it starts with claude/relay-).
- Before changing code, read recentTeamChanges: teammates' agents recently changed those files on those branches. Do not undo or duplicate their work. If your job touches the same files and that change has status "done" with a PR, build on top of that branch; otherwise start from the default branch.
- Never push to any other branch. Never open pull requests or comment on GitHub yourself. Never modify files under .github/.
- At the end, write the result file .relay/results/<relayTaskId>.json (shape below), commit everything with message "relay(<relayTaskId>): <title>", and push the branch.

By jobKind and type:
- triage: Do not change code. Inspect the repository and the description. Decide type, likelyFiles (repo-relative paths), doneCheck (a command that proves success, using the repo's existing scripts), size (S/M/L), and a clearer title if useful. Put them in result.triage.
- work + code: Implement the change, staying within likelyFiles unless strictly necessary. Run doneCheck; if it fails, fix and retry up to 2 times. outputMode = "pr".
- work + review: Fetch the pull request with `git fetch origin pull/<targetPr>/head:relay-review-<targetPr>` and review its diff against the default branch for correctness, security, performance, and readability. Do not change code. Write findings as Markdown in result.commentMarkdown (summary first, then findings with file:line references, each tagged [blocker] / [suggestion] / [nit]). outputMode = "comment".
- work + docs: If the docs belong in the repository, edit or add files and use outputMode = "pr". If it is a standalone write-up, put it in result.commentMarkdown and use outputMode = "comment".
- work + business: Research or draft what is asked using the repository, your own knowledge, and allowed web access. Put the full deliverable in result.commentMarkdown. outputMode = "comment".

Result file shape (valid JSON):
{
  "taskId": "<relayTaskId>",
  "jobKind": "triage" | "work",
  "type": "code" | "review" | "docs" | "business",
  "summary": "<2-4 sentences>",
  "outputMode": "pr" | "comment" | "none",
  "commentMarkdown": "<markdown or empty string>",
  "filesChanged": ["..."],
  "checkCommand": "<doneCheck or empty>",
  "checkPassed": true | false | null,
  "triage": { "type": "...", "likelyFiles": ["..."], "doneCheck": "...", "size": "S|M|L", "title": "..." } | null,
  "notes": "<anything the reviewer must know>"
}
```

---

## 10. Core logic (`packages/core`) — pure functions, fully unit-tested

### 10.1 Time and windows
- `now(workspace)` = real now + `clockOffsetMinutes` **only if** `demoMode`. All scheduling functions take `now` as a parameter.
- `isInOffHours(member, now): boolean` — convert `now` to member's IANA time zone with Temporal; window `[offHoursStart, offHoursEnd)`; supports wrap past midnight (e.g. 19:00–08:00) and same-day windows.
- `isInBeforeReset(member, now, usage): boolean` — `usage.resets5hAt` known AND `0 < resets5hAt - now ≤ beforeResetMinutes`.
- `nextWindowStart(member, now, usage): Instant | null` — earliest upcoming start of either window (for UI and status comments).
- `activeWindowKind(...)`: `'off_hours' | 'before_reset' | null` (off_hours wins if both).

### 10.2 Headroom estimation
`estimateUsage(member, now, inFlightCostPct)` returns `{ usedPct5h, usedPctWeek | null, confidence: 'live' | 'estimated' | 'unknown' }`:
- If `resets5hAt` is in the past, the 5-hour window rolled over: base = 0.
- Else base = `usedPct5h` (from beacon/manual).
- Add `inFlightCostPct` = sum of `costPct` of tasks dispatched on this seat since `usageUpdatedAt` (Relay's own optimistic accounting, because the laptop/beacon may be offline at night).
- `confidence`: `live` if `usageUpdatedAt` within `USAGE_STALE_MINUTES`; `estimated` if older but computed; `unknown` if never reported (treat base as 0 but show "unknown" in UI).
- Weekly: if `usedPctWeek` known and not rolled over, also require `100 - usedPctWeek - cost ≥ reservePct`.

`hasHeadroom(member, estimate, costPct)` = `100 - estimate.usedPct5h - costPct ≥ member.reservePct` (and the weekly check when known).

### 10.3 Seat eligibility
A member is an **eligible seat** for a job when all hold:
- not `simulated`, not `paused`, routine configured;
- `activeWindowKind(member, now)` is not null;
- running jobs on this seat < `maxConcurrent`;
- `hasHeadroom(...)` for the job's cost;
- **own job** (member is requester) → always allowed; **teammate's job** → only if `sharingEnabled`.

### 10.4 Job selection and matching (`planTick`)
Input: workspace, members (with usage), tasks, now. Output: a list of **actions** (no side effects):

1. **Order** jobs: triage jobs (`needs_triage`) and work jobs (`queued`, `waiting_window`) together; sort by priority (`high` > `normal` > `low`), then `createdAt` ascending. Recurring and manual tasks are treated the same.
2. For each job in order:
   a. Cost = `TRIAGE_COST` for triage, else `SIZE_COST[size ?? DEFAULT_SIZE]`.
   b. **Own seat first**: if the requester is an eligible seat → choose it.
   c. Otherwise **opted-in teammates**: among eligible seats with `sharingEnabled`, choose the one with the largest `(100 - usedPct5h) - reservePct` after cost; tie-break by fewest jobs dispatched today.
   d. If no seat → action `wait` with `statusReason` = next window text (e.g. "Next window: Giorgi at 19:00 Asia/Tbilisi").
   e. If seat found and job is **work** of type `code` or `docs`: run **ledger check** (10.5). If blocked → action `block`.
   f. Otherwise → action `dispatch { taskId, memberId, runKind, windowKind, costPct, shared }`. Apply the cost to the in-memory estimate immediately so later jobs in the same tick see reduced headroom.
3. **Manual triage**: a task flagged `triageNow` (set by the "Triage now" button) skips the window requirement but still requires the requester's seat to have headroom (own seat only).
4. **Run now**: a task flagged `runNow` (set by the "Run now" button, available to the requester) is dispatched on the **requester's own seat** at the next tick, ignoring windows but still requiring headroom, routine configured, not paused, and the ledger check. `windowKind = 'manual'`. If the task still needs triage, triage runs first, then the work run follows immediately.
5. **Temporary test window**: a member may set `testWindowUntil` (max 60 minutes ahead). While `now < testWindowUntil`, `activeWindowKind` returns `'test'` for that member (treated like off-hours for eligibility, recorded as `windowKind = 'manual'`). Add `testWindowUntil: timestamptz nullable` to `members` and `runNow: boolean default false`, `triageNow: boolean default false` to `tasks`.

### 10.5 Change ledger
- **Active claims** = tasks with status `dispatched` and `runKind = 'work'` and type `code` | `docs`.
- `pathsOverlap(a, b)`: normalize (strip `./`, trailing `/`, collapse `//`); overlap if `a === b || a.startsWith(b + '/') || b.startsWith(a + '/')`. Glob characters are not supported (document this).
- If any overlap → `block` with `blockedByTaskId` and `blockedOnFiles`.
- Each tick re-evaluates blocked tasks: if their blocker is no longer `dispatched`, they return to normal ordering.
- `recentTeamChanges` for a payload = up to `RECENT_CHANGES_LIMIT` most recent tasks (excluding this one) with status `dispatched | done | merged` that have files: `{ taskId, branch, files, status, prUrl }`.

### 10.6 Payload builder
`buildJobPayload(task, runKind, recentTeamChanges, requesterLogin)`:

```json
{
  "jobKind": "work",
  "relayTaskId": "r7f3a",
  "branch": "claude/relay-r7f3a",
  "type": "code",
  "title": "...",
  "description": "...",
  "likelyFiles": ["src/auth.ts"],
  "doneCheck": "pnpm test",
  "targetPr": null,
  "requester": "ana",
  "recentTeamChanges": [ { "taskId": "r11aa", "branch": "claude/relay-r11aa", "files": ["src/billing.ts"], "status": "done", "prUrl": "https://github.com/..." } ]
}
```
Triage jobs use branch `claude/relay-<id>-triage-<attempt>`. Text sent to `/fire` = `"RELAY_JOB_JSON:\n" + JSON.stringify(payload, null, 2)`.

### 10.7 Result parsing
`parseResult(json): RelayResult` with zod; reject unknown `outputMode`; cap `commentMarkdown` at 60,000 chars (truncate with a note).

### 10.8 Recurring
`dueRecurring(templates, now)` → templates with `enabled && nextRunAt ≤ now`; `computeNextRun(cron, timezone, after)` with `cron-parser`.

### 10.9 Digest
`digestDue(member, now)`: true when `now` (member tz) is within the first 30 minutes after `offHoursEnd` and `lastDigestDate` ≠ today. `buildDigest(member, tasks, since)` → Markdown with sections: **Ran on your seat** (own + shared, with links), **Ready for you** (your requests completed), **Needs attention** (failed/stale), **Tonight's plan** (queued tasks likely to run on your seat). Empty sections omitted; if everything is empty, no digest.

### 10.10 Stats
- `tasksOffHours`, `tasksBeforeReset` (by `windowKind` of completed work runs)
- `tasksShared` (completed with `shared = true`)
- `estQuotaUsedPct` (sum of `costPct` of completed runs — quota that would otherwise have expired)
- `estTokensShared` and `estCreditsAvoidedUsd` = tokens of shared tasks whose `requesterUsedPctAtDispatch ≥ 100 - requester.reservePct` × `BLENDED_USD_PER_MTOK` / 1e6
- All shown with "est." labels.

---

## 11. Server behavior (`apps/web`)

### 11.1 Tick (`lib/engine/tick.ts`)
Entry points: `GET /api/cron/tick` (Bearer `CRON_SECRET`, called by GitHub Actions every 5 min), after relevant webhooks, after task creation, and from the owner's "Run tick" debug button. Per workspace, with a Postgres advisory lock (`pg_try_advisory_lock(hash(workspaceId))`) so ticks never overlap:

1. **Recurring**: create issues for due templates (labels `relay`, `relay:recurring`, type/priority labels, metadata block); advance `nextRunAt`.
2. **Reconcile results** for `dispatched` / `triaging` tasks: check branch + result file (fallback for missed webhooks); mark `stale` after `STALE_AFTER_MINUTES` (status comment links the session for inspection).
3. **Plan**: load members + usage + tasks, call `planTick` (core), apply actions:
   - `dispatch` → decrypt routine credentials, call `fire()`, store `sessionUrl`, `branch`, `assigneeMemberId`, `windowKind`, `shared`, `requesterUsedPctAtDispatch`, `costPct`, `dispatchedAt`; status `dispatched` (work) or `triaging` (triage); update status comment; notify assignee if shared. On fire error: `attempts++`; if `attempts ≥ MAX_ATTEMPTS` → `failed`, else back to previous status with `statusReason`.
   - `wait` / `block` → update status + `statusReason` + status comment (only if changed).
4. **Digests**: for members with `digestDue`, build digest; post as a comment on the member's digest issue (create `Relay digest · @login` with label `relay-digest` on first use), mentioning `@login`; store in `digests`; create a `digest` notification.
5. Record `events` for every state change.

### 11.2 Handling a result
Triggered by the `push` webhook (branch starts with `claude/relay-`) or by reconciliation:
1. Extract task id from the branch; load task; read `.relay/results/<taskId>.json` at that ref via the App token. Missing → wait for the next push/reconcile.
2. **Triage result**: write metadata block back into the issue body (preserving human text), set `type` label, comment "Triaged by @assignee's seat: …", status `queued`, `triagedAt`. Delete nothing.
3. **Work result** by `outputMode`:
   - `pr`: if `checkPassed === false` → `failed` (comment the summary + notes). Else open a **draft PR** (`head` = branch, `base` = default branch), title `[Relay <id>] <title>`, body: summary, files changed, check result, "Closes #<issue>" **only for code**, "Requested by @requester · Run on @assignee's seat via Relay", session link. Idempotent: reuse an existing PR for the same head. Status `done`.
   - `comment` + type `review`: post `commentMarkdown` as a comment on **PR #targetPr** (header: "Relay review · requested by @requester · run on @assignee's seat"), and a short link comment on the task issue. Status `done`.
   - `comment` (docs/business): post `commentMarkdown` on the **task issue**. Status `done`. (Comment results do not close the issue; the requester closes it.)
4. Notifications: `my_task_ready` to requester; `task_done_on_my_seat` to assignee when shared; `task_failed` on failure.

### 11.3 Webhooks (`POST /api/github/webhook`)
Verify signature with `@octokit/webhooks` and `GITHUB_WEBHOOK_SECRET`.
- `installation` / `installation_repositories`: link/unlink installation to the workspace that initiated it (state param), create labels.
- `issues.opened` / `labeled` / `edited` / `reopened`: if the issue has `relay` → upsert task (parse metadata, resolve requester, priority from labels). Removing `relay` or closing → `cancelled` (if not already done/merged). Ignore `relay-digest` issues.
- `push`: for `claude/relay-*` refs → handle result (11.2) and run a tick.
- `pull_request.closed` with `merged = true` and head `claude/relay-*` → task `merged`.
Every handler is idempotent.

### 11.4 Board-created tasks
`POST /api/w/:id/tasks` creates the GitHub issue (title, body + metadata block with `requester`, labels), then upserts the task immediately (don't wait for the webhook), then runs a tick.

### 11.5 DRY RUN mode (workspace setting)
- `fire()` returns `https://claude.ai/code/session_dryrun_<id>` without network.
- After `DRY_RUN_COMPLETE_AFTER_MS`, reconciliation synthesizes a plausible result (triage: fills missing metadata with likelyFiles from the description or `README.md`, size S, doneCheck `pnpm test`; work: passing result, `filesChanged = likelyFiles`, comment types get a short generated Markdown placeholder).
- GitHub writes still happen (issues, comments, status comments) **except PR creation**, which is replaced by a status-comment note "Dry run: PR would be opened from branch …".
- UI shows a yellow **DRY RUN** badge everywhere.

### 11.6 Security
- Routine fire URL and token encrypted with **AES-256-GCM** (`RELAY_ENCRYPTION_KEY`, 32 bytes base64); decrypted only inside `lib/routine.ts`; never returned to the client (UI shows "configured · trig_…XYZ").
- Usage tokens: random 32 bytes, shown once, stored as sha256; they can only call `POST /api/usage/beacon` for their own member.
- Every API route checks session membership in the workspace (or a usage token for the beacon route). Owner-only routes check role.
- Webhook signature verification; `CRON_SECRET` for tick.
- Rate limit task creation (10/min/member) with a simple Postgres-backed counter.
- Never log tokens, payload secrets, or full result bodies at info level.

---

## 12. API surface (`apps/web/app/api/...`)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET/POST /api/auth/[...all]` | — | Better Auth handler |
| `POST /api/workspaces` | session | Create workspace (creator = owner member) |
| `GET /api/workspaces/:id/github/install-url` | owner | GitHub App install URL with state |
| `POST /api/workspaces/:id/repo` | owner | Select repo from installation |
| `PATCH /api/workspaces/:id/settings` | owner | demoMode, dryRun, clockOffsetMinutes |
| `POST /api/workspaces/:id/invites` | owner | Create invite link |
| `POST /api/invites/:code/accept` | session | Join workspace as member |
| `GET /api/w/:id/state` | member | Board payload: members (usage estimates, windows), tasks, ledger, recent events, stats |
| `POST /api/w/:id/tasks` | member | Create task (creates issue) |
| `POST /api/w/:id/tasks/:taskId/triage-now` | member | Set triageNow + tick |
| `POST /api/w/:id/tasks/:taskId/run-now` | requester | Set runNow + tick |
| `POST /api/w/:id/me/test-window` | member | `{ minutes: 15–60 }` opens a temporary run window; `DELETE` closes it |
| `GET /api/w/:id/onboarding` | member | Checklist status (§21.2) |
| `DELETE /api/me/account` | session | Delete my user, memberships, usage tokens, encrypted routine credentials; owners must transfer or delete workspaces first |
| `DELETE /api/workspaces/:id` | owner | Delete workspace and all its Relay data (GitHub history untouched) |
| `GET /api/health` | — | DB + GitHub App reachability for the status page |
| `POST /api/w/:id/tasks/:taskId/retry` | member | failed/stale → re-queue (resets attempts) |
| `POST /api/w/:id/tasks/:taskId/cancel` | member | Cancel + remove `relay` label |
| `GET/POST/PATCH/DELETE /api/w/:id/recurring[/:rid]` | member | Recurring templates (creator or owner can edit) |
| `GET /api/w/:id/digests` | member | My digests |
| `PATCH /api/w/:id/me` | member | timezone, windows, beforeResetMinutes, reservePct, sharingEnabled, paused, maxConcurrent |
| `PUT /api/w/:id/me/routine` | member | Save fire URL + token (validated format, encrypted) |
| `POST /api/w/:id/me/routine/test` | member | **Optional** real test fire with a no-op triage payload; UI warns it uses one routine run |
| `PATCH /api/w/:id/members/:mid/usage` | member (self) / owner (simulated) | Manual usage slider |
| `POST /api/w/:id/simulated-members` | owner + demoMode | Add simulated member |
| `POST /api/w/:id/me/usage-tokens` | member | Create usage token (shown once) |
| `DELETE /api/w/:id/me/usage-tokens/:tid` | member | Revoke |
| `POST /api/usage/beacon` | usage token | `{ usedPct5h, resets5hAt?, usedPctWeek?, resetsWeekAt?, raw? }` |
| `GET /api/w/:id/notifications?since=` | member | My notifications (unread first) |
| `POST /api/w/:id/notifications/read` | member | Mark notifications read (`{ ids }` or `{ all: true }`) |
| `POST /api/w/:id/tick` | owner | Force tick (debug) |
| `GET /api/cron/tick` | Bearer CRON_SECRET | Tick all workspaces |
| `POST /api/github/webhook` | signature | GitHub App webhooks |

---

## 13. Web UI (`apps/web`)

Desktop-first, responsive down to tablet, light/dark themes, shadcn/ui components. Board polls `GET /api/w/:id/state` every 5 seconds via TanStack Query.

### 13.1 Pages
- `/` — landing: one-sentence pitch, 60-second demo video embed (URL from env `NEXT_PUBLIC_DEMO_VIDEO_URL`), "What you need" list (GitHub account, a repo you can install apps on, a Claude Pro/Max/Team/Enterprise plan with routines), "Sign in with GitHub", link to `/guide`.
- `/guide` — public step-by-step "Try Relay on your own project" guide (same content as §21.2, with screenshots placeholders the builder replaces).
- `/privacy` — what Relay stores (§21.4), how to delete it.
- `/w/[id]/start` — **Getting started checklist** (§21.2), shown automatically until complete.
- `/onboarding` — create a workspace or paste an invite link.
- `/w/[id]` — **Board** (main screen, §13.2).
- `/w/[id]/tasks/[taskId]` — task detail: description, metadata, status timeline (events), session link, PR/comment links, result summary and rendered `commentMarkdown`, actions (Triage now, Retry, Cancel, Open issue).
- `/w/[id]/recurring` — list + create/edit templates (title, type, description, likely files, done check, size, priority, schedule presets + custom cron, time zone, enabled).
- `/w/[id]/team` — members table: name, role, simulated badge, time zone, windows, sharing, paused, routine configured, usage (with confidence), next window. Owner: invite, add simulated member (demo mode).
- `/w/[id]/digest` — my digests, newest first.
- `/w/[id]/me` — **My seat**: time zone (auto-detect + select), off-hours start/end, before-reset minutes, reserve %, max concurrent, **sharing toggle** with a plain explanation ("Teammates' tasks will run on your Claude account and appear on GitHub as you. You can pause anytime."), pause toggle, routine setup wizard (step-by-step with the prompt from `routine/ROUTINE_PROMPT.md`, copy button, fields for URL + token, optional test fire), **usage data** (create/revoke usage tokens; copy-paste statusLine setup with `RELAY_URL` and the token pre-filled; last value received and when).
- `/w/[id]/settings` — owner: repo connection (GitHub App install/select), demo mode, dry run, **demo clock** (offset slider and "Jump to next window" button, visible only in demo mode), danger zone.

### 13.2 Board layout
- **Header**: workspace + repo, DRY RUN / DEMO badges, demo clock readout when offset ≠ 0, **notification bell** (§14), "New task" button (keyboard shortcut `N`; `⌘K` / `Ctrl+K` opens a command palette with "New task", "Open a 60-min test window", "Pause/resume my seat", "Toggle sharing").
- **Stats strip**: Off-hours runs · Before-reset runs · Shared runs · Est. quota used that would have expired · Est. credits avoided.
- **Column 1 — Seats**: card per member: name, simulated badge, usage ring (5h) with reserve marker, weekly bar if known, confidence pill (live/estimated/unknown/manual/simulated), current window ("Off-hours now" / "Before-reset window" / "Next: 19:00"), sharing on/off, paused, running jobs. Manual slider on own card and on simulated cards (owner).
- **Column 2 — Queue**: grouped by status (Running, Waiting, Needs triage, Done today, Failed). Task card: id, issue #, title, type icon, priority, size, "Ana → Giorgi's seat", status chip + `statusReason`, session ↗ / PR ↗ / comment ↗ links.
- **Column 3 — Ledger & activity**: active file claims (task → files), blocked tasks with their blockers, live event feed.

### 13.3 New task dialog
Fields: type (segmented: Code / Review / Docs / Business), title, description, likely files (chips; optional), done check (code), target PR (review; picker of open PRs), size (S/M/L, optional), priority, requester (defaults to me; in demo mode any member incl. simulated). If required metadata is missing, show "Will be triaged by an agent first" instead of blocking submission.

---

## 14. Notifications (web)

Relay is web-only; notifications live in the app.

- **Notification center**: bell icon in the header with unread count; dropdown list (newest first) with title, body, relative time, and link. Kinds: `task_done_on_my_seat`, `my_task_ready`, `task_failed`, `digest`, `window_starting`. "Mark all read".
- **Browser notifications (optional)**: on `/w/[id]/me`, a "Enable browser notifications" button requests permission via the Notification API. While any Relay tab is open, new notifications fetched by the board's polling also show as browser notifications. No service worker or push server is required.
- **Window-starting notice**: when a member's run window starts within the next 10 minutes and they have queued work, create a `window_starting` notification once per window.
- **Seat controls on the web**: pause/resume and sharing toggles are always one click away (seat card on the board, `/w/[id]/me`, and the command palette).

---

## 15. statusLine script (`scripts/relay-statusline.mjs`)

- Zero dependencies, ESM, must finish in < 300 ms, never throw.
- Read stdin JSON. Write raw to `~/.relay/statusline-last.json`.
- Extract defensively:
  - 5h used %: `rate_limits.five_hour.used_percentage` → `.utilization` → any numeric field under a `five_hour`-like key matching `/used|util|percent/`.
  - 5h reset: `rate_limits.five_hour.resets_at` → `.reset_at`.
  - Weekly: same under `seven_day` / `weekly`-like keys.
- Cache to `~/.relay/beacon.json` atomically (`.tmp` + rename): `{ usedPct5h, resets5hAt, usedPctWeek, resetsWeekAt, observedAt, lastPostedAt }`.
- If env `RELAY_URL` and `RELAY_USAGE_TOKEN` are set, POST to `${RELAY_URL}/api/usage/beacon` with `Authorization: Bearer <token>` (fire-and-forget, 500 ms timeout), at most once per 60 s unless the values changed.
- If the env vars are missing, print `Relay ▸ not connected` so the member notices.
- Print one status line: `Relay ▸ 5h 34% · wk 52%` (omit unknown parts) or `Relay ▸ no usage data`; prefix with model display name if present in the payload.
- The script is also served as a static file at `/relay-statusline.mjs` so members can download it with one `curl` command shown on `/w/[id]/me`.
- README and `/w/[id]/me` document adding to `~/.claude/settings.json`:
```json
{
  "statusLine": { "type": "command", "command": "node /ABSOLUTE/PATH/relay-statusline.mjs" },
  "env": { "RELAY_URL": "https://<your-domain>", "RELAY_USAGE_TOKEN": "<token from Relay>" }
}
```

---

## 16. Demo mode, simulated members, and demo script

### 16.1 Demo mode (workspace setting, owner only)
- Enables: adding simulated members, demo clock, requester selection of any member, a "Reset demo data" action (cancels tasks, clears events/stats for the workspace; never touches GitHub history).
- Simulated members are always visibly labeled **Simulated** (badge + tooltip "Not a real seat; never runs tasks").

### 16.2 Demo seed (owner action "Load demo team")
- Ana — Simulated, 96% used, off-hours 19:00–08:00 Asia/Tbilisi, sharing off.
- Luka — Simulated, 40% used, 20:00–09:00 Europe/Berlin, sharing on (displayed only).
- The real member (builder) — sharing on, routine configured.

### 16.3 Demo repo (`demo-repo/` → pushed as its own repository)
Tiny TypeScript project, tests run in < 5 s:
- `package.json` (pnpm, `test: vitest run`), lockfile committed.
- `src/billing.ts` — `calcInvoice(items, taxRate, discountCode?)`, no tests.
- `src/auth.ts` — `validateLogin(email, password)`, naive, with a TODO.
- `src/format.ts` — `formatMoney(cents, currency)` USD only, TODO for EUR/GEL.
- `tests/format.test.ts` — one passing test.
- `docs/` — short README section about the API (for a docs task).
- `.relay/results/.gitkeep`.
- `README.md` listing the prepared demo tasks:
  1. Code (Ana, high): "Add unit tests for calcInvoice" — `src/billing.ts`, `tests/billing.test.ts`, `pnpm test`, S.
  2. Code (me): "Add input validation to validateLogin" — `src/auth.ts`, `tests/auth.test.ts`, S.
  3. Code (Ana): "Return structured errors from validateLogin" — `src/auth.ts` → **blocked behind task 2**.
  4. Review (Luka): "Review PR #<task 1's PR>".
  5. Business (Ana): "Compare 3 approaches for multi-currency formatting and recommend one" — comment result.
  6. Created from the GitHub UI with only the `relay` label and a vague body → **needs_triage**.
  7. Recurring: "Weekly dependency audit" (docs, comment).

### 16.4 Demo script (3–4 minutes)
1. Problem: per-seat limits, never pooled; Ana maxed out (96%), my seat mostly idle.
2. Board: seats column (my live usage from the statusLine beacon + simulated teammates), stats strip.
3. Ana's high-priority task → assigned to **my seat** (sharing) because Ana is above her reserve. Open the live session link.
4. Create tasks 2 and 3 → task 3 shows **Blocked on src/auth.ts by r… ** (ledger).
5. My own task waits for my off-hours → **Jump to next window** (demo clock) → it dispatches.
6. Label a vague GitHub issue `relay` → appears as **Needs triage** → triage result fills metadata.
7. Show a finished draft PR and a business comment (fired before the talk; runs take minutes).
8. Notification bell (and a browser notification): "Your task r… is ready"; quick-add a task with `N` / `⌘K`.
9. Next morning: show a digest comment.
10. Close: "Same seats, more output, nothing pooled, every action attributed."

Fallback: flip DRY RUN on and replay; keep a screen recording of a real end-to-end run.

---

## 17. Environment variables (`apps/web/.env.example`)

```
DATABASE_URL=postgres://...neon.tech/relay?sslmode=require
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=...                 # from the GitHub App (used for sign-in)
GITHUB_CLIENT_SECRET=...
GITHUB_APP_ID=...
GITHUB_APP_SLUG=relay-dev
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."   # single line with \n escapes
GITHUB_WEBHOOK_SECRET=...
RELAY_ENABLE_TEST_LOGIN=0           # 1 only for local/CI tests; ignored in production (§22.2)
RELAY_ENCRYPTION_KEY=base64-32-bytes
CRON_SECRET=...
APP_URL=http://localhost:3000
```
Local webhook delivery: use smee.io (`smee-client`) documented in README. GitHub Actions secrets for `tick.yml`: `RELAY_TICK_URL`, `CRON_SECRET`.

---

## 18. Non-functional requirements

- Board loads < 1.5 s on a warm deployment; state endpoint < 300 ms p95 for 50 tasks.
- All scheduling logic in `packages/core` with ≥ 90% line coverage.
- Every external call has a timeout (routine 20 s, GitHub 15 s) and errors become `statusReason` + an event, never a crash.
- Idempotency: webhooks and ticks can repeat without duplicate PRs, comments, or issues (store GitHub IDs; check before create).
- Accessibility: keyboard-navigable board and dialogs, visible focus, color is never the only status signal.
- Time zones: all storage in UTC; display in viewer's time zone; windows evaluated in each member's own time zone.

---

## 19. Out of scope

Desktop/menubar app and native OS notifications; mobile app; Slack integration; per-task approvals; redo-from-comment; second-opinion reviews; protected paths and spend caps; seat right-sizing recommendations; multi-repo workspaces; billing.

---

## 20. Milestones and acceptance checks

| # | Milestone | Done when |
|---|---|---|
| M0 | Versions + monorepo scaffold | `VERSIONS.md` lists resolved versions; `pnpm i && pnpm -r typecheck` passes; CI workflow runs typecheck + tests |
| M1 | `packages/core` | All functions in §10 implemented; Vitest suites cover windows (wrap, DST change, same-day), before-reset, headroom (rollover, stale, in-flight), eligibility (sharing off, paused, simulated, maxConcurrent), matching order (own seat first, priority, oldest, tie-breaks), ledger overlap, recurring next-run, digest due; coverage ≥ 90% |
| M2 | DB + auth + onboarding | Sign in with GitHub, create workspace, invite + accept, members table |
| M3 | GitHub App + issue sync | App install links repo; labels created; issues with `relay` appear as tasks (metadata parsed, requester resolved); closing/unlabeling cancels; board-created task opens an issue |
| M4 | My seat + routine registration + usage tokens | Settings persist; routine URL/token encrypted and masked; usage token create/revoke; `POST /api/usage/beacon` works with a usage token and rejects others |
| M5 | Engine + DRY RUN | In dry run: tasks 1–3 of §16.3 behave as specified (task 3 blocked, then dispatched); waiting tasks show next-window text; status comments update on GitHub; results produce comment/PR-note; events recorded |
| M6 | Triage | Vague `relay` issue → needs_triage → (dry run) metadata written back to issue → queued → runs |
| M7 | Recurring | Template with a 1-minute-ahead schedule creates an issue on the next tick and advances `nextRunAt` |
| M8 | Digest + notifications | With demo clock past a member's off-hours end, a digest comment is posted on their digest issue and a notification created |
| M9 | statusLine script | With `RELAY_URL` + `RELAY_USAGE_TOKEN` set, `echo '{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":"2026-10-17T20:00:00Z"}}}' \| node scripts/relay-statusline.mjs` prints `Relay ▸ 5h 42%`, writes `~/.relay/beacon.json`, and the member card shows 42% (source live) |
| M10 | Web notifications + command palette | Bell shows unread notifications for task done/ready/failed, digest, and window starting; browser notifications appear when enabled and a tab is open; `N` and `⌘K` work; pause/sharing toggles work from the board |
| M11 | Board UI + stats + demo mode | All pages in §13; demo team seed; demo clock "Jump to next window"; stats strip correct against fixture data |
| M12 | Demo repo | `demo-repo/` complete with lockfile; `pnpm test` passes inside it |
| M13 | Real routine integration | Claude Code performs this itself within `REAL_FIRE_BUDGET` (default 3 real fires, §22.5) against the sandbox repo: one real code task → branch → draft PR; one triage → metadata written; if budget remains, one review → PR comment. Each fire is logged in `PROGRESS.md` |
| M14 | Deploy | Claude Code deploys with the Vercel CLI (`VERCEL_TOKEN`), sets production env vars, runs migrations on the production database, sets GitHub Actions secrets with `gh`, and verifies production: `/api/health` OK, landing renders, sign-in redirects to GitHub, `/api/cron/tick` returns 401 without the secret and 200 with it, a prod webhook delivery is accepted; Playwright smoke test passes in CI |
| M15 | Public self-serve | Production GitHub App is installable by any account; `demo-repo/` pushed to `DEMO_TEMPLATE_REPO` and marked as a template (`gh repo edit --template`); landing, `/guide`, `/privacy`, `/w/[id]/start` checklist live; Run now and test window work; account/workspace deletion works (tested). **Final human check (after the build):** a second GitHub account completes the checklist on a fresh copy of the template and gets a real draft PR from its own routine |

---

## 21. Public launch and jury self-serve

### 21.1 Principle
Judges test Relay **on their own project with their own subscription**. Relay never uses the builder's Claude account or repos for other people's work. Everything a judge needs is reachable from the public URL.

### 21.2 Getting started checklist (`/w/[id]/start`, also the content of `/guide`)
Each step shows a status (✅ / ⏳ / ⚠️) computed by `GET /api/w/:id/onboarding`, with a one-click action and a short "why":

1. **Sign in with GitHub** — done on arrival.
2. **Create a workspace** — name it.
3. **Connect a repository** — "Install Relay GitHub App" (choose one repo). Offer **"Don't want to use a real project? Create a copy of the Relay demo repo"** → link to the demo repo's GitHub "Use this template" page; the user then installs the app on their new copy. ✅ when installation + repo selected and labels created.
4. **Connect your Claude seat** — routine wizard:
   a. "Open claude.ai/code/routines → New routine" (link), name `Relay worker`.
   b. Select the same repository (requires Claude's GitHub access to it; link to Claude Code's GitHub setup docs).
   c. Environment: Default; setup script suggestion based on repo (`pnpm install` / `npm ci` / blank).
   d. Paste the prompt (copy button, content of `routine/ROUTINE_PROMPT.md`), remove connectors.
   e. Add an **API trigger**, copy URL, generate token, paste both here. ✅ when saved and format-valid.
   f. Optional "Send test run" (warns: uses one routine run and some quota).
5. **Set your windows** — time zone (auto-detected), off-hours, before-reset, reserve. Defaults pre-filled; ✅ once saved.
6. **Usage data (optional, recommended)** — create a usage token, then copy the one-line download command and the `settings.json` snippet (pre-filled with the Relay URL and token) to connect Claude Code's statusLine. ✅ when the first value arrives; ⚠️ "Manual mode" if skipped (manual slider works).
7. **Try it now** — "Create a sample task" pre-fills a small, safe code task for the connected repo (if it's the demo template: task 1 from §16.3; otherwise a docs task: "Write a CONTRIBUTING.md summarizing how to run and test this repo" as type `docs`), then shows **Run now** and **Open a 60-min test window**. ✅ when the first result lands (PR or comment).
8. **Explore sharing (optional)** — "Turn on demo mode to add simulated teammates" → loads the demo team and explains Layer 2.

### 21.3 Demo template repository
- `demo-repo/` is pushed as a **public GitHub template repository** (`<builder>/relay-demo`, "Template repository" checked) so anyone can create their own copy in one click.
- Its README explains it exists to try Relay and lists the prepared tasks (§16.3).

### 21.4 Multi-tenant safety and privacy
- Strict workspace isolation in every query (workspaceId from membership, never from the client alone); add tests that a member of workspace A gets 404 for workspace B resources.
- Data stored: GitHub profile basics, workspace/member settings, task metadata and results mirrored from GitHub, encrypted routine credentials, hashed usage tokens, usage percentages. No source code is stored; result Markdown is stored to display it in Relay.
- Deletion: `DELETE /api/me/account` and `DELETE /api/workspaces/:id` remove all Relay data; uninstalling the GitHub App marks the workspace disconnected (installation webhook).
- Abuse limits: 10 task creations/min/member, 200 tasks/day/workspace, 20 workspaces per user, max 1 concurrent "test run" per member. Limits return friendly errors.
- The GitHub App requests only the permissions in §6.2. The app is **public** ("Any account" can install).
- `/privacy` states the above in plain language.

### 21.5 Operational readiness for judging
- `/api/health` and a tiny status line in the footer ("All systems normal" / degraded).
- Error tracking: structured server logs (Vercel) with request ids; user-facing errors include the request id.
- Seed nothing into production except the builder's own workspace; judges start clean.
- README "For judges" section at the top: live URL, what you need, 5-minute path (checklist), demo video link, known limitations (routine runs take minutes; routines are research preview; Team/Enterprise owners can disable routines).

### 21.6 Demo video support
- Demo mode + "Load demo team" + demo clock make the full story recordable in one take on the builder's own workspace.
- "Reset demo data" returns the workspace to a clean state between takes.
- Before recording, fire 2–3 real tasks so finished PRs/comments exist (runs take minutes).

---

## 22. Testing and autonomous verification

Claude Code builds Relay unattended and must prove each milestone works before moving on. "It compiles" is never enough.

### 22.1 Test layers
| Layer | Tool | Runs against | Required from |
|---|---|---|---|
| Unit | Vitest | `packages/core` pure functions | M1 |
| Integration | Vitest | Real Postgres (the **dev** Neon branch from `.env.setup`); tables truncated between tests | M2 |
| GitHub integration | Vitest | The **sandbox repo** (`TEST_REPO`) through the **Relay Dev** GitHub App; every issue created by tests gets the label `relay-test` and is closed in teardown | M3 |
| Webhook end-to-end | Script + Vitest | `next dev` + `smee-client` forwarding `SMEE_URL` → `/api/github/webhook`; create/label an issue in the sandbox via API and assert the task appears in the DB within 30 s | M3 |
| Browser end-to-end | Playwright | `next dev` with test login (§22.2); flows: onboarding checklist, create task, board updates, run-now (dry run), recurring, digest, notifications, settings | M5 |
| Visual review | Playwright screenshots | Every page in light and dark at 1440 px and 768 px, saved to `test-artifacts/screens/<milestone>/`; Claude Code opens the images and fixes layout problems it sees | M5 onward (UI milestones) |
| Production smoke | Script | Live URL after deploy | M14 |

`pnpm test` runs unit + integration; `pnpm test:github`, `pnpm test:e2e`, `pnpm test:visual`, `pnpm test:prod` run the other layers. CI runs unit + integration + e2e (with a CI database URL secret if provided; otherwise unit only).

### 22.2 Test login (never in production)
- Route `POST /api/test/login` with `{ githubLogin, name }` creates (or reuses) a user and a Better Auth session and sets the session cookie.
- Enabled **only** when `RELAY_ENABLE_TEST_LOGIN=1` **and** `NODE_ENV !== 'production'` **and** `VERCEL_ENV !== 'production'`. Otherwise the route returns 404. A unit test asserts this guard.
- Test users never get GitHub tokens; GitHub writes in tests use the GitHub App installation token, as in production.

### 22.3 Dry run by default
All automated tests use workspaces with `dryRun = true`. The GitHub side is real (sandbox repo); the routine side is simulated (§11.5).

### 22.4 Preflight
`scripts/preflight.mjs` (written and run at the start of M0) checks: tool versions (node, pnpm, git, gh auth, vercel CLI), every required variable in `.env.setup`, database connectivity, GitHub App authentication and installation on `TEST_REPO` for the dev app, smee URL reachability, Vercel token validity. It prints a checklist with ✅/❌ and exits non-zero on any ❌.

### 22.5 Real routine runs
- `REAL_FIRE_BUDGET` (default 3) is the **maximum number of real `/fire` calls in the whole build**, used only in M13 against `TEST_REPO` with the routine from `.env.setup`.
- Each fire is recorded in `PROGRESS.md` (time, task, session URL, outcome). When the budget is spent, remaining M13 checks are marked "needs human" with exact steps.

### 22.6 Secret hygiene check
`scripts/check-secrets.mjs` scans staged files for private keys, tokens, and connection strings (patterns: `BEGIN .*PRIVATE KEY`, `ghs_`, `ghp_`, `github_pat_`, `sk-ant-`, `postgres://.*@`, values of variables listed in `.env.setup`). A git pre-commit hook runs it; commits with findings are blocked.
