import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from './db';
import { appUrl, env } from './env';

/** Shared Better Auth options (GitHub sign-in via the Relay GitHub App's client id/secret). */
export function authOptions(): BetterAuthOptions {
  const e = env();
  return {
    appName: 'Relay',
    baseURL: e.BETTER_AUTH_URL ?? appUrl(),
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    user: {
      additionalFields: {
        githubLogin: { type: 'string', required: false, input: false },
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ['github'] },
    },
    socialProviders: {
      github: {
        clientId: e.GITHUB_CLIENT_ID,
        clientSecret: e.GITHUB_CLIENT_SECRET,
        mapProfileToUser: (profile) => ({ githubLogin: profile.login, name: profile.name || profile.login }),
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: (e.BETTER_AUTH_URL ?? appUrl()).startsWith('https://') },
  };
}
