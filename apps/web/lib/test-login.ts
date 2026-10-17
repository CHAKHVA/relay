/**
 * Test login guard (SPEC §22.2). Enabled only when RELAY_ENABLE_TEST_LOGIN=1 AND
 * NODE_ENV !== 'production' AND VERCEL_ENV !== 'production'.
 */
export function testLoginEnabled(e: NodeJS.ProcessEnv = process.env): boolean {
  return e.RELAY_ENABLE_TEST_LOGIN === '1' && e.NODE_ENV !== 'production' && e.VERCEL_ENV !== 'production';
}
