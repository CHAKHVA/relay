import { desc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { json, route } from '@/lib/http';
import { requireTask } from '@/lib/services/task-actions';

export const GET = route<{ id: string; taskId: string }>(async (req, { id, taskId }) => {
  const { workspace } = await requireMember(req, id);
  const task = await requireTask(workspace, taskId);
  const events = await db().select().from(schema.events).where(eq(schema.events.taskId, task.id)).orderBy(desc(schema.events.createdAt)).limit(100);
  return json({ task, events });
});
