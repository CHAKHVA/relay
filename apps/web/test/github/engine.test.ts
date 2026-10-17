import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { handleResultForTask } from '@/lib/engine/results';
import { runTick } from '@/lib/engine/tick';
import { newId } from '@/lib/ids';
import { cancelTask, retryTask, runNow } from '@/lib/services/task-actions';
import { createTask } from '@/lib/services/tasks';
import { setTestWindow, updateSeat } from '@/lib/services/seat';
import { truncateAll } from '../helpers/db';
import { TEST_LABEL, TEST_NAME, TEST_OWNER, cleanSandbox, configureRoutine, ghPushFile, makeSandboxWorkspace, sandboxOctokit } from '../helpers/github';

const ref = { owner: TEST_OWNER, repo: TEST_NAME };
let ctx: Awaited<ReturnType<typeof makeSandboxWorkspace>>;
let simAna: typeof schema.members.$inferSelect;
const later = (s: number) => new Date(Date.now() + s * 1000);

beforeAll(async () => cleanSandbox(await sandboxOctokit()));
afterAll(async () => cleanSandbox(await sandboxOctokit()));

beforeEach(async () => {
  await truncateAll();
  ctx = await makeSandboxWorkspace();
  await db().update(schema.workspaces).set({ demoMode: true }).where(eq(schema.workspaces.id, ctx.wsId));
  ctx.workspace = { ...ctx.workspace, demoMode: true };
  await configureRoutine(ctx.member.id);
  // The builder's seat: shares, up to 3 concurrent, always inside an off-hours window (all-day wrap).
  await updateSeat(ctx.member, { sharingEnabled: true, maxConcurrent: 3, offHoursStart: '00:00', offHoursEnd: '23:59' });
  const [ana] = await db()
    .insert(schema.members)
    .values({ id: newId(), workspaceId: ctx.wsId, displayName: 'Ana', simulated: true, usedPct5h: 96, usageSource: 'simulated', usageUpdatedAt: new Date(), sharingEnabled: false })
    .returning();
  simAna = ana!;
});

const mk = (over: Record<string, unknown>) =>
  createTask(ctx.workspace, ctx.member, { type: 'code', title: 'T', extraLabels: [TEST_LABEL], doneCheck: 'pnpm test', likelyFiles: ['src/x.ts'], size: 'S', ...over } as never);
const get = async (id: string) => (await db().select().from(schema.tasks).where(eq(schema.tasks.id, id)))[0]!;
const statusComment = async (issue: number) => {
  const cs = await ctx.gh.paginate(ctx.gh.rest.issues.listComments, { ...ref, issue_number: issue });
  return cs.filter((c) => c.body?.includes('relay-status'));
};

describe('engine in DRY RUN (SPEC §16.3 tasks 1–3)', () => {
  it('shares Ana’s task onto the builder seat, blocks task 3 behind task 2, then dispatches it', async () => {
    const t1 = await mk({ title: 'Add unit tests for calcInvoice', likelyFiles: ['src/billing.ts', 'tests/billing.test.ts'], priority: 'high', requesterMemberId: simAna.id });
    const t2 = await mk({ title: 'Add input validation to validateLogin', likelyFiles: ['src/auth.ts', 'tests/auth.test.ts'] });
    const t3 = await mk({ title: 'Return structured errors from validateLogin', likelyFiles: ['src/auth.ts'], requesterMemberId: simAna.id });

    const s = await runTick(ctx.wsId);
    expect(s).toMatchObject({ dispatched: 2, blocked: 1 });
    const [a, b, c] = [await get(t1.id), await get(t2.id), await get(t3.id)];
    expect(a).toMatchObject({ status: 'dispatched', assigneeMemberId: ctx.member.id, shared: true, windowKind: 'off_hours' });
    expect(a.sessionUrl).toMatch(/session_dryrun_/);
    expect(a.branch).toBe(`claude/relay-${t1.id}`);
    expect(b).toMatchObject({ status: 'dispatched', shared: false });
    expect(c).toMatchObject({ status: 'blocked', blockedByTaskId: t2.id, blockedOnFiles: ['src/auth.ts'] });
    expect(c.statusReason).toContain('Blocked on src/auth.ts');

    // A second tick changes nothing (idempotent): no duplicate dispatch, one status comment each.
    expect(await runTick(ctx.wsId)).toMatchObject({ dispatched: 0, blocked: 1 });
    for (const t of [a, b, c]) expect(await statusComment(t.issueNumber)).toHaveLength(1);
    expect((await statusComment(a.issueNumber))[0]!.body).toContain('Running');
    expect((await statusComment(c.issueNumber))[0]!.body).toContain('Blocked');

    // After the dry-run delay both running tasks complete; task 3 is released and dispatched.
    const s2 = await runTick(ctx.wsId, { realNow: later(25) });
    expect(s2!.reconciled).toBe(2);
    expect((await get(t1.id)).status).toBe('done');
    expect((await get(t2.id)).status).toBe('done');
    expect(await get(t3.id)).toMatchObject({ status: 'dispatched' });
    const done = await get(t2.id);
    expect(done.resultPrUrl).toBeNull();
    expect((await statusComment(done.issueNumber))[0]!.body).toContain('Dry run: PR would be opened from branch');

    await runTick(ctx.wsId, { realNow: later(60) });
    expect((await get(t3.id)).status).toBe('done');

    const kinds = (await db().select().from(schema.events).where(eq(schema.events.workspaceId, ctx.wsId))).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['task_created', 'task_dispatched', 'task_blocked', 'task_done']));
    const notes = await db().select().from(schema.notifications).where(eq(schema.notifications.memberId, ctx.member.id));
    expect(notes.map((n) => n.kind)).toEqual(expect.arrayContaining(['my_task_ready', 'task_done_on_my_seat']));
  });

  it('simulated members never execute, even when they are the only sharer', async () => {
    await db().update(schema.members).set({ sharingEnabled: true, usedPct5h: 0 }).where(eq(schema.members.id, simAna.id));
    await updateSeat(ctx.member, { paused: true });
    const t = await mk({ requesterMemberId: simAna.id });
    await runTick(ctx.wsId);
    const row = await get(t.id);
    expect(row.status).toBe('waiting_window');
    expect(row.assigneeMemberId).toBeNull();
  });

  it('a task outside any window waits with next-window text; Run now overrides on the requester seat', async () => {
    await updateSeat(ctx.member, { offHoursStart: '03:00', offHoursEnd: '03:01', timezone: 'UTC' });
    // Move the workspace clock so we are definitely outside 03:00–03:01 UTC.
    const t = await mk({ title: 'My own task' });
    await runTick(ctx.wsId, { realNow: new Date('2026-06-01T12:00:00Z') });
    const w = await get(t.id);
    expect(w.status).toBe('waiting_window');
    expect(w.statusReason).toMatch(/^Next window: .* at 03:00 UTC/);
    expect((await statusComment(w.issueNumber))[0]!.body).toContain('Waiting for a run window');

    await runNow(ctx.workspace, ctx.member, t.id);
    await runTick(ctx.wsId, { realNow: new Date('2026-06-01T12:00:00Z') });
    expect(await get(t.id)).toMatchObject({ status: 'dispatched', windowKind: 'manual', runNow: false });
  });

  it('test window opens a run window for the requester', async () => {
    await updateSeat(ctx.member, { offHoursStart: '03:00', offHoursEnd: '03:01' });
    const t = await mk({});
    await runTick(ctx.wsId, { realNow: new Date('2026-06-01T12:00:00Z') });
    expect((await get(t.id)).status).toBe('waiting_window');
    await setTestWindow(ctx.member, 30, new Date('2026-06-01T12:00:00Z'));
    await runTick(ctx.wsId, { realNow: new Date('2026-06-01T12:01:00Z') });
    expect(await get(t.id)).toMatchObject({ status: 'dispatched', windowKind: 'manual' });
  });

  it('business / review tasks post their comment on GitHub; retry and cancel work', async () => {
    const biz = await mk({ type: 'business', title: 'Compare approaches', likelyFiles: [], doneCheck: undefined });
    await runTick(ctx.wsId);
    await runTick(ctx.wsId, { realNow: later(25) });
    const done = await get(biz.id);
    expect(done.status).toBe('done');
    expect(done.resultCommentUrl).toMatch(/issuecomment/);
    const cs = await ctx.gh.paginate(ctx.gh.rest.issues.listComments, { ...ref, issue_number: done.issueNumber });
    expect(cs.some((c) => c.body?.includes('Relay result'))).toBe(true);

    const c = await mk({ title: 'to cancel' });
    await cancelTask(ctx.workspace, ctx.member, c.id);
    expect((await get(c.id)).status).toBe('cancelled');
    await db().update(schema.tasks).set({ status: 'failed' }).where(eq(schema.tasks.id, c.id));
    expect((await retryTask(ctx.workspace, ctx.member, c.id)).status).toBe('queued');
  });

  it('concurrent ticks never double-dispatch', async () => {
    const t = await mk({});
    const [a, b] = await Promise.all([runTick(ctx.wsId), runTick(ctx.wsId)]);
    expect([a, b].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const evs = (await db().select().from(schema.events).where(eq(schema.events.taskId, t.id))).filter((e) => e.kind === 'task_dispatched');
    expect(evs).toHaveLength(1);
  });
});

describe('result handling against real GitHub (non-dry-run)', () => {
  it('push → result file → draft PR (idempotent); failed check → failed', async () => {
    await db().update(schema.workspaces).set({ dryRun: false }).where(eq(schema.workspaces.id, ctx.wsId));
    const ws = { ...ctx.workspace, dryRun: false };
    const issue = await mk({ title: 'Real PR flow', likelyFiles: ['docs/rtest.md'] });
    const id = 'rtest1';
    await db().update(schema.tasks).set({ id }).where(eq(schema.tasks.id, issue.id));
    const branch = `claude/relay-${id}`;
    await db().update(schema.tasks).set({ status: 'dispatched', runKind: 'work', assigneeMemberId: ctx.member.id, branch, sessionUrl: 'https://claude.ai/code/session_x', dispatchedAt: new Date() }).where(eq(schema.tasks.id, id));

    const base = (await ctx.gh.rest.repos.get(ref)).data.default_branch;
    const baseSha = (await ctx.gh.rest.git.getRef({ ...ref, ref: `heads/${base}` })).data.object.sha;
    const result = { taskId: id, jobKind: 'work', type: 'code', summary: 'Added the doc.', outputMode: 'pr', commentMarkdown: '', filesChanged: ['docs/rtest.md'], checkCommand: 'pnpm test', checkPassed: true, triage: null, notes: '' };
    const sha = ghPushFile(branch, '.relay/results/rtest1.json', JSON.stringify(result), baseSha);

    await handleResultForTask(ws, id, { ref: branch, sha });
    await handleResultForTask(ws, id, { ref: branch, sha }); // replay
    const t = await get(id);
    expect(t.status).toBe('done');
    expect(t.resultPrUrl).toMatch(/\/pull\/\d+$/);
    const prs = await ctx.gh.rest.pulls.list({ ...ref, head: `${TEST_OWNER}:${branch}`, state: 'all' });
    expect(prs.data).toHaveLength(1);
    expect(prs.data[0]!.draft).toBe(true);
    expect(prs.data[0]!.title).toBe('[Relay rtest1] Real PR flow');
    expect(prs.data[0]!.body).toContain(`Closes #${t.issueNumber}`);
    expect((await statusComment(t.issueNumber))[0]!.body).toContain('Pull request');

    // failed check on another task
    const f = await mk({ title: 'Fails' });
    await db().update(schema.tasks).set({ id: 'rtest2', status: 'dispatched', runKind: 'work', assigneeMemberId: ctx.member.id, branch: 'claude/relay-rtest2' }).where(eq(schema.tasks.id, f.id));
    const sha2 = ghPushFile('claude/relay-rtest2', '.relay/results/rtest2.json', JSON.stringify({ ...result, taskId: 'rtest2', checkPassed: false, summary: 'Tests failed' }), baseSha);
    await handleResultForTask(ws, 'rtest2', { ref: 'claude/relay-rtest2', sha: sha2 });
    expect((await get('rtest2')).status).toBe('failed');
  });
});
