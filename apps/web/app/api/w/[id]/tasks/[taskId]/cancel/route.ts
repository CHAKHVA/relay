import { requireMember } from '@/lib/access';
import { runTickSafe } from '@/lib/engine/tick';
import { json, route } from '@/lib/http';
import { cancelTask } from '@/lib/services/task-actions';

export const maxDuration = 60;

export const POST = route<{ id: string; taskId: string }>(async (req, { id, taskId }) => {
  const { workspace, member } = await requireMember(req, id);
  const t = await cancelTask(workspace, member, taskId);
  await runTickSafe(workspace.id);
  return json({ task: { id: t.id, status: t.status } });
});
