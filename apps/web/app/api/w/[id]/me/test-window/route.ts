import { requireMember } from '@/lib/access';
import { runTickSafe } from '@/lib/engine/tick';
import { json, parseBody, route } from '@/lib/http';
import { publicMember, setTestWindow, testWindowSchema } from '@/lib/services/seat';

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { member, workspace } = await requireMember(req, id);
  const { minutes } = await parseBody(req, testWindowSchema);
  const m = await setTestWindow(member, minutes);
  await runTickSafe(workspace.id);
  return json({ member: publicMember(m) });
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  return json({ member: publicMember(await setTestWindow(member, null)) });
});
