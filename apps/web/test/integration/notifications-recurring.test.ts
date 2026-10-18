import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as listNotifs } from '@/app/api/w/[id]/notifications/route';
import { POST as readNotifs } from '@/app/api/w/[id]/notifications/read/route';
import { GET as listDigests } from '@/app/api/w/[id]/digests/route';
import { GET as listRecurring, POST as createRecurring } from '@/app/api/w/[id]/recurring/route';
import { DELETE as delRecurring, PATCH as patchRecurring } from '@/app/api/w/[id]/recurring/[rid]/route';
import { POST as acceptInvite } from '@/app/api/invites/[code]/accept/route';
import { POST as createInvite } from '@/app/api/workspaces/[id]/invites/route';
import { POST as createWorkspace } from '@/app/api/workspaces/route';
import { db, schema } from '@/lib/db';
import { notify } from '@/lib/engine/notify';
import { newId } from '@/lib/ids';
import { truncateAll } from '../helpers/db';
import { call, login, type TestUser } from '../helpers/http';

let owner: TestUser, ana: TestUser, wsId: string, ownerMember: string, anaMember: string;
beforeEach(async () => {
  await truncateAll();
  owner = await login('giorgi', 'Giorgi');
  wsId = (await call(createWorkspace, { as: owner, body: { name: 'N' } })).data.workspace.id;
  const code = (await call(createInvite, { as: owner, method: 'POST', params: { id: wsId } })).data.code;
  ana = await login('ana', 'Ana');
  await call(acceptInvite, { as: ana, body: {}, params: { code } });
  const ms = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
  ownerMember = ms.find((m) => m.userId === owner.id)!.id;
  anaMember = ms.find((m) => m.userId === ana.id)!.id;
});
const p = () => ({ id: wsId });

describe('notifications API', () => {
  it('lists mine only, unread first, dedupes, marks read, and enforces isolation', async () => {
    await notify({ memberId: ownerMember, kind: 'my_task_ready', title: 'Ready', dedupeKey: 'a' });
    await notify({ memberId: ownerMember, kind: 'my_task_ready', title: 'Ready again', dedupeKey: 'a' }); // deduped
    await notify({ memberId: ownerMember, kind: 'task_failed', title: 'Failed', dedupeKey: 'b' });
    await notify({ memberId: anaMember, kind: 'digest', title: 'Ana only' });
    const mine = (await call(listNotifs, { as: owner, params: p() })).data;
    expect(mine.notifications.map((n: { title: string }) => n.title).sort()).toEqual(['Failed', 'Ready']);
    expect(mine.unread).toBe(2);
    const first = mine.notifications[0].id;
    // can't mark someone else's
    const anaList = (await call(listNotifs, { as: ana, params: p() })).data;
    expect((await call(readNotifs, { as: owner, params: p(), body: { ids: [anaList.notifications[0].id] } })).data.marked).toBe(0);
    expect((await call(readNotifs, { as: owner, params: p(), body: { ids: [first] } })).data.marked).toBe(1);
    const after = (await call(listNotifs, { as: owner, params: p() })).data;
    expect(after.unread).toBe(1);
    expect(after.notifications[after.notifications.length - 1].readAt).toBeTruthy(); // read ones sort last
    expect((await call(readNotifs, { as: owner, params: p(), body: { all: true } })).data.marked).toBe(1);
    expect((await call(readNotifs, { as: owner, params: p(), body: {} })).status).toBe(400);
    const since = (await call(listNotifs, { as: owner, path: `/?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`, params: p() })).data;
    expect(since.notifications).toHaveLength(0);
    expect((await call(listNotifs, { as: await login('stranger'), params: p() })).status).toBe(404);
  });

  it('digests are per member', async () => {
    await db().insert(schema.digests).values({ id: newId(), memberId: ownerMember, date: '2026-06-02', markdown: '### Ran on your seat\n- x' });
    expect((await call(listDigests, { as: owner, params: p() })).data.digests).toHaveLength(1);
    expect((await call(listDigests, { as: ana, params: p() })).data.digests).toHaveLength(0);
  });
});

describe('recurring API', () => {
  const body = { title: 'Weekly audit', type: 'docs', cron: '0 9 * * 1', timezone: 'Asia/Tbilisi' };
  it('validates schedules, schedules nextRunAt in the future, and limits edits to creator/owner', async () => {
    expect((await call(createRecurring, { as: ana, params: p(), body: { ...body, cron: 'nonsense' } })).status).toBe(400);
    expect((await call(createRecurring, { as: ana, params: p(), body: { ...body, cron: '* * * *' } })).status).toBe(400);
    expect((await call(createRecurring, { as: ana, params: p(), body: { ...body, timezone: 'Mars/Base' } })).status).toBe(400);
    const r = await call(createRecurring, { as: ana, params: p(), body });
    expect(r.status).toBe(201);
    const id = r.data.recurring.id as string;
    expect(new Date(r.data.recurring.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect((await call(listRecurring, { as: owner, params: p() })).data.recurring).toHaveLength(1);

    const other = await login('luka');
    expect((await call(patchRecurring, { as: other, method: 'PATCH', params: { id: wsId, rid: id }, body: { enabled: false } })).status).toBe(404);
    expect((await call(patchRecurring, { as: ana, method: 'PATCH', params: { id: wsId, rid: id }, body: { enabled: false, cron: '*/5 * * * *' } })).data.recurring).toMatchObject({ enabled: false, cron: '*/5 * * * *' });
    expect((await call(patchRecurring, { as: owner, method: 'PATCH', params: { id: wsId, rid: id }, body: { title: 'Owner edit' } })).data.recurring.title).toBe('Owner edit');
    expect((await call(delRecurring, { as: owner, method: 'DELETE', params: { id: wsId, rid: id } })).status).toBe(200);
    expect((await call(listRecurring, { as: ana, params: p() })).data.recurring).toHaveLength(0);
  });
});
