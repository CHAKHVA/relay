import { json, parseBody, route, unauthorized } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { applyBeacon, beaconSchema, memberForUsageToken } from '@/lib/services/seat';

/** POST /api/usage/beacon — usage-token auth only; it can only update the token owner's own usage. */
export const POST = route(async (req) => {
  const row = await memberForUsageToken(req.headers.get('authorization'));
  if (!row) throw unauthorized();
  await rateLimit(`beacon:${row.token.id}`, 120, 60, 'Too many usage updates. Send at most one per second.');
  const body = await parseBody(req, beaconSchema);
  const m = await applyBeacon(row.member.id, row.token.id, body);
  return json({ ok: true, usedPct5h: m.usedPct5h, source: m.usageSource });
});
