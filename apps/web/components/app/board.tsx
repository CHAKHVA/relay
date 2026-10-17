'use client';

import { isActiveClaim } from '@relay/core';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { relTime } from '@/lib/client/format';
import type { BoardState, BoardTask } from '@/lib/client/types';
import { useBoard, useRefreshBoard } from '@/lib/client/use-board';
import { NEW_TASK_EVENT } from './header-tools';
import { SeatCard } from './seat-card';
import { TaskCard } from './task-card';

function StatTile({ label, value, hint, est }: { label: string; value: string; hint?: string; est?: boolean }) {
  return (
    <div className="min-w-0 flex-1 basis-40 rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
        {est ? <span className="text-xs text-muted">est.</span> : null}
      </div>
      {hint ? <div className="truncate text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}

function StatsStrip({ stats }: { stats: BoardState['stats'] }) {
  return (
    <section aria-label="Stats" className="flex flex-wrap gap-3">
      <StatTile label="Off-hours runs" value={String(stats.tasksOffHours)} />
      <StatTile label="Before-reset runs" value={String(stats.tasksBeforeReset)} />
      <StatTile label="Shared runs" value={String(stats.tasksShared)} hint={stats.tasksManual ? `+${stats.tasksManual} run on demand` : undefined} />
      <StatTile label="Quota that would have expired" value={`${Math.round(stats.estQuotaUsedPct)}%`} est hint="of 5-hour windows" />
      <StatTile label="Credits avoided" value={`$${stats.estCreditsAvoidedUsd.toFixed(2)}`} est hint="shared runs for requesters at their limit" />
    </section>
  );
}

const GROUPS: { key: string; title: string; match: (t: BoardTask) => boolean }[] = [
  { key: 'running', title: 'Running', match: (t) => t.status === 'dispatched' || t.status === 'triaging' },
  { key: 'waiting', title: 'Waiting', match: (t) => ['queued', 'waiting_window', 'blocked'].includes(t.status) },
  { key: 'triage', title: 'Needs triage', match: (t) => t.status === 'needs_triage' },
  { key: 'failed', title: 'Failed', match: (t) => t.status === 'failed' || t.status === 'stale' },
  { key: 'done', title: 'Done today', match: (t) => (t.status === 'done' || t.status === 'merged') },
];

export function Board({ workspaceId }: { workspaceId: string }) {
  const { data: board, error, isPending } = useBoard(workspaceId);
  const refresh = useRefreshBoard(workspaceId);
  if (isPending) return <p className="text-sm text-muted" role="status">Loading board…</p>;
  if (error || !board) return <p className="text-sm text-danger" role="alert">Could not load the board. {(error as Error | undefined)?.message}</p>;

  const me = board.members.find((m) => m.id === board.meMemberId);
  const owner = me?.role === 'owner';
  const now = new Date(board.now).getTime();
  const dayAgo = now - 24 * 3600_000;
  const visible = board.tasks.filter((t) => t.status !== 'cancelled');
  const byGroup = GROUPS.map((g) => ({
    ...g,
    tasks: visible
      .filter(g.match)
      .filter((t) => (g.key === 'done' ? new Date(t.completedAt ?? t.updatedAt).getTime() > dayAgo : true))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  }));
  const claims = board.tasks.filter((t) => isActiveClaim({ status: t.status, runKind: t.runKind, type: t.type }));
  const blocked = board.tasks.filter((t) => t.status === 'blocked');
  const noRepo = !board.workspace.repo || !board.workspace.githubConnected;

  return (
    <div className="flex flex-col gap-5">
      {noRepo ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dusk/40 bg-dusk-soft px-4 py-3 text-sm text-dusk-ink" role="status">
          <span>Connect a repository to start creating tasks.</span>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/w/${workspaceId}/start`}>Open getting started</Link>
          </Button>
        </div>
      ) : null}
      <StatsStrip stats={board.stats} />
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <section aria-label="Seats" className="flex flex-col gap-3">
          <h2 className="font-display text-base font-semibold">Seats</h2>
          {board.members.map((m) => (
            <SeatCard key={m.id} member={m} isMe={m.id === board.meMemberId} canSlide={m.id === board.meMemberId || (m.simulated && owner === true)} workspaceId={workspaceId} onChanged={refresh} />
          ))}
        </section>

        <section aria-label="Queue" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Queue</h2>
            <span className="text-xs text-muted">{visible.length} tasks</span>
          </div>
          {visible.length === 0 ? (
            <Panel className="px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold">No tasks yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Create a task, or label any GitHub issue <code className="font-mono">relay</code>. Relay runs it in your next window.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => window.dispatchEvent(new Event(NEW_TASK_EVENT))} disabled={noRepo}>
                  <Plus /> New task
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/w/${workspaceId}/start`}>Getting started</Link>
                </Button>
              </div>
            </Panel>
          ) : null}
          {byGroup
            .filter((g) => g.tasks.length)
            .map((g) => (
              <div key={g.key} className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
                  {g.title} <Badge>{g.tasks.length}</Badge>
                </h3>
                {g.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} members={board.members} meId={board.meMemberId} workspaceId={workspaceId} onChanged={refresh} />
                ))}
              </div>
            ))}
        </section>

        <aside aria-label="Ledger and activity" className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Change ledger" description="Files agents are working on right now." />
            <div className="p-3 text-sm">
              {claims.length === 0 ? <p className="text-muted">No active claims.</p> : null}
              <ul className="flex flex-col gap-2">
                {claims.map((t) => (
                  <li key={t.id}>
                    <span className="font-mono text-xs">{t.id}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {t.likelyFiles.map((f) => (
                        <code key={f} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                          {f}
                        </code>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {blocked.length ? (
                <>
                  <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Blocked</h3>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {blocked.map((t) => (
                      <li key={t.id} className="text-xs">
                        <span className="font-mono">{t.id}</span> waits on <span className="font-mono">{t.blockedByTaskId}</span> ·{' '}
                        {(t.blockedOnFiles ?? []).join(', ')}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Activity" />
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto" aria-live="polite">
              {board.events.length === 0 ? <li className="p-3 text-sm text-muted">Nothing yet.</li> : null}
              {board.events.slice(0, 25).map((e) => (
                <li key={e.id} className="px-3 py-2 text-xs">
                  <div className="text-ink">{e.message}</div>
                  <div className="text-faint">{relTime(e.createdAt, now)}</div>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
