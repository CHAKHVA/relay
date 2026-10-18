import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { requireMember } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { json, parseBody, route } from '@/lib/http';

const body = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string()).min(1).max(100) })]);

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const b = await parseBody(req, body);
  const mine = and(eq(schema.notifications.memberId, member.id), isNull(schema.notifications.readAt));
  const where = 'all' in b ? mine : and(mine, inArray(schema.notifications.id, b.ids));
  const done = await db().update(schema.notifications).set({ readAt: new Date() }).where(where).returning({ id: schema.notifications.id });
  return json({ marked: done.length });
});
