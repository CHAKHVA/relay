import { and, desc, eq, gt } from 'drizzle-orm';
import { requireMember } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { json, route } from '@/lib/http';

/** My notifications, unread first then newest. `?since=<iso>` returns only newer ones. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const sinceRaw = new URL(req.url).searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null;
  const rows = await db()
    .select()
    .from(schema.notifications)
    .where(since ? and(eq(schema.notifications.memberId, member.id), gt(schema.notifications.createdAt, since)) : eq(schema.notifications.memberId, member.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);
  const sorted = [...rows].sort((a, b) => Number(Boolean(a.readAt)) - Number(Boolean(b.readAt)) || b.createdAt.getTime() - a.createdAt.getTime());
  return json({ notifications: sorted, unread: rows.filter((r) => !r.readAt).length });
});
