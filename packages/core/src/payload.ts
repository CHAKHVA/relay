import { BRANCH_PREFIX } from './config';
import type { RecentChange } from './ledger';
import type { RunKind, TaskType } from './types';

export interface PayloadTask {
  id: string;
  type: TaskType;
  title: string;
  body: string;
  likelyFiles: string[];
  doneCheck: string | null;
  targetPrNumber: number | null;
}

export interface JobPayload {
  jobKind: RunKind;
  relayTaskId: string;
  branch: string;
  type: TaskType;
  title: string;
  description: string;
  likelyFiles: string[];
  doneCheck: string | null;
  targetPr: number | null;
  requester: string | null;
  recentTeamChanges: RecentChange[];
}

export function workBranch(taskId: string): string {
  return `${BRANCH_PREFIX}${taskId}`;
}

export function triageBranch(taskId: string, attempt: number): string {
  return `${BRANCH_PREFIX}${taskId}-triage-${attempt}`;
}

export function branchFor(taskId: string, runKind: RunKind, attempt: number): string {
  return runKind === 'triage' ? triageBranch(taskId, attempt) : workBranch(taskId);
}

const BRANCH_RE = /^claude\/relay-([a-z0-9]+)(?:-triage-(\d+))?$/;

/** Parse "claude/relay-<id>" or "claude/relay-<id>-triage-<n>" (also accepts "refs/heads/…"). */
export function parseBranch(ref: string): { taskId: string; runKind: RunKind; attempt: number | null } | null {
  const m = BRANCH_RE.exec(ref.replace(/^refs\/heads\//, ''));
  if (!m) return null;
  return { taskId: m[1] as string, runKind: m[2] ? 'triage' : 'work', attempt: m[2] ? Number(m[2]) : null };
}

export function buildJobPayload(
  task: PayloadTask,
  runKind: RunKind,
  recent: RecentChange[],
  requesterLogin: string | null,
  attempt = 1,
): JobPayload {
  return {
    jobKind: runKind,
    relayTaskId: task.id,
    branch: branchFor(task.id, runKind, attempt),
    type: task.type,
    title: task.title,
    description: task.body,
    likelyFiles: task.likelyFiles,
    doneCheck: task.doneCheck,
    targetPr: task.targetPrNumber,
    requester: requesterLogin,
    recentTeamChanges: recent,
  };
}

/** Text sent to the routine /fire endpoint. */
export function fireText(payload: JobPayload): string {
  return `RELAY_JOB_JSON:\n${JSON.stringify(payload, null, 2)}`;
}
