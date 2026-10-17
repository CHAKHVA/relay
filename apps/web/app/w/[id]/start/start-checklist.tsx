'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RepoConnect } from '@/components/app/repo-connect';
import { RoutineWizard, UsageSetup, WindowsForm, useMe, useSeatMutation } from '@/components/app/seat-forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { useBoard } from '@/lib/client/use-board';
import type { OnboardingStep } from '@/lib/services/onboarding';

function StatusIcon({ s }: { s: OnboardingStep['status'] }) {
  if (s === 'done') return <span className="grid size-6 place-items-center rounded-full bg-run text-white"><Check className="size-4" aria-label="Done" /></span>;
  if (s === 'warn') return <span className="grid size-6 place-items-center rounded-full bg-dusk text-white"><AlertTriangle className="size-3.5" aria-label="Needs attention" /></span>;
  return <span className="grid size-6 place-items-center rounded-full border-2 border-line-strong text-faint"><Circle className="size-2.5" aria-label="To do" /></span>;
}

export function StartChecklist({ workspaceId, owner, prompt, templateRepo }: { workspaceId: string; owner: boolean; prompt: string; templateRepo: string | null }) {
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data: board } = useBoard(workspaceId);
  const me = useMe(board);
  const mutate = useSeatMutation(workspaceId);
  const { data } = useQuery({ queryKey: ['onboarding', workspaceId], queryFn: () => api<{ steps: OnboardingStep[]; complete: boolean }>(`/api/w/${workspaceId}/onboarding`), refetchInterval: 6000 });
  const [picked, setOpen] = useState<string | null | undefined>(undefined);
  const [sample, setSample] = useState<{ id: string; issueUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const toasted = useRef(false);

  useEffect(() => {
    if (toasted.current) return;
    toasted.current = true;
    if (params.get('installed')) toast.success('GitHub App installed. Now choose a repository.');
    const err = params.get('error');
    if (err) toast.error(err);
  }, [params]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['onboarding', workspaceId] });

  const open = picked === undefined ? (data?.steps.find((s) => s.status === 'todo' && !s.optional)?.key ?? null) : picked;
  if (!data || !board || !me) return <p className="text-sm text-muted" role="status">Loading…</p>;
  const done = data.steps.filter((s) => s.status === 'done').length;

  async function createSample() {
    setBusy(true);
    try {
      const r = await api<{ task: { id: string; issueUrl: string | null } }>(`/api/w/${workspaceId}/sample-task`, { method: 'POST' });
      setSample({ id: r.task.id, issueUrl: r.task.issueUrl });
      toast.success('Sample task created');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function body(step: OnboardingStep) {
    switch (step.key) {
      case 'repo':
        return <RepoConnect board={board!} owner={owner} templateRepo={templateRepo} />;
      case 'routine':
        return <div className="-m-4"><RoutineWizard me={me!} workspaceId={workspaceId} repo={board!.workspace.repo} prompt={prompt} dryRun={board!.workspace.dryRun} /></div>;
      case 'windows':
        return <div className="-m-4"><WindowsForm key={me!.timezone + me!.offHoursStart + me!.offHoursEnd} me={me!} workspaceId={workspaceId} /></div>;
      case 'usage':
        return <div className="-m-4"><UsageSetup me={me!} workspaceId={workspaceId} /></div>;
      case 'try':
        return (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted">Creates a small, safe task in your repository, then runs it on your seat right away instead of waiting for tonight.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={createSample} disabled={busy || !board!.workspace.repo}>
                Create a sample task
              </Button>
              {sample ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await api(`/api/w/${workspaceId}/tasks/${sample.id}/run-now`, { method: 'POST' }).then(
                      () => toast.success('Running on your seat now'),
                      (e: Error) => toast.error(e.message),
                    );
                    await refresh();
                  }}
                >
                  Run now
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => mutate('/me/test-window', { body: { minutes: 60 } }, 'Run window open for 60 minutes')}>
                Open a 60-min test window
              </Button>
              <Button variant="ghost" asChild>
                <Link href={`/w/${workspaceId}`}>Go to the board</Link>
              </Button>
            </div>
            {board!.workspace.dryRun ? <p className="text-dusk-ink">Dry run is on: runs are simulated and finish in about 20 seconds.</p> : null}
          </div>
        );
      case 'sharing':
        return (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted">Sharing lets teammates’ tasks run on your idle seat. Demo mode adds simulated teammates (always labeled Simulated) so you can see it without a team.</p>
            {owner ? (
              <Button
                className="w-fit"
                variant="secondary"
                onClick={async () => {
                  await api(`/api/workspaces/${workspaceId}/settings`, { method: 'PATCH', body: { demoMode: true } }).then(
                    async () => {
                      await mutate('/demo/load-team', { method: 'POST' }, 'Demo team loaded');
                      await refresh();
                    },
                    (e: Error) => toast.error(e.message),
                  );
                }}
              >
                Turn on demo mode and load the demo team
              </Button>
            ) : null}
          </div>
        );
      default:
        return <p className="text-sm text-muted">{step.detail}</p>;
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Getting started</h1>
        <p className="mt-1 text-sm text-muted">
          {data.complete ? 'You’re set up. Create tasks from the board, or label any GitHub issue “relay”.' : 'About five minutes. Each step is one click or paste.'} <span className="tabular-nums">({done}/{data.steps.length})</span>
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {data.steps.map((s, i) => {
          const expanded = open === s.key;
          return (
            <li key={s.key}>
              <Panel className={cn(expanded && 'ring-1 ring-primary/40')}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.key)}>
                  <StatusIcon s={s.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {i + 1}. {s.title} {s.optional ? <Badge className="ml-1">optional</Badge> : null}
                    </span>
                    <span className="block truncate text-xs text-muted">{s.detail}</span>
                  </span>
                </button>
                {expanded ? <div className="border-t border-line p-4">{body(s)}</div> : null}
              </Panel>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
