import { z } from 'zod';
import { requireOwner } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { selectRepo } from '@/lib/services/github-connect';
import { runTickSafe } from '@/lib/engine/tick';

const bodySchema = z.object({ fullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  const { fullName } = await parseBody(req, bodySchema);
  const r = await selectRepo(workspace, fullName);
  await runTickSafe(workspace.id);
  return json({ repo: `${r.workspace.repoOwner}/${r.workspace.repoName}`, defaultBranch: r.workspace.defaultBranch, imported: r.imported });
});
