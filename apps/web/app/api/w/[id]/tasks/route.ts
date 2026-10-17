import { requireMember } from '@/lib/access';
import { runTickSafe } from '@/lib/engine/tick';
import { json, parseBody, route } from '@/lib/http';
import { createTask, createTaskSchema } from '@/lib/services/tasks';

export const maxDuration = 60;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireMember(req, id);
  const body = await parseBody(req, createTaskSchema);
  const task = await createTask(workspace, member, body);
  await runTickSafe(workspace.id);
  return json({ task: { id: task.id, issueNumber: task.issueNumber, status: task.status, issueUrl: task.issueUrl } }, { status: 201 });
});
