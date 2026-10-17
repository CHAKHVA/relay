import { requireMember } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { manualUsageSchema, publicMember, setManualUsage } from '@/lib/services/seat';

export const PATCH = route<{ id: string; mid: string }>(async (req, { id, mid }) => {
  const { member, workspace } = await requireMember(req, id);
  const input = await parseBody(req, manualUsageSchema);
  return json({ member: publicMember(await setManualUsage(workspace, member, mid, input)) });
});
