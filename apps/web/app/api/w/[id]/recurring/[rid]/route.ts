import { requireMember } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { deleteRecurring, recurringPatchSchema, updateRecurring } from '@/lib/services/recurring';

export const PATCH = route<{ id: string; rid: string }>(async (req, { id, rid }) => {
  const { workspace, member } = await requireMember(req, id);
  const patch = await parseBody(req, recurringPatchSchema);
  return json({ recurring: await updateRecurring(workspace, member, rid, patch) });
});

export const DELETE = route<{ id: string; rid: string }>(async (req, { id, rid }) => {
  const { workspace, member } = await requireMember(req, id);
  await deleteRecurring(workspace, member, rid);
  return json({ ok: true });
});
