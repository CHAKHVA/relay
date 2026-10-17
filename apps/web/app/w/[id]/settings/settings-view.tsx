'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RepoConnect } from '@/components/app/repo-connect';
import { SeatSection, useSeatMutation } from '@/components/app/seat-forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client/api';
import { useBoard } from '@/lib/client/use-board';
import { useQueryClient } from '@tanstack/react-query';

function Row({ title, children, action }: { title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 max-w-prose text-sm text-muted">{children}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function SettingsView({ workspaceId, templateRepo }: { workspaceId: string; templateRepo: string | null }) {
  const { data: board } = useBoard(workspaceId);
  const qc = useQueryClient();
  const mutate = useSeatMutation(workspaceId);
  const [busy, setBusy] = useState<string | null>(null);
  if (!board) return <p className="text-sm text-muted" role="status">Loading…</p>;
  const ws = board.workspace;

  async function setting(body: Record<string, unknown>, ok?: string) {
    setBusy('setting');
    try {
      await api(`/api/workspaces/${workspaceId}/settings`, { method: 'PATCH', body });
      await qc.invalidateQueries({ queryKey: ['board', workspaceId] });
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function demo(path: string, ok: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(path);
    await mutate(`/demo/${path}`, { method: 'POST' }, ok);
    setBusy(null);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold">Settings</h1>
      <SeatSection title="Repository" description="The one repository whose issues become Relay tasks.">
        <div className="p-4">
          <RepoConnect board={board} owner templateRepo={templateRepo} />
        </div>
      </SeatSection>
      <SeatSection title="Modes">
        <div className="divide-y divide-line">
          <Row
            title="Dry run"
            action={
              <Button variant={ws.dryRun ? 'primary' : 'secondary'} size="sm" disabled={busy !== null} onClick={() => setting({ dryRun: !ws.dryRun }, ws.dryRun ? 'Dry run off: routines will really be fired' : 'Dry run on')}>
                {ws.dryRun ? 'On' : 'Off'}
              </Button>
            }
          >
            Simulates runs without firing any routine. GitHub comments are still written; pull requests are replaced by a note. Good for trying things out without spending quota.
          </Row>
          <Row
            title="Demo mode"
            action={
              <Button variant={ws.demoMode ? 'primary' : 'secondary'} size="sm" disabled={busy !== null} onClick={() => setting({ demoMode: !ws.demoMode }, ws.demoMode ? 'Demo mode off' : 'Demo mode on')}>
                {ws.demoMode ? 'On' : 'Off'}
              </Button>
            }
          >
            Adds simulated teammates (always labeled Simulated; they never run tasks), a demo clock, and lets you create tasks as any member.
          </Row>
        </div>
      </SeatSection>
      {ws.demoMode ? (
        <SeatSection title="Demo tools" description="For recording a demo or exploring sharing.">
          <div className="divide-y divide-line">
            <Row title="Demo team" action={<Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => demo('load-team', 'Demo team loaded')}>Load demo team</Button>}>
              Adds <b>Ana</b> (Simulated, 96% used, not sharing) and <b>Luka</b> (Simulated, 40% used, sharing), and turns on sharing for you.
            </Row>
            <Row title="Demo clock" action={<Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => demo('jump-window', 'Clock moved into your next window')}>Jump to next window</Button>}>
              {ws.clockOffsetMinutes ? (
                <>
                  Clock is <b>{Math.round(ws.clockOffsetMinutes / 60)} h</b> ahead of real time ({new Date(board.now).toISOString().slice(0, 16).replace('T', ' ')} UTC).{' '}
                  <button type="button" className="text-primary underline" onClick={() => setting({ clockOffsetMinutes: 0 }, 'Clock reset')}>
                    Reset to real time
                  </button>
                </>
              ) : (
                'Skip ahead to the start of your next run window to see queued tasks dispatch.'
              )}
            </Row>
            <Row title="Reset demo data" action={<Button size="sm" variant="danger" disabled={busy !== null} onClick={() => demo('reset', 'Demo data reset', 'Delete all Relay tasks, events and stats for this workspace? GitHub issues and history are not touched.')}>Reset</Button>}>
              Clears tasks, events, stats and the clock in Relay. GitHub history stays as it is.
            </Row>
          </div>
        </SeatSection>
      ) : null}
      <SeatSection title="Scheduler">
        <Row
          title="Run a tick now"
          action={
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('tick');
                const r = await mutate<{ ran: boolean; summary: { dispatched: number; waiting: number; blocked: number; reconciled: number } | null }>('/tick', { method: 'POST' });
                setBusy(null);
                if (r) toast.success(r.ran && r.summary ? `Dispatched ${r.summary.dispatched}, waiting ${r.summary.waiting}, blocked ${r.summary.blocked}` : 'Another tick is already running');
              }}
            >
              Run tick
            </Button>
          }
        >
          Relay checks for work every 5 minutes and whenever GitHub sends an event. Use this to force a check. <Badge className="ml-1">debug</Badge>
        </Row>
      </SeatSection>
    </div>
  );
}
