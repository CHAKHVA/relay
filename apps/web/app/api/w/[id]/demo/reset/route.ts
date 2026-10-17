import { requireOwner } from '@/lib/access';
import { json, route } from '@/lib/http';
import { resetDemoData } from '@/lib/services/demo';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  await resetDemoData(workspace);
  return json({ ok: true });
});
