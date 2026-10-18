import { desc, eq } from 'drizzle-orm';
import { requireMember } from '@/lib/access';
import { db, schema } from '@/lib/db';
import { json, route } from '@/lib/http';

/** My digests, newest first. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const rows = await db().select().from(schema.digests).where(eq(schema.digests.memberId, member.id)).orderBy(desc(schema.digests.date)).limit(60);
  return json({ digests: rows });
});
