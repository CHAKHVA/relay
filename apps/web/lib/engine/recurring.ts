import { computeNextRun, dueRecurring } from '@relay/core';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { log } from '../http';
import { createTask } from '../services/tasks';
import { recordEvent } from './events';

/**
 * Tick step 1 (SPEC §11.1): create an issue for every due template and advance `nextRunAt`.
 * Idempotent: the template row is claimed with a conditional update before the issue is created.
 */
export async function runRecurring(ws: Workspace, members: Member[], now: Date): Promise<number> {
  const all = await db().select().from(schema.recurringTasks).where(eq(schema.recurringTasks.workspaceId, ws.id));
  let created = 0;
  for (const t of dueRecurring(all, now)) {
    let next: Date;
    try {
      next = computeNextRun(t.cron, t.timezone, now);
    } catch {
      await db().update(schema.recurringTasks).set({ enabled: false }).where(eq(schema.recurringTasks.id, t.id));
      continue;
    }
    const [claimed] = await db()
      .update(schema.recurringTasks)
      .set({ nextRunAt: next, lastRunAt: now })
      .where(and(eq(schema.recurringTasks.id, t.id), eq(schema.recurringTasks.nextRunAt, t.nextRunAt)))
      .returning();
    if (!claimed) continue;
    const creator = members.find((m) => m.id === t.creatorMemberId);
    if (!creator) continue;
    try {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: t.timezone }).format(now);
      await createTask(
        ws,
        creator,
        {
          type: t.type,
          title: `${t.title} (${date})`,
          description: t.body,
          likelyFiles: t.likelyFiles,
          doneCheck: t.doneCheck,
          size: t.size,
          priority: t.priority,
          targetPr: t.targetPrNumber,
          extraLabels: ['relay:recurring'],
        },
        { skipRateLimit: true, recurringId: t.id },
      );
      await recordEvent({ workspaceId: ws.id, memberId: creator.id, kind: 'recurring_created', message: `Recurring “${t.title}” created its task for ${date}` });
      created++;
    } catch (e) {
      log('error', 'recurring create failed', { workspaceId: ws.id, recurringId: t.id, error: (e as Error).message });
    }
  }
  return created;
}

