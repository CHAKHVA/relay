import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as selectRepoRoute } from '@/app/api/workspaces/[id]/repo/route';
import { GET as listRepos } from '@/app/api/workspaces/[id]/repos/route';
import { POST as createTaskRoute } from '@/app/api/w/[id]/tasks/route';
import { db, schema } from '@/lib/db';
import { handleWebhook } from '@/lib/engine/webhook';
import { rateLimit } from '@/lib/rate-limit';
import { TASKS_PER_MINUTE } from '@/lib/services/tasks';
import { truncateAll } from '../helpers/db';
import { call, login } from '../helpers/http';
import { TEST_LABEL, TEST_NAME, TEST_OWNER, cleanSandbox, makeSandboxWorkspace, sandboxInstallationId, sandboxOctokit } from '../helpers/github';

const ref = { owner: TEST_OWNER, repo: TEST_NAME };
const FULL = `${TEST_OWNER}/${TEST_NAME}`;
let ctx: Awaited<ReturnType<typeof makeSandboxWorkspace>>;

beforeAll(async () => {
  await cleanSandbox(await sandboxOctokit());
});
beforeEach(async () => {
  await truncateAll();
  ctx = await makeSandboxWorkspace();
});
afterAll(async () => {
  await cleanSandbox(await sandboxOctokit());
});

const tasksOf = () => db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, ctx.wsId));

async function openIssue(title: string, body: string, labels: string[]) {
  const { data } = await ctx.gh.rest.issues.create({ ...ref, title, body, labels: [TEST_LABEL, ...labels] });
  return data;
}
type Issue = Awaited<ReturnType<typeof openIssue>>;

function issuesPayload(action: string, issue: Issue, installationId: number | null = ctx.workspace.githubInstallationId) {
  return { action, installation: { id: installationId }, repository: { name: TEST_NAME, owner: { login: TEST_OWNER }, full_name: FULL }, issue };
}

describe('GitHub App connect + issue sync', () => {
  it('lists installation repos and connects one: labels are created, open relay issues imported', async () => {
    const pre = await openIssue('Pre-existing relay issue', 'Please add a README section.', ['relay']);
    const repos = await call(listRepos, { as: ctx.owner, params: { id: ctx.wsId } });
    expect(repos.data.repos.map((r: { fullName: string }) => r.fullName.toLowerCase())).toContain(FULL.toLowerCase());
    expect(await sandboxInstallationId()).toBe(ctx.workspace.githubInstallationId);

    // GitHub's label index can lag a moment behind issue creation; connecting again is idempotent.
    let res = await call(selectRepoRoute, { as: ctx.owner, params: { id: ctx.wsId }, body: { fullName: FULL } });
    for (let i = 0; i < 5 && res.data.imported < 1; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await call(selectRepoRoute, { as: ctx.owner, params: { id: ctx.wsId }, body: { fullName: FULL } });
    }
    expect(res.status).toBe(200);
    expect(res.data.imported).toBeGreaterThanOrEqual(1);
    const labels = await ctx.gh.paginate(ctx.gh.rest.issues.listLabelsForRepo, { ...ref, per_page: 100 });
    const names = labels.map((l) => l.name);
    for (const n of ['relay', 'relay:type/code', 'relay:high', 'relay:low', 'relay:recurring', 'relay-digest']) expect(names).toContain(n);
    const t = (await tasksOf()).find((x) => x.issueNumber === pre.number);
    expect(t).toMatchObject({ status: 'needs_triage', requesterMemberId: ctx.member.id });
  });

  it('strangers cannot connect a repo (404)', async () => {
    const stranger = await login('stranger');
    expect((await call(selectRepoRoute, { as: stranger, params: { id: ctx.wsId }, body: { fullName: FULL } })).status).toBe(404);
  });

  it('webhook: labeled issue becomes a task; replay is idempotent; unlabel/close cancels; relabel reactivates', async () => {
    const body = `Add a greeting.\n\n<!-- relay\ntype: code\nlikelyFiles:\n  - src/hello.ts\ndoneCheck: pnpm test\nsize: S\n-->`;
    const issue = await openIssue('Add greeting', body, ['relay', 'relay:high']);
    const payload = issuesPayload('labeled', issue);
    await handleWebhook('issues', payload);
    await handleWebhook('issues', payload);
    let rows = await tasksOf();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ issueNumber: issue.number, type: 'code', priority: 'high', size: 'S', doneCheck: 'pnpm test', likelyFiles: ['src/hello.ts'], requesterMemberId: ctx.member.id });
    expect(['queued', 'waiting_window']).toContain(rows[0]!.status);

    const comments = await ctx.gh.paginate(ctx.gh.rest.issues.listComments, { ...ref, issue_number: issue.number });
    expect(comments.filter((c) => c.body?.includes('Relay')).length).toBe(1);

    await ctx.gh.rest.issues.removeLabel({ ...ref, issue_number: issue.number, name: 'relay' });
    const { data: after } = await ctx.gh.rest.issues.get({ ...ref, issue_number: issue.number });
    await handleWebhook('issues', issuesPayload('unlabeled', after as Issue));
    rows = await tasksOf();
    expect(rows[0]!.status).toBe('cancelled');

    await ctx.gh.rest.issues.addLabels({ ...ref, issue_number: issue.number, labels: ['relay'] });
    const { data: again } = await ctx.gh.rest.issues.get({ ...ref, issue_number: issue.number });
    await handleWebhook('issues', issuesPayload('labeled', again as Issue));
    expect((await tasksOf())[0]!.status).not.toBe('cancelled');

    await ctx.gh.rest.issues.update({ ...ref, issue_number: issue.number, state: 'closed' });
    const { data: closed } = await ctx.gh.rest.issues.get({ ...ref, issue_number: issue.number });
    await handleWebhook('issues', issuesPayload('closed', closed as Issue));
    expect((await tasksOf())[0]!.status).toBe('cancelled');
  });

  it('webhook: issue without metadata needs triage; unknown author maps to the owner', async () => {
    const issue = await openIssue('Make it faster', 'It is slow.', ['relay']);
    await handleWebhook('issues', issuesPayload('opened', issue));
    const [t] = await tasksOf();
    expect(t!.status).toBe('needs_triage');
    expect(t!.requesterMemberId).toBe(ctx.member.id);
  });

  it('webhook: non-relay issues and foreign installations are ignored', async () => {
    const plain = await openIssue('Plain', 'x', []);
    await handleWebhook('issues', issuesPayload('opened', plain));
    expect(await tasksOf()).toHaveLength(0);
    const rel = await openIssue('Foreign', 'x', ['relay']);
    const r = await handleWebhook('issues', issuesPayload('opened', rel, 1));
    expect(r.handled).toBe(false);
    expect(await tasksOf()).toHaveLength(0);
  });

  it('board-created task opens a GitHub issue with labels + metadata and is a task immediately', async () => {
    const res = await call(createTaskRoute, {
      as: ctx.owner,
      params: { id: ctx.wsId },
      body: { type: 'code', title: 'Board task', description: 'Do the thing', likelyFiles: ['src/a.ts'], doneCheck: 'pnpm test', priority: 'low', extraLabels: [TEST_LABEL] },
    });
    expect(res.status).toBe(201);
    const { data: issue } = await ctx.gh.rest.issues.get({ ...ref, issue_number: res.data.task.issueNumber });
    expect(issue.labels.map((l) => (typeof l === 'string' ? l : l.name))).toEqual(expect.arrayContaining(['relay', 'relay:type/code', 'relay:low']));
    expect(issue.body).toContain('<!-- relay');
    const [t] = await tasksOf();
    expect(t).toMatchObject({ title: 'Board task', priority: 'low', type: 'code', requesterMemberId: ctx.member.id });
    await handleWebhook('issues', issuesPayload('opened', issue as Issue));
    expect(await tasksOf()).toHaveLength(1);
  });

  it('task creation is rate limited at 10/min per member', async () => {
    const now = new Date('2026-01-01T00:00:10Z');
    const results: number[] = [];
    for (let i = 0; i < 11; i++) {
      try {
        await rateLimit(`task:${ctx.member.id}`, TASKS_PER_MINUTE, 60, 'slow down', now);
        results.push(200);
      } catch (e) {
        results.push((e as { status?: number }).status ?? 500);
      }
    }
    expect(results.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(results[10]).toBe(429);
    await rateLimit(`task:${ctx.member.id}`, TASKS_PER_MINUTE, 60, 'slow down', new Date('2026-01-01T00:01:10Z'));
  });
});
