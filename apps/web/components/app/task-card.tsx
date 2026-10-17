'use client';

import { ArrowDown, ArrowUp, Briefcase, Code, ExternalLink, FileText, GitPullRequest, Play, SearchCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/client/api';
import type { BoardMember, BoardTask } from '@/lib/client/types';
import { StatusChip } from './status-chip';

const TYPE_ICON = { code: Code, review: SearchCheck, docs: FileText, business: Briefcase } as const;

function who(m: BoardMember | undefined) {
  if (!m) return 'someone';
  return m.simulated ? `${m.displayName} (Simulated)` : m.displayName;
}

export function TaskCard({ task, members, meId, workspaceId, onChanged }: { task: BoardTask; members: BoardMember[]; meId: string; workspaceId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const Icon = TYPE_ICON[task.type];
  const requester = members.find((m) => m.id === task.requesterMemberId);
  const assignee = members.find((m) => m.id === task.assigneeMemberId);
  const active = task.status === 'dispatched' || task.status === 'triaging';
  const canRunNow = task.requesterMemberId === meId && ['queued', 'waiting_window', 'blocked', 'needs_triage'].includes(task.status) && !task.runNow;
  const canTriageNow = task.status === 'needs_triage' && !task.triageNow;

  async function act(kind: 'run-now' | 'triage-now') {
    setBusy(kind);
    try {
      await api(`/api/w/${workspaceId}/tasks/${task.id}/${kind}`, { method: 'POST' });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-lg border border-line bg-surface p-3" aria-label={`Task ${task.id}: ${task.title}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-label={task.type} />
        <div className="min-w-0 flex-1">
          <Link href={`/w/${workspaceId}/tasks/${task.id}`} className="block text-sm font-medium leading-snug hover:underline">
            {task.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="font-mono">{task.id}</span>
            <span>#{task.issueNumber}</span>
            {task.priority === 'high' ? (
              <span className="inline-flex items-center gap-0.5 font-medium text-dusk-ink">
                <ArrowUp className="size-3" aria-hidden="true" /> High
              </span>
            ) : task.priority === 'low' ? (
              <span className="inline-flex items-center gap-0.5">
                <ArrowDown className="size-3" aria-hidden="true" /> Low
              </span>
            ) : null}
            {task.size ? <span>Size {task.size}</span> : null}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusChip status={task.status} />
        {assignee ? (
          <span className="text-xs text-muted">
            {who(requester)} → <span className="font-medium text-ink">{assignee.id === requester?.id ? 'own seat' : `${assignee.displayName}’s seat`}</span>
          </span>
        ) : (
          <span className="text-xs text-muted">{who(requester)}</span>
        )}
        {task.shared && active ? <Badge tone="run">Shared</Badge> : null}
      </div>
      {task.statusReason ? <p className="mt-1.5 text-xs text-muted">{task.statusReason}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {task.sessionUrl ? (
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href={task.sessionUrl} target="_blank" rel="noreferrer">
            Session <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
        {task.resultPrUrl ? (
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href={task.resultPrUrl} target="_blank" rel="noreferrer">
            <GitPullRequest className="size-3" aria-hidden="true" /> PR
          </a>
        ) : null}
        {task.resultCommentUrl ? (
          <a className="inline-flex items-center gap-1 text-primary hover:underline" href={task.resultCommentUrl} target="_blank" rel="noreferrer">
            Result <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
        {task.issueUrl ? (
          <a className="inline-flex items-center gap-1 text-muted hover:underline" href={task.issueUrl} target="_blank" rel="noreferrer">
            Issue <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
        <span className="ml-auto flex gap-1.5">
          {canTriageNow ? (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act('triage-now')}>
              Triage now
            </Button>
          ) : null}
          {canRunNow ? (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => act('run-now')}>
              <Play /> Run now
            </Button>
          ) : null}
        </span>
      </div>
    </article>
  );
}
