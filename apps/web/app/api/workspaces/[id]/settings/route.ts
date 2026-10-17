import { requireOwner } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { updateWorkspaceSettings, workspaceSettingsSchema } from '@/lib/services/seat';

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  const patch = await parseBody(req, workspaceSettingsSchema);
  const w = await updateWorkspaceSettings(workspace, patch);
  return json({ workspace: { id: w.id, demoMode: w.demoMode, dryRun: w.dryRun, clockOffsetMinutes: w.clockOffsetMinutes } });
});
