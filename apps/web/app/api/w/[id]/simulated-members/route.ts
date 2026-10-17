import { requireOwner } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { addSimulatedMember, simulatedMemberSchema } from '@/lib/services/demo';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace } = await requireOwner(req, id);
  const body = await parseBody(req, simulatedMemberSchema);
  const m = await addSimulatedMember(workspace, body);
  return json({ member: { id: m.id, displayName: m.displayName, simulated: true } }, { status: 201 });
});
