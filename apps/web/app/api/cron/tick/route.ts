import { safeEqual } from '@/lib/crypto';
import { runTickAll } from '@/lib/engine/tick';
import { env } from '@/lib/env';
import { json, route } from '@/lib/http';

export const maxDuration = 300;

/** GET /api/cron/tick — Bearer CRON_SECRET (GitHub Actions every 5 minutes). */
export const GET = route(async (req) => {
  const given = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!given || !safeEqual(given, env().CRON_SECRET)) return json({ error: 'Unauthorized' }, { status: 401 });
  return json({ ok: true, ...(await runTickAll()) });
});
