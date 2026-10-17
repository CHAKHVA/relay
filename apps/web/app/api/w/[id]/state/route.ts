import { requireMember } from '@/lib/access';
import { boardState } from '@/lib/engine/state';
import { json, route } from '@/lib/http';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireMember(req, id);
  return json(await boardState(workspace, member.id));
});
