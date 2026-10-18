'use client';

import { Check, GitBranch, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { api } from '@/lib/client/api';
import type { BoardState } from '@/lib/client/types';

type Repo = { owner: string; name: string; fullName: string; private: boolean };

/** Install the GitHub App, pick one repository, create labels (owner only). */
export function RepoConnect({ board, owner, templateRepo }: { board: BoardState; owner: boolean; templateRepo: string | null }) {
  const qc = useQueryClient();
  const ws = board.workspace;
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['repos', ws.id],
    queryFn: () => api<{ repos: Repo[] }>(`/api/workspaces/${ws.id}/repos`),
    enabled: owner && ws.githubConnected,
  });

  async function install() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>(`/api/workspaces/${ws.id}/github/install-url`);
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const [found, setFound] = useState<{ id: number; account: string }[]>([]);
  async function detect(installationId?: number) {
    setBusy(true);
    try {
      const r = await api<{ linked: boolean; installations: { id: number; account: string }[] }>(`/api/workspaces/${ws.id}/github/detect`, { body: { installationId } });
      if (r.linked) {
        toast.success('GitHub App found and linked');
        await qc.invalidateQueries({ queryKey: ['board', ws.id] });
      } else {
        setFound(r.installations);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      const r = await api<{ repo: string; imported: number }>(`/api/workspaces/${ws.id}/repo`, { body: { fullName: pick } });
      toast.success(`Connected ${r.repo}`, { description: r.imported ? `${r.imported} existing relay issue(s) imported` : 'Labels are ready' });
      await qc.invalidateQueries({ queryKey: ['board', ws.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!owner) {
    return <p className="text-sm text-muted">{ws.repo ? `Connected to ${ws.repo}.` : 'The workspace owner connects the repository.'}</p>;
  }
  return (
    <div className="flex flex-col gap-3 text-sm">
      {ws.repo ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="run">
            <Check className="size-3" aria-hidden="true" /> Connected
          </Badge>
          <GitBranch className="size-4 text-muted" aria-hidden="true" />
          <a className="font-mono text-primary hover:underline" href={`https://github.com/${ws.repo}`} target="_blank" rel="noreferrer">
            {ws.repo}
          </a>
          <Button size="sm" variant="ghost" onClick={install} disabled={busy}>
            Change repositories on GitHub
          </Button>
        </div>
      ) : null}
      {!ws.githubConnected ? (
        <>
          <p className="text-muted">Relay needs the GitHub App on one repository. It opens issues, comments, and draft PRs as the Relay bot, and reads contents. Choose only the repository you want to use.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={install} disabled={busy}>
              Install Relay GitHub App
            </Button>
            <Button variant="ghost" onClick={() => detect()} disabled={busy}>
              I already installed it
            </Button>
            {templateRepo ? (
              <a className="text-primary underline" href={`https://github.com/${templateRepo}/generate`} target="_blank" rel="noreferrer">
                No project handy? Create a copy of the Relay demo repo
              </a>
            ) : null}
          </div>
          {found.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">Which installation?</span>
              {found.map((i) => (
                <Button key={i.id} size="sm" variant="ghost" onClick={() => detect(i.id)} disabled={busy}>
                  {i.account}
                </Button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Repository" className="max-w-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{ws.repo ? 'Switch repository…' : 'Choose a repository…'}</option>
            {data?.repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName}
                {r.private ? ' (private)' : ''}
              </option>
            ))}
          </Select>
          <Button onClick={connect} disabled={!pick || busy}>
            Connect
          </Button>
          <Button variant="ghost" size="icon" aria-label="Refresh repository list" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : ''} />
          </Button>
          {data && data.repos.length === 0 ? <span className="text-muted">No repositories yet: add one in the GitHub App settings.</span> : null}
        </div>
      )}
    </div>
  );
}
