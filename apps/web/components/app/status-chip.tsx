import { STATUS_META, type TaskStatus } from '@relay/core';
import { Badge } from '@/components/ui/badge';

const TONE: Record<TaskStatus, 'neutral' | 'primary' | 'dusk' | 'run' | 'danger'> = {
  needs_triage: 'dusk',
  triaging: 'primary',
  queued: 'neutral',
  waiting_window: 'dusk',
  blocked: 'danger',
  dispatched: 'run',
  done: 'run',
  merged: 'primary',
  failed: 'danger',
  stale: 'danger',
  cancelled: 'neutral',
};

/** Status with an emoji + label so state never relies on color alone. */
export function StatusChip({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={TONE[status]}>
      <span aria-hidden="true">{m.emoji}</span>
      {m.label}
    </Badge>
  );
}
