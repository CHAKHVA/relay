import { sql } from 'drizzle-orm';
import { db } from './db';
import { tooMany } from './http';

/**
 * Fixed-window counter in Postgres. Atomically increments and throws 429 when over `limit`.
 * `now` is injectable for tests.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, message: string, now = new Date()) {
  const windowStart = new Date(Math.floor(now.getTime() / (windowSec * 1000)) * windowSec * 1000);
  const rows = await db().execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start = excluded.window_start then rate_limits.count + 1 else 1 end,
      window_start = excluded.window_start
    returning count`);
  const count = Number(rows.rows[0]?.count ?? 0);
  if (count > limit) throw tooMany(message);
}
