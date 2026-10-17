export const TASK_TYPES = ['code', 'review', 'docs', 'business'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  'needs_triage',
  'triaging',
  'queued',
  'waiting_window',
  'blocked',
  'dispatched',
  'done',
  'merged',
  'failed',
  'stale',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['high', 'normal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SIZES = ['S', 'M', 'L'] as const;
export type Size = (typeof SIZES)[number];

export type RunKind = 'triage' | 'work';
/** What is recorded on a task. `manual` = Run now / Triage now / temporary test window. */
export type WindowKind = 'off_hours' | 'before_reset' | 'manual';
/** What a member's seat is in right now. `test` = temporary test window. */
export type ActiveWindow = 'off_hours' | 'before_reset' | 'test' | null;

export type UsageSource = 'beacon' | 'manual' | 'simulated' | null;

export interface WorkspaceClock {
  demoMode: boolean;
  clockOffsetMinutes: number;
}

/** The subset of a member row the scheduler needs. */
export interface SeatMember {
  id: string;
  displayName: string;
  githubLogin: string | null;
  simulated: boolean;
  paused: boolean;
  timezone: string;
  offHoursStart: string; // HH:mm local
  offHoursEnd: string; // HH:mm local
  beforeResetMinutes: number;
  reservePct: number;
  sharingEnabled: boolean;
  maxConcurrent: number;
  routineConfigured: boolean;
  usedPct5h: number | null;
  resets5hAt: Date | null;
  usedPctWeek: number | null;
  resetsWeekAt: Date | null;
  usageSource: UsageSource;
  usageUpdatedAt: Date | null;
  testWindowUntil: Date | null;
  lastDigestDate?: string | null;
}

/** The subset of a task row the scheduler needs. */
export interface SchedTask {
  id: string;
  issueNumber: number;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  size: Size | null;
  likelyFiles: string[];
  requesterMemberId: string;
  assigneeMemberId: string | null;
  runKind: RunKind | null;
  windowKind?: WindowKind | null;
  costPct: number;
  estTokens?: number;
  shared?: boolean;
  requesterUsedPctAtDispatch?: number | null;
  createdAt: Date;
  dispatchedAt: Date | null;
  completedAt?: Date | null;
  runNow: boolean;
  triageNow: boolean;
  branch?: string | null;
  resultPrUrl?: string | null;
  resultCommentUrl?: string | null;
  filesChanged?: string[] | null;
  blockedByTaskId?: string | null;
}

export interface UsageEstimate {
  usedPct5h: number;
  usedPctWeek: number | null;
  confidence: 'live' | 'estimated' | 'unknown';
}
