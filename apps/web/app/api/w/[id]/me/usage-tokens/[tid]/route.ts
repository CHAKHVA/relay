import { requireMember } from '@/lib/access';
import { json, route } from '@/lib/http';
import { revokeUsageToken } from '@/lib/services/seat';

export const DELETE = route<{ id: string; tid: string }>(async (req, { id, tid }) => {
  const { member } = await requireMember(req, id);
  await revokeUsageToken(member, tid);
  return json({ ok: true });
});
