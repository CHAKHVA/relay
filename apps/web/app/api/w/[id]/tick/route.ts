import { requireOwner } from '@/lib/access';
import { runTick } from '@/lib/engine/tick';
import { json, route } from '@/lib/http';

export const maxDuration = 60;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  const summary = await runTick(workspace.id);
  return json({ ran: summary !== null, summary });
});
