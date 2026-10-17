import { requireOwner } from '@/lib/access';
import { appUrl } from '@/lib/env';
import { json, route } from '@/lib/http';
import { createInvite } from '@/lib/services/workspaces';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { member, workspace } = await requireOwner(req, id);
  const inv = await createInvite(workspace.id, member.id);
  return json({ code: inv.code, url: `${appUrl()}/invite/${inv.code}`, expiresAt: inv.expiresAt.toISOString() }, { status: 201 });
});
