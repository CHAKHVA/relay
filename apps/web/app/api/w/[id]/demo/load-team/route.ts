import { requireOwner } from '@/lib/access';
import { json, route } from '@/lib/http';
import { loadDemoTeam } from '@/lib/services/demo';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireOwner(req, id);
  const created = await loadDemoTeam(workspace, member);
  return json({ added: created.map((m) => m.displayName) });
});
