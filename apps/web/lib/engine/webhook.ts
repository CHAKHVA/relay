import { parseBranch } from '@relay/core';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db';
import type { Workspace } from '../db/schema';
import { ensureLabels, workspaceOctokit } from '../github/repo';
import { log } from '../http';
import { disconnectInstallation } from '../services/github-connect';
import { recordEvent } from './events';
import { syncStatusComment } from './status-comment';
import { syncIssue } from './sync';
import { runTickSafe } from './tick';

const repoSchema = z.object({ name: z.string(), owner: z.object({ login: z.string() }), full_name: z.string() });
const installationRef = z.object({ id: z.number() }).nullish();
const labelSchema = z.object({ name: z.string().nullish() }).passthrough();

const issuesSchema = z.object({
  action: z.string(),
  installation: installationRef,
  repository: repoSchema,
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullish(),
    state: z.string(),
    html_url: z.string().optional(),
    user: z.object({ login: z.string() }).nullish(),
    labels: z.array(labelSchema).default([]),
    pull_request: z.unknown().optional(),
  }),
});

const pushSchema = z.object({
  ref: z.string(),
  after: z.string(),
  deleted: z.boolean().optional(),
  installation: installationRef,
  repository: z.object({ name: z.string(), owner: z.object({ login: z.string().optional(), name: z.string().optional() }).passthrough() }),
});

const prSchema = z.object({
  action: z.string(),
  installation: installationRef,
  repository: repoSchema,
  pull_request: z.object({ number: z.number(), merged: z.boolean().nullish(), html_url: z.string(), head: z.object({ ref: z.string() }) }),
});

const installationSchema = z.object({
  action: z.string(),
  installation: z.object({ id: z.number() }),
  repositories_removed: z.array(z.object({ full_name: z.string() })).optional(),
});

async function workspacesFor(installationId: number | undefined, owner: string, repo: string): Promise<Workspace[]> {
  if (!installationId) return [];
  return db()
    .select()
    .from(schema.workspaces)
    .where(
      and(
        eq(schema.workspaces.githubInstallationId, installationId),
        sql`lower(${schema.workspaces.repoOwner}) = lower(${owner})`,
        sql`lower(${schema.workspaces.repoName}) = lower(${repo})`,
      ),
    );
}

export type WebhookResult = { handled: boolean; detail?: string };

/** Dispatch a verified GitHub webhook. Every branch is idempotent. */
export async function handleWebhook(event: string, payload: unknown): Promise<WebhookResult> {
  switch (event) {
    case 'ping':
      return { handled: true, detail: 'pong' };
    case 'installation':
    case 'installation_repositories': {
      const p = installationSchema.safeParse(payload);
      if (!p.success) return { handled: false, detail: 'invalid payload' };
      const { action, installation } = p.data;
      if (event === 'installation' && (action === 'deleted' || action === 'suspend')) {
        const n = await disconnectInstallation(installation.id, `GitHub App ${action === 'deleted' ? 'uninstalled' : 'suspended'}`);
        return { handled: true, detail: `disconnected ${n}` };
      }
      if (event === 'installation_repositories' && action === 'removed') {
        for (const r of p.data.repositories_removed ?? []) {
          const [owner, name] = r.full_name.split('/') as [string, string];
          const affected = await workspacesFor(installation.id, owner, name);
          for (const ws of affected) {
            await db().update(schema.workspaces).set({ githubInstallationId: null }).where(eq(schema.workspaces.id, ws.id));
            await recordEvent({ workspaceId: ws.id, kind: 'github_disconnected', message: `${r.full_name} removed from the GitHub App installation` });
          }
        }
        return { handled: true };
      }
      if (action === 'created' || action === 'added' || action === 'unsuspend' || action === 'new_permissions_accepted') {
        // Re-ensure labels for any linked workspace on this installation.
        const linked = await db().select().from(schema.workspaces).where(eq(schema.workspaces.githubInstallationId, installation.id));
        for (const ws of linked) {
          if (!ws.repoOwner || !ws.repoName) continue;
          try {
            await ensureLabels(await workspaceOctokit(ws), { owner: ws.repoOwner, repo: ws.repoName });
          } catch (e) {
            log('warn', 'ensureLabels failed', { workspaceId: ws.id, error: (e as Error).message });
          }
        }
      }
      return { handled: true };
    }
    case 'issues': {
      const p = issuesSchema.safeParse(payload);
      if (!p.success) return { handled: false, detail: 'invalid payload' };
      const { issue, repository, installation } = p.data;
      if (issue.pull_request) return { handled: false, detail: 'pull request' };
      const targets = await workspacesFor(installation?.id, repository.owner.login, repository.name);
      for (const ws of targets) {
        const members = await db().select().from(schema.members).where(eq(schema.members.workspaceId, ws.id));
        const r = await syncIssue(ws, issue, { members });
        if (r.task && r.changed) await syncStatusComment(ws, r.task, members);
        if (r.changed) await runTickSafe(ws.id);
      }
      return { handled: targets.length > 0 };
    }
    case 'push': {
      const p = pushSchema.safeParse(payload);
      if (!p.success) return { handled: false, detail: 'invalid payload' };
      const parsed = parseBranch(p.data.ref);
      if (!parsed || p.data.deleted) return { handled: false, detail: 'not a relay branch' };
      const owner = p.data.repository.owner.login ?? p.data.repository.owner.name ?? '';
      const targets = await workspacesFor(p.data.installation?.id, owner, p.data.repository.name);
      const { handleResultForTask } = await import('./results');
      for (const ws of targets) {
        await handleResultForTask(ws, parsed.taskId, { ref: p.data.ref.replace(/^refs\/heads\//, ''), sha: p.data.after });
        await runTickSafe(ws.id);
      }
      return { handled: targets.length > 0 };
    }
    case 'pull_request': {
      const p = prSchema.safeParse(payload);
      if (!p.success) return { handled: false, detail: 'invalid payload' };
      const { pull_request: pr, repository, installation, action } = p.data;
      if (action !== 'closed' || !pr.merged) return { handled: false };
      const parsed = parseBranch(pr.head.ref);
      if (!parsed) return { handled: false };
      const targets = await workspacesFor(installation?.id, repository.owner.login, repository.name);
      for (const ws of targets) {
        const [task] = await db()
          .update(schema.tasks)
          .set({ status: 'merged', statusReason: null, resultPrUrl: pr.html_url, resultPrNumber: pr.number, updatedAt: new Date() })
          .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.id, parsed.taskId), eq(schema.tasks.status, 'done')))
          .returning();
        if (task) {
          await recordEvent({ workspaceId: ws.id, taskId: task.id, kind: 'task_merged', message: `${task.id} merged (PR #${pr.number})` });
          const members = await db().select().from(schema.members).where(eq(schema.members.workspaceId, ws.id));
          await syncStatusComment(ws, task, members);
        }
      }
      return { handled: true };
    }
    default:
      return { handled: false, detail: `ignored ${event}` };
  }
}
