import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { parseIssueBody } from '@relay/core';
import { db, schema } from '@/lib/db';
import { handleWebhook } from '@/lib/engine/webhook';
import { runTick } from '@/lib/engine/tick';
import { triageNow } from '@/lib/services/task-actions';
import { updateSeat } from '@/lib/services/seat';
import { truncateAll } from '../helpers/db';
import { TEST_LABEL, TEST_NAME, TEST_OWNER, cleanSandbox, configureRoutine, makeSandboxWorkspace, sandboxOctokit } from '../helpers/github';

const ref = { owner: TEST_OWNER, repo: TEST_NAME };
let ctx: Awaited<ReturnType<typeof makeSandboxWorkspace>>;
const later = (s: number) => new Date(Date.now() + s * 1000);

beforeAll(async () => cleanSandbox(await sandboxOctokit()));
afterAll(async () => cleanSandbox(await sandboxOctokit()));
beforeEach(async () => {
  await truncateAll();
  ctx = await makeSandboxWorkspace();
  await configureRoutine(ctx.member.id);
});

const get = async (id: string) => (await db().select().from(schema.tasks).where(eq(schema.tasks.id, id)))[0]!;
async function vagueIssue(body: string) {
  const { data } = await ctx.gh.rest.issues.create({ ...ref, title: 'The login page is confusing', body, labels: ['relay', TEST_LABEL] });
  await handleWebhook('issues', {
    action: 'opened',
    installation: { id: ctx.workspace.githubInstallationId },
    repository: { name: TEST_NAME, owner: { login: TEST_OWNER }, full_name: `${TEST_OWNER}/${TEST_NAME}` },
    issue: data,
  });
  const [t] = await db().select().from(schema.tasks).where(eq(schema.tasks.issueNumber, data.number));
  return { issue: data, task: t! };
}

describe('triage (dry run)', () => {
  it('vague issue → needs_triage → triaged (metadata written back, label, comment) → queued → runs', async () => {
    await updateSeat(ctx.member, { offHoursStart: '00:00', offHoursEnd: '23:59' });
    const { issue, task } = await vagueIssue('Please clean up the validation in src/auth.ts, it is confusing.');
    // The webhook runs a tick, so inside a window triage is dispatched right away.
    let t = await get(task.id);
    expect(t).toMatchObject({ status: 'triaging', runKind: 'triage' });
    expect(t.branch).toBe(`claude/relay-${task.id}-triage-1`);
    expect(t.sessionUrl).toMatch(/session_dryrun_/);

    await runTick(ctx.wsId, { realNow: later(25) });
    t = await get(task.id);
    // triage done → the same tick dispatches the work run
    expect(['queued', 'dispatched']).toContain(t.status);
    expect(t.triagedAt).toBeTruthy();
    expect(t).toMatchObject({ type: 'code', likelyFiles: ['src/auth.ts'], doneCheck: 'pnpm test', size: 'S' });

    const { data: after } = await ctx.gh.rest.issues.get({ ...ref, issue_number: issue.number });
    const parsed = parseIssueBody(after.body);
    expect(parsed.text).toBe('Please clean up the validation in src/auth.ts, it is confusing.'); // human text untouched
    expect(parsed.meta).toMatchObject({ type: 'code', likelyFiles: ['src/auth.ts'], doneCheck: 'pnpm test', size: 'S' });
    expect(after.labels.map((l) => (typeof l === 'string' ? l : l.name))).toContain('relay:type/code');
    const comments = await ctx.gh.paginate(ctx.gh.rest.issues.listComments, { ...ref, issue_number: issue.number });
    expect(comments.some((c) => c.body?.startsWith('Triaged by'))).toBe(true);

    // the issues.edited echo of our own rewrite is a no-op
    await handleWebhook('issues', { action: 'edited', installation: { id: ctx.workspace.githubInstallationId }, repository: { name: TEST_NAME, owner: { login: TEST_OWNER }, full_name: 'x/y' }, issue: after });
    expect((await get(task.id)).status).toBe(t.status);

    await runTick(ctx.wsId);
    await runTick(ctx.wsId, { realNow: later(60) });
    expect((await get(task.id)).status).toBe('done');
  });

  it('"Triage now" runs triage outside the window; waiting tasks say when', async () => {
    await updateSeat(ctx.member, { offHoursStart: '03:00', offHoursEnd: '03:01' });
    const { task } = await vagueIssue('Update README.md with install steps.');
    const noon = new Date('2026-06-01T12:00:00Z');
    await runTick(ctx.wsId, { realNow: noon });
    const w = await get(task.id);
    expect(w.status).toBe('needs_triage');
    expect(w.statusReason).toMatch(/Next window/);

    await triageNow(ctx.workspace, ctx.member, task.id);
    await runTick(ctx.wsId, { realNow: noon });
    expect(await get(task.id)).toMatchObject({ status: 'triaging', windowKind: 'manual', triageNow: false });
  });

  it('triage that cannot produce valid metadata retries once, then fails', async () => {
    const { task } = await vagueIssue('Something unclear.');
    // Make dry-run triage produce an invalid code task: no files because description has none and type forced code with no check.
    await db().update(schema.tasks).set({ type: 'review', likelyFiles: ['a.md'] }).where(eq(schema.tasks.id, task.id)); // review needs targetPr → invalid
    await updateSeat(ctx.member, { offHoursStart: '00:00', offHoursEnd: '23:59' });
    await runTick(ctx.wsId);
    await runTick(ctx.wsId, { realNow: later(25) });
    let t = await get(task.id);
    expect(['needs_triage', 'triaging']).toContain(t.status);
    expect(t.attempts).toBe(1);
    await runTick(ctx.wsId, { realNow: later(50) });
    await runTick(ctx.wsId, { realNow: later(80) });
    t = await get(task.id);
    expect(t.status).toBe('failed');
  });
});
