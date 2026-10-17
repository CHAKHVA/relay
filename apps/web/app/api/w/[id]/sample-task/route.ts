import { requireMember } from '@/lib/access';
import { runTickSafe } from '@/lib/engine/tick';
import { json, route } from '@/lib/http';
import { isDemoTemplateRepo, SAMPLE_DEMO_TASK, SAMPLE_DOCS_TASK } from '@/lib/services/onboarding';
import { createTask } from '@/lib/services/tasks';

export const maxDuration = 60;

/** POST /api/w/:id/sample-task — a small, safe task for the "Try it now" step (SPEC §21.2). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireMember(req, id);
  const sample = isDemoTemplateRepo(workspace) ? SAMPLE_DEMO_TASK : SAMPLE_DOCS_TASK;
  const task = await createTask(workspace, member, sample);
  await runTickSafe(workspace.id);
  return json({ task: { id: task.id, issueNumber: task.issueNumber, issueUrl: task.issueUrl } }, { status: 201 });
});
