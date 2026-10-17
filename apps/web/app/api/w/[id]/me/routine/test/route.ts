import { requireMember } from '@/lib/access';
import { json, route } from '@/lib/http';
import { FireError } from '@/lib/routine';
import { testRoutine } from '@/lib/services/seat';

export const maxDuration = 60;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { member, workspace } = await requireMember(req, id);
  try {
    const r = await testRoutine(workspace, member);
    return json({ ok: true, sessionUrl: r.sessionUrl, dryRun: r.dryRun });
  } catch (e) {
    if (e instanceof FireError) return json({ ok: false, error: e.message, status: e.status ?? null }, { status: 502 });
    throw e;
  }
});
