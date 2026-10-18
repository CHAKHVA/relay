'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CRON_PRESETS } from '@relay/core';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, detectTimeZone } from '@/lib/client/api';
import { dayClock, relTime } from '@/lib/client/format';
import type { Serialized } from '@/lib/client/types';
import type { RecurringTask } from '@/lib/db/schema';
import { useBoard } from '@/lib/client/use-board';

type Row = Serialized<RecurringTask>;

function Form({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [f, setF] = useState({ title: '', description: '', type: 'docs', files: '', doneCheck: '', size: '', priority: 'normal', preset: String(CRON_PRESETS[0].cron), custom: '', timezone: detectTimeZone() });
  const [busy, setBusy] = useState(false);
  const cron = f.preset === 'custom' ? f.custom : f.preset;
  return (
    <form
      className="grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/w/${workspaceId}/recurring`, {
            body: { title: f.title, description: f.description, type: f.type, likelyFiles: f.files.split(/[\s,]+/).filter(Boolean), doneCheck: f.doneCheck || null, size: f.size || null, priority: f.priority, cron, timezone: f.timezone },
          });
          toast.success('Recurring task saved');
          onDone();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Title" htmlFor="rc-title" className="sm:col-span-2">
        <Input id="rc-title" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Weekly dependency audit" />
      </Field>
      <Field label="Description" htmlFor="rc-desc" className="sm:col-span-2">
        <Textarea id="rc-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <Field label="Type" htmlFor="rc-type">
        <Select id="rc-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          <option value="code">Code</option>
          <option value="docs">Docs</option>
          <option value="business">Business</option>
        </Select>
      </Field>
      <Field label="Priority" htmlFor="rc-prio">
        <Select id="rc-prio" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </Select>
      </Field>
      <Field label="Likely files" htmlFor="rc-files" hint="Space or comma separated. Optional.">
        <Input id="rc-files" value={f.files} onChange={(e) => setF({ ...f, files: e.target.value })} className="font-mono" />
      </Field>
      {f.type === 'code' ? (
        <Field label="Done check" htmlFor="rc-check">
          <Input id="rc-check" value={f.doneCheck} onChange={(e) => setF({ ...f, doneCheck: e.target.value })} className="font-mono" placeholder="pnpm test" />
        </Field>
      ) : (
        <Field label="Size" htmlFor="rc-size">
          <Select id="rc-size" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })}>
            <option value="">Let the agent estimate</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </Select>
        </Field>
      )}
      <Field label="Schedule" htmlFor="rc-sched">
        <Select id="rc-sched" value={f.preset} onChange={(e) => setF({ ...f, preset: e.target.value })}>
          {CRON_PRESETS.map((p) => (
            <option key={p.cron} value={p.cron}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom (cron)…</option>
        </Select>
      </Field>
      <Field label="Time zone" htmlFor="rc-tz">
        <Input id="rc-tz" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} />
      </Field>
      {f.preset === 'custom' ? (
        <Field label="Cron expression" htmlFor="rc-cron" hint="Five fields: minute hour day-of-month month day-of-week." className="sm:col-span-2">
          <Input id="rc-cron" required value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} className="font-mono" placeholder="*/30 * * * *" />
        </Field>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={busy || !f.title.trim()}>
          Save recurring task
        </Button>
      </div>
    </form>
  );
}

export function RecurringView({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data: board } = useBoard(workspaceId);
  const { data } = useQuery({ queryKey: ['recurring', workspaceId], queryFn: () => api<{ recurring: Row[] }>(`/api/w/${workspaceId}/recurring`), refetchInterval: 15_000 });
  const [adding, setAdding] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['recurring', workspaceId] });
  const me = board?.members.find((m) => m.id === board.meMemberId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Recurring tasks</h1>
          <p className="mt-1 text-sm text-muted">A template opens a fresh GitHub issue on its schedule. It then runs like any other task, in your next window.</p>
        </div>
        <Button onClick={() => setAdding((a) => !a)}>
          <Plus /> New recurring task
        </Button>
      </div>
      {adding ? (
        <Panel>
          <PanelHeader title="New recurring task" />
          <Form
            workspaceId={workspaceId}
            onDone={() => {
              setAdding(false);
              refresh();
            }}
          />
        </Panel>
      ) : null}
      <Panel>
        <ul className="divide-y divide-line">
          {data && data.recurring.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">No recurring tasks yet. A “Weekly dependency audit” is a good first one.</li> : null}
          {data?.recurring.map((t) => {
            const canEdit = t.creatorMemberId === me?.id || me?.role === 'owner';
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.title}</span>
                    <Badge>{t.type}</Badge>
                    {!t.enabled ? <Badge tone="dusk">Paused</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    <code className="font-mono">{t.cron}</code> · {t.timezone} · {t.enabled ? `next ${dayClock(t.nextRunAt, t.timezone)} (${relTime(t.nextRunAt)})` : 'not scheduled'}
                    {t.lastRunAt ? ` · last ${relTime(t.lastRunAt)}` : ''}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await api(`/api/w/${workspaceId}/recurring/${t.id}`, { method: 'PATCH', body: { enabled: !t.enabled } }).catch((e: Error) => toast.error(e.message));
                        refresh();
                      }}
                    >
                      {t.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${t.title}`}
                      onClick={async () => {
                        if (!window.confirm(`Delete “${t.title}”? Issues it already created stay.`)) return;
                        await api(`/api/w/${workspaceId}/recurring/${t.id}`, { method: 'DELETE' }).catch((e: Error) => toast.error(e.message));
                        refresh();
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
