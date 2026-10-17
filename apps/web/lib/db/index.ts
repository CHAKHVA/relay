import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

type DB = NeonDatabase & { $client: Pool };

const g = globalThis as unknown as { __relayPool?: Pool; __relayDb?: DB };

export function pool(): Pool {
  if (!g.__relayPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    g.__relayPool = new Pool({ connectionString: url, max: 5 });
  }
  return g.__relayPool;
}

/** Shared Drizzle instance (WebSocket pool: supports transactions and session-level advisory locks). */
export function db(): DB {
  if (!g.__relayDb) g.__relayDb = drizzle({ client: pool() }) as DB;
  return g.__relayDb;
}

export { schema };
