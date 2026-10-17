import { db, schema } from '../db';
import { newId } from '../ids';

export async function recordEvent(e: {
  workspaceId: string;
  kind: string;
  message: string;
  taskId?: string | null;
  memberId?: string | null;
  data?: Record<string, unknown> | null;
}) {
  await db()
    .insert(schema.events)
    .values({ id: newId(), workspaceId: e.workspaceId, kind: e.kind, message: e.message, taskId: e.taskId ?? null, memberId: e.memberId ?? null, data: e.data ?? null });
}
