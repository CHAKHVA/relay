import type { SchedTask, SeatMember } from '../src/types';

export const at = (iso: string) => new Date(iso);

export function member(over: Partial<SeatMember> = {}): SeatMember {
  return {
    id: 'm_me',
    displayName: 'Me',
    githubLogin: 'me',
    simulated: false,
    paused: false,
    timezone: 'UTC',
    offHoursStart: '19:00',
    offHoursEnd: '08:00',
    beforeResetMinutes: 120,
    reservePct: 10,
    sharingEnabled: false,
    maxConcurrent: 1,
    routineConfigured: true,
    usedPct5h: 20,
    resets5hAt: null,
    usedPctWeek: null,
    resetsWeekAt: null,
    usageSource: 'manual',
    usageUpdatedAt: null,
    testWindowUntil: null,
    lastDigestDate: null,
    ...over,
  };
}

let seq = 0;
export function task(over: Partial<SchedTask> = {}): SchedTask {
  seq++;
  return {
    id: `t${seq}`,
    issueNumber: seq,
    title: `Task ${seq}`,
    type: 'code',
    status: 'queued',
    priority: 'normal',
    size: 'S',
    likelyFiles: [],
    requesterMemberId: 'm_me',
    assigneeMemberId: null,
    runKind: null,
    windowKind: null,
    costPct: 0,
    estTokens: 0,
    shared: false,
    requesterUsedPctAtDispatch: null,
    createdAt: at('2026-10-01T00:00:00Z'),
    dispatchedAt: null,
    completedAt: null,
    runNow: false,
    triageNow: false,
    branch: null,
    resultPrUrl: null,
    resultCommentUrl: null,
    filesChanged: null,
    ...over,
  };
}
