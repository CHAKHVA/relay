'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, GitPullRequest, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { StatusChip } from '@/components/app/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/client/api';
import { relTime } from '@/lib/client/format';
import type { BoardEvent, BoardTask } from '@/lib/client/types';
import { useBoard, useRefreshBoard } from '@/lib/client/use-board';

type Detail = { task: Omit<BoardTask, 'result'> & { result?: { summary: string; commentMarkdown: string; notes: string; filesChanged: string[]; checkCommand: string; checkPassed: boolean | null } | null }; events: BoardEvent[] };

export function TaskDetail({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const qc = useQueryClient();
  const refreshBoard = useRefreshBoard(workspaceId);
  const { data: board } = useBoard(workspaceId);
  const { data, error } = useQuery({ queryKey: ['task', workspaceId, taskId], queryFn: () => api<Detail>(`/api/w/${workspaceId}/tasks/${taskId}`), refetchInterval: 5000 });
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <p className="text-sm text-danger" role="alert">{(error as Error).message}</p>;
  if (!data || !board) return <p className="text-sm text-muted" role="status">Loading…</p>;
  const { task, events } = data;
  const members = board.members;
  const requester = members.find((m) => m.id === task.requesterMemberId);
  const assignee = members.find((m) => m.id === task.assigneeMemberId);
  const meId = board.meMemberId;
  const name = (m?: (typeof members)[number]) => (m ? (m.simulated ? `${m.displayName} (Simulated)` : m.displayName) : '—');

  async function act(kind: 'run-now' | 'triage-now' | 'retry' | 'cancel') {
    if (kind === 'cancel' && !window.confirm('Cancel this task? The relay label is removed from the GitHub issue.')) return;
    setBusy(kind);
    try {
      await api(`/api/w/${workspaceId}/tasks/${taskId}/${kind}`, { method: 'POST' });
      await Promise.all([qc.invalidateQueries({ queryKey: ['task', workspaceId, taskId] }), refreshBoard()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const finished = ['done', 'merged', 'cancelled'].includes(task.status);
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/w/${workspaceId}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" /> Board
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">
            {task.id} · issue #{task.issueNumber} · {task.type}
          </p>
          <h1 className="font-display text-2xl font-semibold">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={task.status} />
            {task.shared ? <Badge tone="run">Shared run</Badge> : null}
            {task.statusReason ? <span className="text-sm text-muted">{task.statusReason}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {task.status === 'needs_triage' && !task.triageNow ? (
            <Button variant="secondary" disabled={busy !== null} onClick={() => act('triage-now')}>
              Triage now
            </Button>
          ) : null}
          {task.requesterMemberId === meId && ['queued', 'waiting_window', 'blocked', 'needs_triage'].includes(task.status) && !task.runNow ? (
            <Button disabled={busy !== null} onClick={() => act('run-now')}>
              <Play /> Run now
            </Button>
          ) : null}
          {task.status === 'failed' || task.status === 'stale' ? (
            <Button disabled={busy !== null} onClick={() => act('retry')}>
              Retry
            </Button>
          ) : null}
          {!finished ? (
            <Button variant="secondary" disabled={busy !== null} onClick={() => act('cancel')}>
              Cancel
            </Button>
          ) : null}
          {task.issueUrl ? (
            <Button variant="secondary" asChild>
              <a href={task.issueUrl} target="_blank" rel="noreferrer">
                Open issue <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader title="Description" />
            <div className="prose-relay px-4 py-3 text-sm">{task.body ? <Markdown remarkPlugins={[remarkGfm]}>{task.body}</Markdown> : <p className="text-muted">No description.</p>}</div>
          </Panel>
          {task.result ? (
            <Panel>
              <PanelHeader
                title="Result"
                description={task.result.summary}
                action={
                  task.resultPrUrl ? (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={task.resultPrUrl} target="_blank" rel="noreferrer">
                        <GitPullRequest /> Draft PR
                      </a>
                    </Button>
                  ) : task.resultCommentUrl ? (
                    <Button size="sm" variant="secondary" asChild>
                      <a href={task.resultCommentUrl} target="_blank" rel="noreferrer">
                        On GitHub <ExternalLink />
                      </a>
                    </Button>
                  ) : null
                }
              />
              <div className="prose-relay px-4 py-3 text-sm">
                {task.result.commentMarkdown ? <Markdown remarkPlugins={[remarkGfm]}>{task.result.commentMarkdown}</Markdown> : null}
                {task.result.filesChanged?.length ? (
                  <p>
                    Files changed: {task.result.filesChanged.map((f) => <code key={f} className="mr-1">{f}</code>)}
                  </p>
                ) : null}
                {task.result.checkCommand ? (
                  <p>
                    Check <code>{task.result.checkCommand}</code>: {task.result.checkPassed === true ? 'passed' : task.result.checkPassed === false ? 'failed' : 'not reported'}
                  </p>
                ) : null}
                {task.result.notes ? <p className="text-muted">{task.result.notes}</p> : null}
              </div>
            </Panel>
          ) : null}
          <Panel>
            <PanelHeader title="Timeline" />
            <ol className="divide-y divide-line">
              {events.length === 0 ? <li className="p-4 text-sm text-muted">No events yet.</li> : null}
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>{e.message}</span>
                  <time className="shrink-0 text-xs text-muted" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString()}>
                    {relTime(e.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <aside className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Details" />
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 px-4 py-3 text-sm">
              <dt className="text-muted">Requester</dt>
              <dd>{name(requester)}</dd>
              <dt className="text-muted">Seat</dt>
              <dd>{assignee ? `${name(assignee)}${task.shared ? ' (shared)' : ''}` : '—'}</dd>
              <dt className="text-muted">Priority</dt>
              <dd className="capitalize">{task.priority}</dd>
              <dt className="text-muted">Size</dt>
              <dd>{task.size ?? 'Not set'}</dd>
              <dt className="text-muted">Window</dt>
              <dd>{task.windowKind ? task.windowKind.replace('_', '-') : '—'}</dd>
              <dt className="text-muted">Est. cost</dt>
              <dd>{task.costPct ? `${task.costPct}% of a 5-hour window (est.)` : '—'}</dd>
              <dt className="text-muted">Done check</dt>
              <dd className="font-mono text-xs">{task.doneCheck ?? '—'}</dd>
              <dt className="text-muted">Branch</dt>
              <dd className="break-all font-mono text-xs">{task.branch ?? '—'}</dd>
              {task.targetPrNumber ? (
                <>
                  <dt className="text-muted">Target PR</dt>
                  <dd>#{task.targetPrNumber}</dd>
                </>
              ) : null}
              <dt className="text-muted">Session</dt>
              <dd>
                {task.sessionUrl ? (
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={task.sessionUrl} target="_blank" rel="noreferrer">
                    Open <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </dl>
          </Panel>
          <Panel>
            <PanelHeader title="Likely files" />
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {task.likelyFiles.length ? task.likelyFiles.map((f) => <code key={f} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{f}</code>) : <span className="text-sm text-muted">None listed.</span>}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
