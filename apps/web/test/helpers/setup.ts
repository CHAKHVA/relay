import { config } from 'dotenv';
import { resolve } from 'node:path';

// Tests use apps/web/.env.test (generated from .env.setup). CI may inject DATABASE_URL directly.
config({ path: resolve(import.meta.dirname, '..', '..', '.env.test'), quiet: true });
process.env.RELAY_ENABLE_TEST_LOGIN = '1';
