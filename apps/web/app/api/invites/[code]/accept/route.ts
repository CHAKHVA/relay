import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { json, route } from '@/lib/http';
import { acceptInvite } from '@/lib/services/workspaces';

const bodySchema = z.object({ timezone: z.string().max(64).optional() }).optional();

export const POST = route<{ code: string }>(async (req, { code }) => {
  const user = await requireUser(req);
  const raw = await req.json().catch(() => undefined);
  const body = bodySchema.safeParse(raw);
  const r = await acceptInvite(user, code, body.success ? (body.data ?? {}) : {});
  return json({ workspaceId: r.workspace.id, memberId: r.member.id, alreadyMember: r.alreadyMember });
});
