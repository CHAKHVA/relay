import { describe, expect, it } from 'vitest';
import { GET as cron } from '@/app/api/cron/tick/route';
import { call } from '../helpers/http';

describe('cron tick auth', () => {
  it('401 without or with a wrong secret, 200 with CRON_SECRET', async () => {
    expect((await call(cron)).status).toBe(401);
    expect((await call(cron, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    const ok = await call(cron, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status).toBe(200);
    expect(ok.data.ok).toBe(true);
  });
});
