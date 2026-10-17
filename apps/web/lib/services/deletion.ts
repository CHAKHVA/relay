import { and, eq, inArray } from 'drizzle-orm';
import type { SessionUser } from '../auth';
import { db, schema } from '../db';
import type { Workspace } from '../db/schema';
import { conflict } from '../http';

/** Delete a workspace and all of its Relay data. GitHub history is untouched (SPEC §21.4). */
export async function deleteWorkspace(ws: Workspace) {
  const members = await db().select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.workspaceId, ws.id));
  const ids = members.map((m) => m.id);
  await db().transaction(async (tx) => {
    await tx.delete(schema.tasks).where(eq(schema.tasks.workspaceId, ws.id));
    await tx.delete(schema.events).where(eq(schema.events.workspaceId, ws.id));
    if (ids.length) {
      await tx.delete(schema.notifications).where(inArray(schema.notifications.memberId, ids));
      await tx.delete(schema.digests).where(inArray(schema.digests.memberId, ids));
    }
    await tx.delete(schema.workspaces).where(eq(schema.workspaces.id, ws.id)); // cascades members, usage tokens, invites, recurring
  });
}

/**
 * Delete my account: memberships, usage tokens, encrypted routine credentials, then the user.
 * Owners must transfer or delete their workspaces first.
 */
export async function deleteAccount(user: SessionUser) {
  const mine = await db().select().from(schema.members).where(eq(schema.members.userId, user.id));
  const owned = mine.filter((m) => m.role === 'owner');
  if (owned.length) {
    const ws = await db().select({ name: schema.workspaces.name }).from(schema.workspaces).where(inArray(schema.workspaces.id, owned.map((m) => m.workspaceId)));
    throw conflict(`You own ${ws.map((w) => `“${w.name}”`).join(', ')}. Delete the workspace${ws.length > 1 ? 's' : ''} first (Settings), then delete your account.`);
  }
  const ids = mine.map((m) => m.id);
  await db().transaction(async (tx) => {
    if (ids.length) {
      // Tasks this person requested live only in Relay (the GitHub issues remain).
      await tx.delete(schema.tasks).where(inArray(schema.tasks.requesterMemberId, ids));
      await tx.delete(schema.recurringTasks).where(inArray(schema.recurringTasks.creatorMemberId, ids));
      await tx.delete(schema.members).where(and(eq(schema.members.userId, user.id)));
    }
    await tx.delete(schema.user).where(eq(schema.user.id, user.id)); // cascades sessions and accounts
  });
}
