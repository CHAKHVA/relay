import { createHash } from 'node:crypto';
import { pool } from '../db';

/** Stable signed 64-bit key for a workspace's advisory lock. */
export function lockKey(workspaceId: string): string {
  return BigInt.asIntN(64, createHash('sha256').update(`relay:${workspaceId}`).digest().readBigInt64BE(0)).toString();
}

/**
 * Run `fn` holding the workspace's Postgres advisory lock (session-level, on a dedicated connection).
 * `wait: false` → return null immediately if another tick holds it (SPEC §11.1); `wait: true` blocks.
 */
export async function withWorkspaceLock<T>(workspaceId: string, fn: () => Promise<T>, opts: { wait: boolean }): Promise<T | null> {
  const client = await pool().connect();
  const key = lockKey(workspaceId);
  try {
    if (opts.wait) {
      await client.query('select pg_advisory_lock($1::bigint)', [key]);
    } else {
      const r = await client.query('select pg_try_advisory_lock($1::bigint) as ok', [key]);
      if (!r.rows[0]?.ok) return null;
    }
    try {
      return await fn();
    } finally {
      await client.query('select pg_advisory_unlock($1::bigint)', [key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}
