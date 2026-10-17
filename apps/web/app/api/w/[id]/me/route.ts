import { requireMember } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { publicMember, seatPatchSchema, updateSeat } from '@/lib/services/seat';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  return json({ member: publicMember(member) });
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const patch = await parseBody(req, seatPatchSchema);
  return json({ member: publicMember(await updateSeat(member, patch)) });
});
