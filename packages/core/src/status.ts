import type { TaskStatus } from './types';

/** Human labels with a non-color cue (emoji) for every status. */
export const STATUS_META: Record<TaskStatus, { emoji: string; label: string }> = {
  needs_triage: { emoji: '🔎', label: 'Needs triage' },
  triaging: { emoji: '🧭', label: 'Triaging' },
  queued: { emoji: '⏳', label: 'Queued' },
  waiting_window: { emoji: '🟡', label: 'Waiting for a run window' },
  blocked: { emoji: '⛔', label: 'Blocked' },
  dispatched: { emoji: '🏃', label: 'Running' },
  done: { emoji: '✅', label: 'Done' },
  merged: { emoji: '🟣', label: 'Merged' },
  failed: { emoji: '❌', label: 'Failed' },
  stale: { emoji: '⌛', label: 'Stale' },
  cancelled: { emoji: '🚫', label: 'Cancelled' },
};

export const STATUS_COMMENT_MARKER = '<!-- relay-status -->';

export interface StatusCommentInput {
  status: TaskStatus;
  statusReason: string | null;
  taskUrl: string;
  requester: string | null; // "@ana" or "Ana (Simulated)"
  assignee: string | null; // "@giorgi"
  sessionUrl: string | null;
  prUrl: string | null;
  commentUrl: string | null;
  dryRun: boolean;
  note?: string | null;
}

/** The single status comment Relay keeps on each task issue (SPEC §8.4), edited in place. */
export function buildStatusComment(i: StatusCommentInput): string {
  const meta = STATUS_META[i.status];
  const parts = [`**Relay** · ${meta.emoji} ${meta.label}`];
  if (i.statusReason) parts.push(i.statusReason);
  const attribution: string[] = [];
  if (i.requester) attribution.push(`Requested by ${i.requester}`);
  if (i.assignee) attribution.push(`Run on ${i.assignee}'s seat`);
  const links = [
    i.sessionUrl ? `[Session](${i.sessionUrl})` : null,
    i.prUrl ? `[Pull request](${i.prUrl})` : null,
    i.commentUrl ? `[Result](${i.commentUrl})` : null,
    `[Open in Relay](${i.taskUrl})`,
  ].filter(Boolean);
  const lines = [STATUS_COMMENT_MARKER, `${parts.join(' · ')} · ${links.join(' · ')}`];
  if (attribution.length) lines.push('', `<sub>${attribution.join(' · ')}${i.dryRun ? ' · **DRY RUN**' : ''}</sub>`);
  else if (i.dryRun) lines.push('', '<sub>**DRY RUN**</sub>');
  if (i.note) lines.push('', `> ${i.note}`);
  return lines.join('\n');
}
