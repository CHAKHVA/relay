import { beforeEach, describe, expect, it } from 'vitest';
import { POST as acceptInvite } from '@/app/api/invites/[code]/accept/route';
import { POST as testLogin } from '@/app/api/test/login/route';
import { POST as createInvite } from '@/app/api/workspaces/[id]/invites/route';
import { GET as listWorkspaces, POST as createWorkspace } from '@/app/api/workspaces/route';
import { getSessionUser } from '@/lib/auth';
import { listMembers } from '@/lib/services/workspaces';
import { truncateAll } from '../helpers/db';
import { call, login } from '../helpers/http';

beforeEach(truncateAll);

describe('test login', () => {
  it('creates a session cookie that Better Auth accepts', async () => {
    const res = await call(testLogin, { body: { githubLogin: 'ana', name: 'Ana' } });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/session_token=/);
    const cookie = setCookie.split(';')[0]!;
    const u = await getSessionUser(new Headers({ cookie }));
    expect(u).toMatchObject({ name: 'Ana', githubLogin: 'ana' });
  });
  it('rejects bad input', async () => {
    expect((await call(testLogin, { body: { githubLogin: 'not valid!' } })).status).toBe(400);
  });
});

describe('workspaces + invites', () => {
  it('requires a session', async () => {
    expect((await call(createWorkspace, { body: { name: 'X' } })).status).toBe(401);
  });

  it('create workspace → owner member; invite → accept → member', async () => {
    const owner = await login('giorgi', 'Giorgi');
    const created = await call(createWorkspace, { as: owner, body: { name: 'Team', timezone: 'Asia/Tbilisi' } });
    expect(created.status).toBe(201);
    const wsId = created.data.workspace.id as string;
    expect(created.data.member.role).toBe('owner');

    const list = await call(listWorkspaces, { as: owner });
    expect(list.data.workspaces).toEqual([{ id: wsId, name: 'Team', role: 'owner' }]);

    const inv = await call(createInvite, { as: owner, method: 'POST', params: { id: wsId } });
    expect(inv.status).toBe(201);
    expect(inv.data.url).toMatch(/\/invite\//);

    const ana = await login('ana', 'Ana');
    const acc = await call(acceptInvite, { as: ana, body: { timezone: 'Europe/Berlin' }, params: { code: inv.data.code } });
    expect(acc.status).toBe(200);
    expect(acc.data).toMatchObject({ workspaceId: wsId, alreadyMember: false });

    // idempotent for the same user, unusable for others
    const again = await call(acceptInvite, { as: ana, body: {}, params: { code: inv.data.code } });
    expect(again.data.alreadyMember).toBe(true);
    const luka = await login('luka');
    expect((await call(acceptInvite, { as: luka, body: {}, params: { code: inv.data.code } })).status).toBe(400);

    const members = await listMembers(wsId);
    expect(members.map((m) => [m.githubLogin, m.role, m.timezone])).toEqual([
      ['giorgi', 'owner', 'Asia/Tbilisi'],
      ['ana', 'member', 'Europe/Berlin'],
    ]);
  });

  it('only owners create invites; non-members get 404', async () => {
    const owner = await login('giorgi');
    const ws = (await call(createWorkspace, { as: owner, body: { name: 'A' } })).data.workspace.id;
    const inv = (await call(createInvite, { as: owner, method: 'POST', params: { id: ws } })).data.code;
    const ana = await login('ana');
    await call(acceptInvite, { as: ana, body: {}, params: { code: inv } });
    expect((await call(createInvite, { as: ana, method: 'POST', params: { id: ws } })).status).toBe(403);
    const stranger = await login('stranger');
    expect((await call(createInvite, { as: stranger, method: 'POST', params: { id: ws } })).status).toBe(404);
  });

  it('validates name and unknown invites', async () => {
    const u = await login('giorgi');
    expect((await call(createWorkspace, { as: u, body: { name: '' } })).status).toBe(400);
    expect((await call(acceptInvite, { as: u, body: {}, params: { code: 'nope' } })).status).toBe(404);
  });
});
