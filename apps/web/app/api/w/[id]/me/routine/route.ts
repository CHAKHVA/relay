import { requireMember } from '@/lib/access';
import { json, route } from '@/lib/http';
import { clearRoutine, publicMember, saveRoutine } from '@/lib/services/seat';

export const PUT = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const body = await req.json().catch(() => null);
  const m = await saveRoutine(member, body);
  return json({ member: publicMember(m) });
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  return json({ member: publicMember(await clearRoutine(member)) });
});
