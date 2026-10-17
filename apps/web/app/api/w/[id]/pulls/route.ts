import { requireMember } from '@/lib/access';
import { repoOf, workspaceOctokit } from '@/lib/github/repo';
import { json, route } from '@/lib/http';

/** Open pull requests for the "target PR" picker in the new-task dialog. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireMember(req, id);
  if (!workspace.githubInstallationId || !workspace.repoName) return json({ pulls: [] });
  const gh = await workspaceOctokit(workspace);
  const { data } = await gh.rest.pulls.list({ ...repoOf(workspace), state: 'open', per_page: 30, sort: 'updated', direction: 'desc' });
  return json({ pulls: data.map((p) => ({ number: p.number, title: p.title, url: p.html_url })) });
});
