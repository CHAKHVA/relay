import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { githubApp } from '@/lib/github/app';

export const dynamic = 'force-dynamic';

/** GET /api/health — DB + GitHub App reachability. No secrets in the response. */
export async function GET() {
  const checks = { db: false, github: false };
  try {
    await db().execute(sql`select 1`);
    checks.db = true;
  } catch {}
  try {
    const { data } = await githubApp().octokit.rest.apps.getAuthenticated();
    checks.github = Boolean(data?.slug);
  } catch {}
  const ok = checks.db && checks.github;
  return Response.json({ ok, ...checks, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
