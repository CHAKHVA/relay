/**
 * M13: real routine fires against the sandbox repo (budget: REAL_FIRE_BUDGET, default 3).
 *   1) a real code task → branch → draft PR
 *   2) a vague issue → triage → metadata written back
 *   3) a review of fire 1's PR → PR comment
 * Run: pnpm --filter web exec tsx scripts/real-fires.ts [1|2|3]   (each step is resumable and fires at most once)
 * Never prints credentials. Every fire is appended to ../../PROGRESS.md by hand after the run (see output).
 */
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '..', '.env.test'), quiet: true });
process.env.RELAY_ENABLE_TEST_LOGIN = '1';

const helperPath = '../../../scripts/lib/env-setup.mjs';
const { loadEnvSetup } = (await import(helperPath)) as { loadEnvSetup: () => Record<string, string> };
const setup = loadEnvSetup();
const budget = Number(setup.REAL_FIRE_BUDGET ?? 3);

const { db, schema, pool } = await import('../lib/db').then((m) => ({ ...m, pool: m.pool }));
const { loginTestUser } = await import('../lib/test-auth');
const { createWorkspace } = await import('../lib/services/workspaces');
const { saveRoutine, updateSeat, setTestWindow } = await import('../lib/services/seat');
const { createTask } = await import('../lib/services/tasks');
const { runTick } = await import('../lib/engine/tick');
const { reconcileWorkspace } = await import('../lib/engine/results');
const { sandboxInstallationId, sandboxOctokit, TEST_OWNER, TEST_NAME } = await import('../test/helpers/github');
const { handleWebhook } = await import('../lib/engine/webhook');

const step = process.argv[2] ?? 'all';
const NAME = 'M13 real fires';
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fireCount(wsId: string) {
  const evs = await db().select().from(schema.events).where(eq(schema.events.workspaceId, wsId));
  return evs.filter((e) => e.kind === 'task_dispatched' || e.kind === 'dispatch_triage').length;
}

async function ensureWorkspace() {
  const { user } = await loginTestUser(TEST_OWNER, 'Giorgi (real fires)');
  const [existing] = await db().select().from(schema.workspaces).where(and(eq(schema.workspaces.name, NAME), eq(schema.workspaces.createdByUserId, user.id)));
  let wsId = existing?.id;
  if (!wsId) {
    const created = await createWorkspace(user, { name: NAME, timezone: 'UTC' });
    wsId = created.workspace.id;
  }
  const gh = await sandboxOctokit();
  const { data: repo } = await gh.rest.repos.get({ owner: TEST_OWNER, repo: TEST_NAME });
  await db()
    .update(schema.workspaces)
    .set({ githubInstallationId: await sandboxInstallationId(), repoOwner: TEST_OWNER, repoName: TEST_NAME, defaultBranch: repo.default_branch, dryRun: false, demoMode: false })
    .where(eq(schema.workspaces.id, wsId));
  const [member] = await db().select().from(schema.members).where(and(eq(schema.members.workspaceId, wsId), eq(schema.members.role, 'owner')));
  if (!member!.routineConfiguredAt) await saveRoutine(member!, { fireUrl: setup.ROUTINE_FIRE_URL!, token: setup.ROUTINE_TOKEN! });
  const [ws] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId));
  const [m2] = await db().select().from(schema.members).where(eq(schema.members.id, member!.id));
  return { ws: ws!, member: m2!, gh };
}

/** Dispatch exactly one task for real, pause the seat, then reconcile until the result lands. */
async function runOne(ctx: Awaited<ReturnType<typeof ensureWorkspace>>, taskId: string, label: string) {
  const { ws, member } = ctx;
  if ((await fireCount(ws.id)) >= budget) throw new Error(`Real fire budget (${budget}) is spent`);
  await updateSeat(member, { paused: false, maxConcurrent: 1 });
  await setTestWindow(member, 60);
  await db().update(schema.tasks).set({ runNow: true }).where(eq(schema.tasks.id, taskId));
  const s = await runTick(ws.id);
  log(label, 'tick', JSON.stringify(s));
  const [t] = await db().select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
  if (!t || !['dispatched', 'triaging'].includes(t.status)) throw new Error(`${label}: not dispatched (${t?.status}: ${t?.statusReason})`);
  log(label, 'FIRED. session:', t.sessionUrl, 'branch:', t.branch);
  // From here only reconcile (no planning), so a finished triage cannot cause a second fire.
  await updateSeat(member, { paused: true });
  const deadline = Date.now() + 40 * 60_000;
  while (Date.now() < deadline) {
    await sleep(30_000);
    await reconcileWorkspace((await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, ws.id)))[0]!, new Date());
    const [cur] = await db().select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    log(label, 'status', cur!.status, cur!.statusReason ?? '');
    if (!['dispatched', 'triaging'].includes(cur!.status)) return cur!;
  }
  throw new Error(`${label}: timed out waiting for the routine`);
}

const ctx = await ensureWorkspace();
const { ws, member, gh } = ctx;
const ref = { owner: TEST_OWNER, repo: TEST_NAME };
const wsRow = () => ws;
void wsRow;

async function taskByTitle(title: string) {
  const rows = await db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ws.id));
  return rows.find((t) => t.title === title);
}

try {
  if (step === 'all' || step === '1') {
    const title = 'Add a greet() helper';
    let t = await taskByTitle(title);
    if (!t) {
      t = await createTask(ws, member, {
        type: 'code',
        title,
        description: 'Create `src/greeting.js` (CommonJS) exporting `greet(name)` that returns `Hello, <name>!`.',
        likelyFiles: ['src/greeting.js'],
        doneCheck: "node -e \"const {greet}=require('./src/greeting.js'); if (greet('Ana')!=='Hello, Ana!') process.exit(1)\"",
        size: 'S',
        extraLabels: ['relay-test'],
      });
    }
    if (['queued', 'waiting_window', 'blocked'].includes(t.status)) t = await runOne(ctx, t.id, 'fire1-code');
    log('fire1 result:', t.status, t.resultPrUrl ?? t.statusReason);
  }
  if (step === 'all' || step === '2') {
    const title = 'Make the readme more helpful';
    let t = await taskByTitle(title);
    if (!t) {
      const { data: issue } = await gh.rest.issues.create({ ...ref, title, body: 'The README should explain how a newcomer runs things and what this repository is for.', labels: ['relay', 'relay-test'] });
      await handleWebhook('issues', { action: 'opened', installation: { id: ws.githubInstallationId }, repository: { name: TEST_NAME, owner: { login: TEST_OWNER }, full_name: `${TEST_OWNER}/${TEST_NAME}` }, issue });
      t = (await taskByTitle(title))!;
      // The webhook runs a tick that may already have fired the triage if a window is open; it isn't (no test window yet).
    }
    if (t.status === 'needs_triage') t = await runOne(ctx, t.id, 'fire2-triage');
    log('fire2 result:', t.status, `type=${t.type} files=${JSON.stringify(t.likelyFiles)} check=${t.doneCheck}`);
  }
  if (step === 'all' || step === '3') {
    const code = await taskByTitle('Add a greet() helper');
    if (!code?.resultPrNumber) throw new Error('Fire 1 has no PR to review yet');
    const title = `Review PR #${code.resultPrNumber}`;
    let t = await taskByTitle(title);
    if (!t) {
      t = await createTask(ws, member, { type: 'review', title, description: 'Review the draft PR for correctness and style.', targetPr: code.resultPrNumber, size: 'S', extraLabels: ['relay-test'] });
    }
    if (['queued', 'waiting_window', 'blocked'].includes(t.status)) t = await runOne(ctx, t.id, 'fire3-review');
    log('fire3 result:', t.status, t.resultCommentUrl ?? t.statusReason);
  }
} finally {
  await updateSeat(member, { paused: true }).catch(() => {});
  log('fires used so far:', await fireCount(ws.id), '/', budget);
  await pool().end();
}
