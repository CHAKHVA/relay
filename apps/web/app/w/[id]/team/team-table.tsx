'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/client/api';
import { dayClock } from '@/lib/client/format';
import { useBoard, useRefreshBoard } from '@/lib/client/use-board';
import { InviteButton } from './invite-button';

function AddSimulated({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pct, setPct] = useState(50);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add simulated member
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/w/${workspaceId}/simulated-members`, { body: { displayName: name, usedPct5h: pct, sharingEnabled: false } });
          setName('');
          setOpen(false);
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <Field label="Name" htmlFor="sim-name">
        <Input id="sim-name" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
      </Field>
      <Field label="Used (%)" htmlFor="sim-pct">
        <Input id="sim-pct" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-24" />
      </Field>
      <Button type="submit">Add</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

export function TeamTable({ workspaceId }: { workspaceId: string }) {
  const { data: board } = useBoard(workspaceId);
  const refresh = useRefreshBoard(workspaceId);
  if (!board) return <p className="text-sm text-muted" role="status">Loading…</p>;
  const owner = board.members.find((m) => m.id === board.meMemberId)?.role === 'owner';
  return (
    <Panel>
      <PanelHeader
        title="Team"
        description="Each member runs tasks on their own Claude seat. Sharing is opt-in per member."
        action={
          owner ? (
            <div className="flex flex-wrap items-end justify-end gap-2">
              {board.workspace.demoMode ? <AddSimulated workspaceId={workspaceId} onDone={refresh} /> : null}
              <InviteButton workspaceId={workspaceId} />
            </div>
          ) : null
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              {['Name', 'Role', 'Time zone', 'Windows', 'Sharing', 'Routine', 'Usage (5h)', 'Next window'].map((h) => (
                <th key={h} scope="col" className="px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.displayName}</span>
                    {m.githubLogin ? <span className="text-muted">@{m.githubLogin}</span> : null}
                    {m.simulated ? <Badge tone="dusk" title="Not a real seat; never runs tasks">Simulated</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">{m.role === 'owner' ? 'Owner' : 'Member'}</td>
                <td className="px-4 py-2.5">{m.timezone}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {m.offHoursStart}–{m.offHoursEnd} · {m.beforeResetMinutes} min before reset
                </td>
                <td className="px-4 py-2.5">
                  {m.paused ? <Badge tone="danger">Paused</Badge> : m.sharingEnabled ? <Badge tone="run">On</Badge> : <span className="text-muted">Off</span>}
                </td>
                <td className="px-4 py-2.5">{m.routineConfigured ? <Badge tone="run">Configured</Badge> : m.simulated ? '—' : <Badge tone="dusk">Not set up</Badge>}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {m.usedPct5h == null ? <span className="text-muted">unknown</span> : `${Math.round(m.estimate.usedPct5h)}%`}{' '}
                  <span className="text-xs text-muted">{m.usageSource === 'simulated' ? 'simulated' : m.usageSource === 'manual' ? 'manual' : m.estimate.confidence}</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{m.activeWindow ? <Badge tone="run">Now</Badge> : m.nextWindowAt ? dayClock(m.nextWindowAt, m.timezone) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
