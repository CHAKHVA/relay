import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

const TABLES = [
  'notifications', 'digests', 'events', 'usage_tokens', 'tasks', 'recurring_tasks', 'invites',
  'members', 'workspaces', 'rate_limits', 'session', 'account', 'verification', '"user"',
];

export async function truncateAll() {
  await db().execute(sql.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`));
}
