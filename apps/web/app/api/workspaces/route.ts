import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { json, parseBody, route } from '@/lib/http';
import { createWorkspace, listMyWorkspaces } from '@/lib/services/workspaces';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().max(64).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await parseBody(req, createSchema);
  const { workspace, member } = await createWorkspace(user, body);
  return json({ workspace: { id: workspace.id, name: workspace.name }, member: { id: member.id, role: member.role } }, { status: 201 });
});

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await listMyWorkspaces(user.id);
  return json({ workspaces: rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.member.role })) });
});
