import { and, eq } from 'drizzle-orm';
import { getSessionUser, type SessionUser } from './auth';
import { db, schema } from './db';
import type { Member, Workspace } from './db/schema';
import { forbidden, notFound, unauthorized } from './http';

export async function requireUser(req: Request): Promise<SessionUser> {
  const u = await getSessionUser(req.headers);
  if (!u) throw unauthorized();
  return u;
}

export interface MemberCtx {
  user: SessionUser;
  member: Member;
  workspace: Workspace;
}

/** Workspace isolation: the workspace is resolved only through the caller's membership (404 otherwise). */
export async function requireMember(req: Request, workspaceId: string): Promise<MemberCtx> {
  const user = await requireUser(req);
  return memberCtxFor(user, workspaceId);
}

export async function memberCtxFor(user: SessionUser, workspaceId: string): Promise<MemberCtx> {
  const rows = await db()
    .select({ member: schema.members, workspace: schema.workspaces })
    .from(schema.members)
    .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.members.workspaceId, workspaceId), eq(schema.members.userId, user.id)));
  const row = rows[0];
  if (!row) throw notFound('Workspace not found');
  return { user, member: row.member, workspace: row.workspace };
}

export async function requireOwner(req: Request, workspaceId: string): Promise<MemberCtx> {
  const ctx = await requireMember(req, workspaceId);
  if (ctx.member.role !== 'owner') throw forbidden();
  return ctx;
}
