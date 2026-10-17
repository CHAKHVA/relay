import { RELAY_LABELS } from '@relay/core';
import type { Workspace } from '../db/schema';
import { badRequest } from '../http';
import { installationOctokit, type GH } from './app';

export interface RepoRef {
  owner: string;
  repo: string;
}

export function repoOf(ws: Pick<Workspace, 'repoOwner' | 'repoName'>): RepoRef {
  if (!ws.repoOwner || !ws.repoName) throw badRequest('Connect a repository first', 'no_repo');
  return { owner: ws.repoOwner, repo: ws.repoName };
}

export async function workspaceOctokit(ws: Pick<Workspace, 'githubInstallationId'>): Promise<GH> {
  if (!ws.githubInstallationId) throw badRequest('Install the Relay GitHub App first', 'no_installation');
  return installationOctokit(ws.githubInstallationId);
}

/** Create any missing Relay labels (idempotent). */
export async function ensureLabels(gh: GH, ref: RepoRef, extra: { name: string; color: string; description?: string }[] = []) {
  const existing = await gh.paginate(gh.rest.issues.listLabelsForRepo, { ...ref, per_page: 100 });
  const have = new Set(existing.map((l) => l.name.toLowerCase()));
  for (const l of [...RELAY_LABELS, ...extra]) {
    if (have.has(l.name.toLowerCase())) continue;
    try {
      await gh.rest.issues.createLabel({ ...ref, name: l.name, color: l.color, description: l.description });
    } catch (e) {
      // 422 = already exists (race); anything else bubbles up.
      if ((e as { status?: number }).status !== 422) throw e;
    }
  }
}

export async function listInstallationRepos(gh: GH) {
  const repos = await gh.paginate(gh.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
  return repos.map((r) => ({ owner: r.owner.login, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }));
}
