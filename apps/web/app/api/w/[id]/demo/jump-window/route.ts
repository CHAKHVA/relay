import { requireOwner } from '@/lib/access';
import { runTickSafe } from '@/lib/engine/tick';
import { json, route } from '@/lib/http';
import { jumpToNextWindow } from '@/lib/services/demo';

export const maxDuration = 60;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireOwner(req, id);
  const r = await jumpToNextWindow(workspace, member);
  await runTickSafe(workspace.id);
  return json({ clockOffsetMinutes: r.workspace.clockOffsetMinutes, now: r.target.toISOString() });
});
