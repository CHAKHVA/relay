import type { Priority, RelayResult, Size, TaskStatus, TaskType, WindowKind, RunKind, UsageSource } from '@relay/core';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => tz('created_at').notNull().defaultNow();

// ---------------------------------------------------------------------------
// Better Auth tables (user, session, account, verification)
// ---------------------------------------------------------------------------
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  githubLogin: text('github_login'),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: tz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    refreshTokenExpiresAt: tz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tz('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relay tables (SPEC §7)
// ---------------------------------------------------------------------------
export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    githubInstallationId: bigint('github_installation_id', { mode: 'number' }),
    repoOwner: text('repo_owner'),
    repoName: text('repo_name'),
    defaultBranch: text('default_branch'),
    labelsCreatedAt: tz('labels_created_at'),
    demoMode: boolean('demo_mode').notNull().default(false),
    dryRun: boolean('dry_run').notNull().default(false),
    clockOffsetMinutes: integer('clock_offset_minutes').notNull().default(0),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('workspaces_installation_idx').on(t.githubInstallationId)],
);

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id'),
    displayName: text('display_name').notNull(),
    githubLogin: text('github_login'),
    role: text('role').$type<'owner' | 'member'>().notNull().default('member'),
    simulated: boolean('simulated').notNull().default(false),
    timezone: text('timezone').notNull().default('UTC'),
    offHoursStart: text('off_hours_start').notNull().default('19:00'),
    offHoursEnd: text('off_hours_end').notNull().default('08:00'),
    beforeResetMinutes: integer('before_reset_minutes').notNull().default(120),
    reservePct: integer('reserve_pct').notNull().default(10),
    windowsSavedAt: tz('windows_saved_at'),
    sharingEnabled: boolean('sharing_enabled').notNull().default(false),
    paused: boolean('paused').notNull().default(false),
    maxConcurrent: integer('max_concurrent').notNull().default(1),
    routineFireUrlEnc: text('routine_fire_url_enc'),
    routineTokenEnc: text('routine_token_enc'),
    routineHint: text('routine_hint'), // "trig_…XYZ" for display; never the secret
    routineConfiguredAt: tz('routine_configured_at'),
    routineTestAt: tz('routine_test_at'),
    usedPct5h: real('used_pct_5h'),
    resets5hAt: tz('resets_5h_at'),
    usedPctWeek: real('used_pct_week'),
    resetsWeekAt: tz('resets_week_at'),
    usageSource: text('usage_source').$type<Exclude<UsageSource, null>>(),
    usageUpdatedAt: tz('usage_updated_at'),
    testWindowUntil: tz('test_window_until'),
    windowNoticeFor: tz('window_notice_for'),
    digestIssueNumber: integer('digest_issue_number'),
    lastDigestDate: text('last_digest_date'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('members_workspace_user_uq').on(t.workspaceId, t.userId),
    index('members_user_idx').on(t.userId),
  ],
);

export const usageTokens = pgTable(
  'usage_tokens',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    lastUsedAt: tz('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('usage_tokens_member_idx').on(t.memberId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    issueNumber: integer('issue_number').notNull(),
    issueUrl: text('issue_url'),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    type: text('type').$type<TaskType>().notNull(),
    likelyFiles: jsonb('likely_files').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    doneCheck: text('done_check'),
    size: text('size').$type<Size>(),
    targetPrNumber: integer('target_pr_number'),
    priority: text('priority').$type<Priority>().notNull().default('normal'),
    requesterMemberId: text('requester_member_id')
      .notNull()
      .references(() => members.id),
    assigneeMemberId: text('assignee_member_id').references(() => members.id, { onDelete: 'set null' }),
    status: text('status').$type<TaskStatus>().notNull(),
    statusReason: text('status_reason'),
    blockedByTaskId: text('blocked_by_task_id'),
    blockedOnFiles: jsonb('blocked_on_files').$type<string[]>(),
    runKind: text('run_kind').$type<RunKind>(),
    windowKind: text('window_kind').$type<WindowKind>(),
    shared: boolean('shared').notNull().default(false),
    requesterUsedPctAtDispatch: real('requester_used_pct_at_dispatch'),
    branch: text('branch'),
    sessionUrl: text('session_url'),
    resultPrNumber: integer('result_pr_number'),
    resultPrUrl: text('result_pr_url'),
    resultCommentUrl: text('result_comment_url'),
    result: jsonb('result').$type<RelayResult>(),
    statusCommentId: bigint('status_comment_id', { mode: 'number' }),
    statusCommentHash: text('status_comment_hash'),
    recurringId: text('recurring_id'),
    attempts: integer('attempts').notNull().default(0),
    estTokens: integer('est_tokens').notNull().default(0),
    costPct: real('cost_pct').notNull().default(0),
    runNow: boolean('run_now').notNull().default(false),
    triageNow: boolean('triage_now').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    triagedAt: tz('triaged_at'),
    dispatchedAt: tz('dispatched_at'),
    completedAt: tz('completed_at'),
  },
  (t) => [
    uniqueIndex('tasks_workspace_issue_uq').on(t.workspaceId, t.issueNumber),
    index('tasks_workspace_status_idx').on(t.workspaceId, t.status),
  ],
);

export const recurringTasks = pgTable(
  'recurring_tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    creatorMemberId: text('creator_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    type: text('type').$type<TaskType>().notNull(),
    likelyFiles: jsonb('likely_files').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    doneCheck: text('done_check'),
    size: text('size').$type<Size>(),
    priority: text('priority').$type<Priority>().notNull().default('normal'),
    targetPrNumber: integer('target_pr_number'),
    cron: text('cron').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: tz('next_run_at').notNull(),
    lastRunAt: tz('last_run_at'),
    createdAt: createdAt(),
  },
  (t) => [index('recurring_workspace_idx').on(t.workspaceId)],
);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id'),
    memberId: text('member_id'),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('events_workspace_created_idx').on(t.workspaceId, t.createdAt), index('events_task_idx').on(t.taskId)],
);

export type NotificationKind = 'task_done_on_my_seat' | 'my_task_ready' | 'task_failed' | 'digest' | 'window_starting';

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    url: text('url'),
    dedupeKey: text('dedupe_key'),
    readAt: tz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_member_idx').on(t.memberId, t.createdAt),
    uniqueIndex('notifications_dedupe_uq').on(t.memberId, t.dedupeKey),
  ],
);

export const digests = pgTable(
  'digests',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    markdown: text('markdown').notNull(),
    commentUrl: text('comment_url'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('digests_member_date_uq').on(t.memberId, t.date)],
);

export const invites = pgTable('invites', {
  code: text('code').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  createdByMemberId: text('created_by_member_id').notNull(),
  expiresAt: tz('expires_at').notNull(),
  usedAt: tz('used_at'),
  usedByMemberId: text('used_by_member_id'),
});

/** Postgres-backed fixed-window rate limit counters (SPEC §11.6, §21.4). */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: tz('window_start').notNull(),
  count: integer('count').notNull().default(0),
});

export type Workspace = typeof workspaces.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type Invite = typeof invites.$inferSelect;
