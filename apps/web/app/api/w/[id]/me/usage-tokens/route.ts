import { z } from 'zod';
import { requireMember } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { createUsageToken, listUsageTokens } from '@/lib/services/seat';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  return json({ tokens: await listUsageTokens(member) });
});

/** The token value is returned exactly once. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { member } = await requireMember(req, id);
  const { name } = await parseBody(req, z.object({ name: z.string().max(60).default('statusLine') }));
  return json(await createUsageToken(member, name), { status: 201 });
});
