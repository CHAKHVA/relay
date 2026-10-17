import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { log, requestId } from '@/lib/http';
import { linkInstallation, userCanAccessInstallation, verifyInstallState } from '@/lib/services/github-connect';

/** GitHub App "Setup URL": GitHub redirects here after install/update with installation_id + state. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rid = requestId(req);
  const back = (path: string) => Response.redirect(`${appUrl()}${path}`, 302);
  const user = await getSessionUser(req.headers);
  if (!user) return back(`/?next=${encodeURIComponent(url.pathname + url.search)}`);
  const installationId = Number(url.searchParams.get('installation_id'));
  const state = url.searchParams.get('state') ?? '';
  const wsId = verifyInstallState(state);
  if (!wsId || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return back(`/onboarding?error=${encodeURIComponent('Start the GitHub App install from your workspace’s Getting started page.')}`);
  }
  const [row] = await db()
    .select({ ws: schema.workspaces, member: schema.members })
    .from(schema.members)
    .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.members.workspaceId, wsId), eq(schema.members.userId, user.id)));
  if (!row || row.member.role !== 'owner') return back('/onboarding');
  try {
    if (!(await userCanAccessInstallation(user.id, installationId))) {
      return back(`/w/${wsId}/start?error=${encodeURIComponent('We could not confirm you have access to that installation. Sign out and in again, then retry.')}`);
    }
    await linkInstallation(row.ws, installationId);
  } catch (e) {
    log('error', 'github setup failed', { requestId: rid, error: (e as Error).message });
    return back(`/w/${wsId}/start?error=${encodeURIComponent(`GitHub setup failed (request ${rid.slice(0, 8)}). Please retry.`)}`);
  }
  return back(`/w/${wsId}/start?installed=1`);
}
