import { isValidTimeZone } from '@relay/core';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { SessionUser } from '../auth';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { badRequest, notFound, tooMany } from '../http';
import { newId, randomToken } from '../ids';

export const MAX_WORKSPACES_PER_USER = 20;
export const INVITE_TTL_DAYS = 7;

export async function createWorkspace(user: SessionUser, input: { name: string; timezone?: string | undefined }) {
  const [{ n } = { n: 0 }] = await db()
    .select({ n: count() })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.createdByUserId, user.id));
  if (n >= MAX_WORKSPACES_PER_USER) throw tooMany(`You can create up to ${MAX_WORKSPACES_PER_USER} workspaces.`);
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : 'UTC';
  const wsId = newId();
  return db().transaction(async (tx) => {
    const [workspace] = await tx
      .insert(schema.workspaces)
      .values({ id: wsId, name: input.name.trim(), createdByUserId: user.id })
      .returning();
    const [member] = await tx
      .insert(schema.members)
      .values({
        id: newId(),
        workspaceId: wsId,
        userId: user.id,
        displayName: user.name || user.githubLogin || 'Owner',
        githubLogin: user.githubLogin ?? null,
        role: 'owner',
        timezone,
      })
      .returning();
    return { workspace: workspace as Workspace, member: member as Member };
  });
}

export async function listMyWorkspaces(userId: string) {
  return db()
    .select({ workspace: schema.workspaces, member: schema.members })
    .from(schema.members)
    .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
    .where(eq(schema.members.userId, userId))
    .orderBy(schema.workspaces.createdAt);
}

export async function createInvite(workspaceId: string, createdByMemberId: string, now = new Date()) {
  const code = randomToken(12);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
  await db().insert(schema.invites).values({ code, workspaceId, createdByMemberId, expiresAt });
  return { code, expiresAt };
}

export async function getInvite(code: string, now = new Date()) {
  const [row] = await db()
    .select({ invite: schema.invites, workspace: schema.workspaces })
    .from(schema.invites)
    .innerJoin(schema.workspaces, eq(schema.invites.workspaceId, schema.workspaces.id))
    .where(eq(schema.invites.code, code));
  if (!row) return null;
  const usable = !row.invite.usedAt && row.invite.expiresAt.getTime() > now.getTime();
  return { ...row, usable };
}

/** Join via invite. Idempotent: an existing member just gets their membership back. */
export async function acceptInvite(user: SessionUser, code: string, input: { timezone?: string | undefined } = {}, now = new Date()) {
  const inv = await getInvite(code, now);
  if (!inv) throw notFound('Invite not found');
  const [existing] = await db()
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.workspaceId, inv.workspace.id), eq(schema.members.userId, user.id)));
  if (existing) return { workspace: inv.workspace, member: existing, alreadyMember: true };
  if (!inv.usable) throw badRequest('This invite has expired or was already used. Ask the owner for a new link.', 'invite_unusable');
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : 'UTC';
  return db().transaction(async (tx) => {
    const memberId = newId();
    const claimed = await tx
      .update(schema.invites)
      .set({ usedAt: now, usedByMemberId: memberId })
      .where(and(eq(schema.invites.code, code), isNull(schema.invites.usedAt), gt(schema.invites.expiresAt, now)))
      .returning();
    if (!claimed.length) throw badRequest('This invite was just used. Ask the owner for a new link.', 'invite_unusable');
    const [member] = await tx
      .insert(schema.members)
      .values({
        id: memberId,
        workspaceId: inv.workspace.id,
        userId: user.id,
        displayName: user.name || user.githubLogin || 'Member',
        githubLogin: user.githubLogin ?? null,
        role: 'member',
        timezone,
      })
      .returning();
    return { workspace: inv.workspace, member: member as Member, alreadyMember: false };
  });
}

export async function listMembers(workspaceId: string) {
  return db().select().from(schema.members).where(eq(schema.members.workspaceId, workspaceId)).orderBy(schema.members.createdAt);
}
