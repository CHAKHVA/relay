import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().optional(),
  APP_URL: z.string().url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  RELAY_ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  RELAY_ENABLE_TEST_LOGIN: z.string().optional(),
  RELAY_DEMO_TEMPLATE_REPO: z.string().optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

/** Validated server env, read lazily so `next build` works without secrets. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Private keys are stored as a single line with "\n" escapes. */
export function githubPrivateKey(): string {
  return env().GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
}
