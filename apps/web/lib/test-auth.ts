import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { authOptions } from './auth-options';
import { db, schema } from './db';
import { testLoginEnabled } from './test-login';

// Test-only auth instance with Better Auth's test helpers. Never imported in production paths.
function create() {
  return betterAuth({ ...authOptions(), plugins: [testUtils()] });
}
type TestAuth = ReturnType<typeof create>;
const g = globalThis as unknown as { __relayTestAuth?: TestAuth };

export async function loginTestUser(githubLogin: string, name?: string) {
  if (!testLoginEnabled()) throw new Error('Test login disabled');
  g.__relayTestAuth ??= create();
  const ctx = await g.__relayTestAuth.$context;
  const email = `${githubLogin.toLowerCase()}@test.relay.local`;
  let [u] = await db().select().from(schema.user).where(eq(schema.user.email, email));
  if (!u) {
    [u] = await db()
      .insert(schema.user)
      .values({ id: `test_${githubLogin.toLowerCase()}`, name: name ?? githubLogin, email, emailVerified: true, githubLogin })
      .returning();
  }
  if (!u) throw new Error('Could not create test user');
  const { cookies, headers } = await ctx.test.login({ userId: u.id });
  return { user: u, cookies, headers };
}
