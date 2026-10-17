#!/usr/bin/env node
// Apply Drizzle migrations. Uses DATABASE_URL from the environment, else apps/web/.env.local.
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { resolve } from 'node:path';

const here = import.meta.dirname;
if (!process.env.DATABASE_URL) config({ path: resolve(here, '..', '.env.local'), quiet: true });
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: resolve(here, '..', 'drizzle') });
  console.log('✓ migrations applied');
} finally {
  await pool.end();
}
