import { requireMember } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { createRecurring, listRecurring, recurringSchema } from '@/lib/services/recurring';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireMember(req, id);
  return json({ recurring: await listRecurring(workspace) });
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireMember(req, id);
  const body = await parseBody(req, recurringSchema);
  return json({ recurring: await createRecurring(workspace, member, body) }, { status: 201 });
});
