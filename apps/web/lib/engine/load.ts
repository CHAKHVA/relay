import type { SchedTask, SeatMember } from '@relay/core';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task } from '../db/schema';

export function toSeat(m: Member): SeatMember {
  return {
    id: m.id,
    displayName: m.displayName,
    githubLogin: m.githubLogin,
    simulated: m.simulated,
    paused: m.paused,
    timezone: m.timezone,
    offHoursStart: m.offHoursStart,
    offHoursEnd: m.offHoursEnd,
    beforeResetMinutes: m.beforeResetMinutes,
    reservePct: m.reservePct,
    sharingEnabled: m.sharingEnabled,
    maxConcurrent: m.maxConcurrent,
    routineConfigured: Boolean(m.routineFireUrlEnc && m.routineTokenEnc),
    usedPct5h: m.usedPct5h,
    resets5hAt: m.resets5hAt,
    usedPctWeek: m.usedPctWeek,
    resetsWeekAt: m.resetsWeekAt,
    usageSource: m.usageSource ?? null,
    usageUpdatedAt: m.usageUpdatedAt,
    testWindowUntil: m.testWindowUntil,
    lastDigestDate: m.lastDigestDate,
  };
}

export function toSched(t: Task): SchedTask {
  return {
    id: t.id,
    issueNumber: t.issueNumber,
    title: t.title,
    type: t.type,
    status: t.status,
    priority: t.priority,
    size: t.size,
    likelyFiles: t.likelyFiles,
    requesterMemberId: t.requesterMemberId,
    assigneeMemberId: t.assigneeMemberId,
    runKind: t.runKind,
    windowKind: t.windowKind,
    costPct: t.costPct,
    estTokens: t.estTokens,
    shared: t.shared,
    requesterUsedPctAtDispatch: t.requesterUsedPctAtDispatch,
    createdAt: t.createdAt,
    dispatchedAt: t.dispatchedAt,
    completedAt: t.completedAt,
    runNow: t.runNow,
    triageNow: t.triageNow,
    branch: t.branch,
    resultPrUrl: t.resultPrUrl,
    resultCommentUrl: t.resultCommentUrl,
    filesChanged: t.result?.filesChanged ?? null,
    blockedByTaskId: t.blockedByTaskId,
  };
}

export async function loadMembers(workspaceId: string): Promise<Member[]> {
  return db().select().from(schema.members).where(eq(schema.members.workspaceId, workspaceId)).orderBy(schema.members.createdAt);
}

export async function loadTasks(workspaceId: string): Promise<Task[]> {
  return db().select().from(schema.tasks).where(eq(schema.tasks.workspaceId, workspaceId));
}
