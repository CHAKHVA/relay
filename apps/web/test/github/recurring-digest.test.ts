import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { runTick } from '@/lib/engine/tick';
import { createRecurring, updateRecurring } from '@/lib/services/recurring';
import { updateSeat } from '@/lib/services/seat';
import { truncateAll } from '../helpers/db';
import { TEST_LABEL, TEST_NAME, TEST_OWNER, cleanSandbox, configureRoutine, makeSandboxWorkspace, sandboxOctokit } from '../helpers/github';

const ref = { owner: TEST_OWNER, repo: TEST_NAME };
let ctx: Awaited<ReturnType<typeof makeSandboxWorkspace>>;

beforeAll(async () => cleanSandbox(await sandboxOctokit()));
afterAll(async () => cleanSandbox(await sandboxOctokit()));
beforeEach(async () => {
  await truncateAll();
  ctx = await makeSandboxWorkspace();
  await configureRoutine(ctx.member.id);
  // keep the seat out of every window so these tests only exercise recurring/digest behavior
  await updateSeat(ctx.member, { timezone: 'UTC', offHoursStart: '03:00', offHoursEnd: '08:00', beforeResetMinutes: 0 });
});

describe('recurring (M7)', () => {
  it('a due template creates one labeled issue per run and advances nextRunAt', async () => {
    const t = await createRecurring(ctx.workspace, ctx.member, {
      title: 'Weekly dependency audit',
      description: 'Audit dependencies.',
      type: 'docs',
      likelyFiles: [],
      priority: 'low',
      cron: '* * * * *',
      timezone: 'UTC',
      enabled: true,
    });
    // pretend the schedule came due a minute ago
    await db().update(schema.recurringTasks).set({ nextRunAt: new Date(Date.now() - 60_000) }).where(eq(schema.recurringTasks.id, t.id));
    const before = Date.now();
    await runTick(ctx.wsId);
    await runTick(ctx.wsId); // second tick: nothing is due → no duplicate
    const tasks = await db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ctx.wsId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ recurringId: t.id, type: 'docs', priority: 'low' });
    expect(tasks[0]!.title).toMatch(/^Weekly dependency audit \(\d{4}-\d{2}-\d{2}\)$/);
    const { data: issue } = await ctx.gh.rest.issues.get({ ...ref, issue_number: tasks[0]!.issueNumber });
    expect(issue.labels.map((l) => (typeof l === 'string' ? l : l.name))).toEqual(expect.arrayContaining(['relay', 'relay:recurring', 'relay:type/docs', 'relay:low']));
    const [row] = await db().select().from(schema.recurringTasks).where(eq(schema.recurringTasks.id, t.id));
    expect(row!.nextRunAt.getTime()).toBeGreaterThan(before);
    expect(row!.lastRunAt).toBeTruthy();
    await ctx.gh.rest.issues.addLabels({ ...ref, issue_number: tasks[0]!.issueNumber, labels: [TEST_LABEL] });
  });

  it('disabled templates never run; re-enabling reschedules from now', async () => {
    const t = await createRecurring(ctx.workspace, ctx.member, { title: 'Off', description: '', type: 'docs', likelyFiles: [], priority: 'normal', cron: '* * * * *', timezone: 'UTC', enabled: false });
    await db().update(schema.recurringTasks).set({ nextRunAt: new Date(Date.now() - 60_000) }).where(eq(schema.recurringTasks.id, t.id));
    await runTick(ctx.wsId);
    expect(await db().select().from(schema.tasks)).toHaveLength(0);
    const upd = await updateRecurring(ctx.workspace, ctx.member, t.id, { enabled: true });
    expect(upd.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('digest + window notices (M8)', () => {
  it('posts the morning digest once, mentions the member, stores it, and notifies', async () => {
    const morning = new Date('2026-06-02T08:10:00Z'); // 10 min after off-hours end (UTC)
    await db()
      .insert(schema.tasks)
      .values({ id: 'r0dg1', workspaceId: ctx.wsId, issueNumber: 9001, title: 'Overnight docs', type: 'docs', status: 'done', runKind: 'work', requesterMemberId: ctx.member.id, assigneeMemberId: ctx.member.id, completedAt: new Date('2026-06-02T02:00:00Z'), resultCommentUrl: 'https://example.invalid/c', windowKind: 'off_hours' });
    await runTick(ctx.wsId, { realNow: morning });
    await runTick(ctx.wsId, { realNow: new Date(morning.getTime() + 60_000) });
    const digests = await db().select().from(schema.digests).where(eq(schema.digests.memberId, ctx.member.id));
    expect(digests).toHaveLength(1);
    expect(digests[0]!.markdown).toContain('Overnight docs');
    const [m] = await db().select().from(schema.members).where(eq(schema.members.id, ctx.member.id));
    expect(m!.digestIssueNumber).toBeGreaterThan(0);
    expect(m!.lastDigestDate).toBe('2026-06-02');
    const { data: issue } = await ctx.gh.rest.issues.get({ ...ref, issue_number: m!.digestIssueNumber! });
    expect(issue.labels.map((l) => (typeof l === 'string' ? l : l.name))).toContain('relay-digest');
    const comments = await ctx.gh.paginate(ctx.gh.rest.issues.listComments, { ...ref, issue_number: m!.digestIssueNumber! });
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain(`@${TEST_OWNER}`);
    expect(comments[0]!.body).toContain('Ran on your seat');
    // the digest issue is never a task
    expect(await db().select().from(schema.tasks).where(eq(schema.tasks.issueNumber, m!.digestIssueNumber!))).toHaveLength(0);
    const notes = await db().select().from(schema.notifications).where(eq(schema.notifications.memberId, ctx.member.id));
    expect(notes.filter((n) => n.kind === 'digest')).toHaveLength(1);
  });

  it('no digest when nothing happened, and none outside the 30-minute grace', async () => {
    await runTick(ctx.wsId, { realNow: new Date('2026-06-02T08:10:00Z') });
    expect(await db().select().from(schema.digests)).toHaveLength(0);
    await db().insert(schema.tasks).values({ id: 'r0dg2', workspaceId: ctx.wsId, issueNumber: 9002, title: 'x', type: 'docs', status: 'done', runKind: 'work', requesterMemberId: ctx.member.id, assigneeMemberId: ctx.member.id, completedAt: new Date('2026-06-03T02:00:00Z') });
    await runTick(ctx.wsId, { realNow: new Date('2026-06-03T09:00:00Z') });
    expect(await db().select().from(schema.digests)).toHaveLength(0);
  });

  it('window-starting notification: once per window, only with queued work', async () => {
    await runTick(ctx.wsId, { realNow: new Date('2026-06-02T02:55:00Z') });
    expect(await db().select().from(schema.notifications)).toHaveLength(0); // nothing queued
    await db().insert(schema.tasks).values({ id: 'r0wn1', workspaceId: ctx.wsId, issueNumber: 9003, title: 'q', type: 'docs', status: 'waiting_window', requesterMemberId: ctx.member.id });
    await runTick(ctx.wsId, { realNow: new Date('2026-06-02T02:55:00Z') });
    await runTick(ctx.wsId, { realNow: new Date('2026-06-02T02:57:00Z') });
    const n = (await db().select().from(schema.notifications)).filter((x) => x.kind === 'window_starting');
    expect(n).toHaveLength(1);
  });
});
