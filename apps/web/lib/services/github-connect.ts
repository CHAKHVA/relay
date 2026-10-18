import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { auth } from '../auth';
import { hmac, safeEqual } from '../crypto';
import { db, schema } from '../db';
import type { Workspace } from '../db/schema';
import { userOctokit } from '../github/app';
import { ensureLabels, listInstallationRepos, workspaceOctokit } from '../github/repo';
import { badRequest, conflict, forbidden, log } from '../http';
import { recordEvent } from '../engine/events';
import { syncStatusComment } from '../engine/status-comment';
import { syncIssue } from '../engine/sync';

const STATE_TTL_MS = 60 * 60 * 1000;

/** Signed install state: "<workspaceId>.<expiresMs>.<hmac>" — proves which workspace started the install. */
export function signInstallState(workspaceId: string, now = Date.now()): string {
  const payload = `${workspaceId}.${now + STATE_TTL_MS}`;
  return `${payload}.${hmac(`install:${payload}`)}`;
}

export function verifyInstallState(state: string, now = Date.now()): string | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [wsId, exp, sig] = parts as [string, string, string];
  if (!safeEqual(sig, hmac(`install:${wsId}.${exp}`))) return null;
  if (Number(exp) < now) return null;
  return wsId;
}

/** Installations of the Relay app visible to the user's own GitHub token, or null if the token is unavailable. */
export async function userInstallations(userId: string, headers: Headers): Promise<{ id: number; account: string }[] | null> {
  let token: string | undefined;
  try {
    const [acct] = await db()
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'github')));
    if (!acct) return null;
    const r = await auth().api.getAccessToken({ body: { accountId: acct.id, userId }, headers });
    token = r?.accessToken;
  } catch (e) {
    log('warn', 'github user token unavailable', { userId, error: (e as Error).message });
    token = undefined;
  }
  if (!token) return null;
  const gh = userOctokit(token);
  const installs = await gh.paginate(gh.rest.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
  return installs.map((i) => ({ id: i.id, account: i.account && 'login' in i.account ? i.account.login : String(i.account?.name ?? '') }));
}

/** Verify with the user's own GitHub token that they can access this installation (prevents linking someone else's). */
export async function userCanAccessInstallation(userId: string, installationId: number, headers: Headers): Promise<boolean> {
  const installs = await userInstallations(userId, headers);
  const ok = !!installs?.some((i) => i.id === installationId);
  if (!ok) log('warn', 'installation not visible to user token', { userId, installationId, visible: installs?.length ?? null });
  return ok;
}

export async function linkInstallation(ws: Workspace, installationId: number) {
  const changed = ws.githubInstallationId !== installationId;
  const [updated] = await db()
    .update(schema.workspaces)
    .set(changed ? { githubInstallationId: installationId, repoOwner: null, repoName: null, defaultBranch: null, labelsCreatedAt: null } : { githubInstallationId: installationId })
    .where(eq(schema.workspaces.id, ws.id))
    .returning();
  await recordEvent({ workspaceId: ws.id, kind: 'github_installed', message: 'GitHub App installation linked', data: { installationId } });
  return updated as Workspace;
}

/** Choose the workspace repo from the installation; create labels; import open `relay` issues. */
export async function selectRepo(ws: Workspace, fullName: string) {
  const gh = await workspaceOctokit(ws);
  const repos = await listInstallationRepos(gh);
  const repo = repos.find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
  if (!repo) throw badRequest('That repository is not part of the Relay installation. Add it on GitHub, then try again.', 'repo_not_installed');
  const [taken] = await db()
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(
      and(
        ne(schema.workspaces.id, ws.id),
        isNotNull(schema.workspaces.githubInstallationId),
        sql`lower(${schema.workspaces.repoOwner}) = lower(${repo.owner})`,
        sql`lower(${schema.workspaces.repoName}) = lower(${repo.name})`,
      ),
    );
  if (taken) throw conflict('This repository is already connected to another Relay workspace.');
  const ref = { owner: repo.owner, repo: repo.name };
  await ensureLabels(gh, ref);
  const [updated] = await db()
    .update(schema.workspaces)
    .set({ repoOwner: repo.owner, repoName: repo.name, defaultBranch: repo.defaultBranch, labelsCreatedAt: new Date() })
    .where(eq(schema.workspaces.id, ws.id))
    .returning();
  const next = updated as Workspace;
  await recordEvent({ workspaceId: ws.id, kind: 'repo_connected', message: `Connected ${repo.fullName}; labels ready` });
  const imported = await importOpenIssues(next);
  return { workspace: next, imported };
}

export async function importOpenIssues(ws: Workspace): Promise<number> {
  const gh = await workspaceOctokit(ws);
  const issues = await gh.paginate(gh.rest.issues.listForRepo, { owner: ws.repoOwner!, repo: ws.repoName!, labels: 'relay', state: 'open', per_page: 100 });
  const members = await db().select().from(schema.members).where(eq(schema.members.workspaceId, ws.id));
  let n = 0;
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const r = await syncIssue(ws, issue, { members });
    if (r.task && r.changed) {
      n++;
      await syncStatusComment(ws, r.task, members, { gh });
    }
  }
  return n;
}

export async function requireConnectedOwner(ws: Workspace, memberRole: string) {
  if (memberRole !== 'owner') throw forbidden();
  if (!ws.githubInstallationId) throw badRequest('Install the Relay GitHub App first', 'no_installation');
}

export async function disconnectInstallation(installationId: number, reason: string) {
  const affected = await db()
    .update(schema.workspaces)
    .set({ githubInstallationId: null })
    .where(eq(schema.workspaces.githubInstallationId, installationId))
    .returning({ id: schema.workspaces.id });
  for (const w of affected) await recordEvent({ workspaceId: w.id, kind: 'github_disconnected', message: reason });
  return affected.length;
}
