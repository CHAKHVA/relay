import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DELETE as deleteAccount } from '@/app/api/me/account/route';
import { DELETE as deleteWorkspace } from '@/app/api/workspaces/[id]/route';
import { POST as createInvite } from '@/app/api/workspaces/[id]/invites/route';
import { POST as acceptInvite } from '@/app/api/invites/[code]/accept/route';
import { POST as makeToken } from '@/app/api/w/[id]/me/usage-tokens/route';
import { PUT as putRoutine } from '@/app/api/w/[id]/me/routine/route';
import { POST as createWorkspace } from '@/app/api/workspaces/route';
import { getSessionUser } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { truncateAll } from '../helpers/db';
import { call, login, type TestUser } from '../helpers/http';

beforeEach(truncateAll);

async function team() {
  const owner = await login('giorgi', 'Giorgi');
  const wsId = (await call(createWorkspace, { as: owner, body: { name: 'Doomed' } })).data.workspace.id as string;
  const code = (await call(createInvite, { as: owner, method: 'POST', params: { id: wsId } })).data.code;
  const ana = await login('ana', 'Ana');
  await call(acceptInvite, { as: ana, body: {}, params: { code } });
  return { owner, ana, wsId };
}
const counts = async (wsId: string) => ({
  members: (await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId))).length,
  tasks: (await db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, wsId))).length,
});

async function addTask(wsId: string, memberUser: TestUser, n: number) {
  const [m] = await db().select().from(schema.members).where(eq(schema.members.userId, memberUser.id));
  await db().insert(schema.tasks).values({ id: `r000${n}`, workspaceId: wsId, issueNumber: n, title: 't', type: 'docs', status: 'queued', requesterMemberId: m!.id });
}

describe('workspace deletion', () => {
  it('owner only, requires the exact name, removes all Relay data', async () => {
    const { owner, ana, wsId } = await team();
    await addTask(wsId, ana, 1);
    expect((await call(deleteWorkspace, { as: ana, method: 'DELETE', params: { id: wsId }, body: { confirmName: 'Doomed' } })).status).toBe(403);
    expect((await call(deleteWorkspace, { as: owner, method: 'DELETE', params: { id: wsId }, body: { confirmName: 'nope' } })).status).toBe(400);
    expect((await call(deleteWorkspace, { as: await login('stranger'), method: 'DELETE', params: { id: wsId }, body: { confirmName: 'Doomed' } })).status).toBe(404);
    expect((await call(deleteWorkspace, { as: owner, method: 'DELETE', params: { id: wsId }, body: { confirmName: 'Doomed' } })).status).toBe(200);
    expect(await counts(wsId)).toEqual({ members: 0, tasks: 0 });
    expect(await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId))).toHaveLength(0);
  });
});

describe('account deletion', () => {
  it('members can leave: user, membership, tokens, routine credentials and their tasks are removed', async () => {
    const { owner, ana, wsId } = await team();
    await call(makeToken, { as: ana, params: { id: wsId }, body: { name: 'x' } });
    await call(putRoutine, { as: ana, method: 'PUT', params: { id: wsId }, body: { fireUrl: 'https://api.anthropic.com/v1/claude_code/routines/trig_ABC123DEF/fire', token: 'fake-token-123456' } });
    await addTask(wsId, ana, 2);
    const res = await call(deleteAccount, { as: ana, method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(await getSessionUser(new Headers({ cookie: ana.cookie }))).toBeNull();
    expect(await db().select().from(schema.user).where(eq(schema.user.id, ana.id))).toHaveLength(0);
    expect(await db().select().from(schema.usageTokens)).toHaveLength(0);
    expect(await counts(wsId)).toEqual({ members: 1, tasks: 0 });
    // the owner is unaffected
    expect(await getSessionUser(new Headers({ cookie: owner.cookie }))).not.toBeNull();
  });

  it('owners must delete or transfer their workspaces first', async () => {
    const { owner, wsId } = await team();
    const res = await call(deleteAccount, { as: owner, method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.data.error).toContain('Doomed');
    await call(deleteWorkspace, { as: owner, method: 'DELETE', params: { id: wsId }, body: { confirmName: 'Doomed' } });
    expect((await call(deleteAccount, { as: owner, method: 'DELETE' })).status).toBe(200);
  });

  it('requires a session', async () => {
    expect((await call(deleteAccount, { method: 'DELETE' })).status).toBe(401);
  });
});
