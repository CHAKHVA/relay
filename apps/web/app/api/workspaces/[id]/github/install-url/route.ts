import { requireOwner } from '@/lib/access';
import { installUrl } from '@/lib/github/app';
import { json, route } from '@/lib/http';
import { signInstallState } from '@/lib/services/github-connect';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  return json({ url: installUrl(signInstallState(workspace.id)) });
});
