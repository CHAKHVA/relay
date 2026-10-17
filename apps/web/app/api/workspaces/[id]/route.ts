import { z } from 'zod';
import { requireOwner } from '@/lib/access';
import { badRequest, json, parseBody, route } from '@/lib/http';
import { deleteWorkspace } from '@/lib/services/deletion';

/** DELETE /api/workspaces/:id — owner only; the body must repeat the workspace name. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  const { confirmName } = await parseBody(req, z.object({ confirmName: z.string() }));
  if (confirmName.trim() !== workspace.name) throw badRequest('Type the workspace name exactly to confirm', 'confirm_mismatch');
  await deleteWorkspace(workspace);
  return json({ ok: true });
});
