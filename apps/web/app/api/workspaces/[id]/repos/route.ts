import { requireOwner } from '@/lib/access';
import { listInstallationRepos, workspaceOctokit } from '@/lib/github/repo';
import { json, route } from '@/lib/http';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  if (!workspace.githubInstallationId) return json({ repos: [] });
  return json({ repos: await listInstallationRepos(await workspaceOctokit(workspace)) });
});
