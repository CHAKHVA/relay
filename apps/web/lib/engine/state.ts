import {
  activeWindowKind,
  buildSeatStates,
  computeStats,
  isActiveClaim,
  nextWindowStart,
  type ActiveWindow,
} from '@relay/core';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Workspace } from '../db/schema';
import { publicMember } from '../services/seat';
import { clockFor } from './tick';
import { loadMembers, loadTasks, toSched, toSeat } from './load';

/** Board payload for `GET /api/w/:id/state` (SPEC §12). */
export async function boardState(ws: Workspace, meMemberId: string, realNow = new Date()) {
  const now = clockFor(ws, realNow);
  const [members, tasks, events] = await Promise.all([
    loadMembers(ws.id),
    loadTasks(ws.id),
    db().select().from(schema.events).where(eq(schema.events.workspaceId, ws.id)).orderBy(desc(schema.events.createdAt)).limit(50),
  ]);
  const seats = members.map(toSeat);
  const sched = tasks.map(toSched);
  const states = buildSeatStates(seats, sched, now);
  const memberViews = members.map((m) => {
    const seat = seats.find((s) => s.id === m.id)!;
    const st = states.get(m.id)!;
    const window: ActiveWindow = activeWindowKind(seat, now, seat);
    const next = nextWindowStart(seat, now, seat);
    return {
      ...publicMember(m),
      estimate: st.estimate,
      running: st.running,
      activeWindow: window,
      nextWindowAt: next ? next.toISOString() : null,
    };
  });
  const claims = sched.filter(isActiveClaim).map((t) => ({ taskId: t.id, files: t.likelyFiles }));
  return {
    workspace: {
      id: ws.id,
      name: ws.name,
      repo: ws.repoOwner && ws.repoName ? `${ws.repoOwner}/${ws.repoName}` : null,
      demoMode: ws.demoMode,
      dryRun: ws.dryRun,
      clockOffsetMinutes: ws.clockOffsetMinutes,
      githubConnected: Boolean(ws.githubInstallationId),
    },
    now: now.toISOString(),
    meMemberId,
    members: memberViews,
    tasks: tasks.map((t) => ({ ...t, body: t.body.slice(0, 2000), result: undefined, resultSummary: t.result?.summary ?? null })),
    ledger: { claims, blocked: tasks.filter((t) => t.status === 'blocked').map((t) => ({ taskId: t.id, blockedByTaskId: t.blockedByTaskId, files: t.blockedOnFiles ?? [] })) },
    events,
    stats: computeStats(sched, seats),
  };
}
