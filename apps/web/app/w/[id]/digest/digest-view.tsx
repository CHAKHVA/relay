'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api } from '@/lib/client/api';

type Digest = { id: string; date: string; markdown: string; commentUrl: string | null };

export function DigestView({ workspaceId }: { workspaceId: string }) {
  const { data, error } = useQuery({ queryKey: ['digests', workspaceId], queryFn: () => api<{ digests: Digest[] }>(`/api/w/${workspaceId}/digests`) });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Digest</h1>
        <p className="mt-1 text-sm text-muted">Each morning, right after your off-hours end, Relay summarizes what ran on your seat, what is ready for you, and what needs attention. It is also posted on your digest issue on GitHub.</p>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{(error as Error).message}</p> : null}
      {data && data.digests.length === 0 ? (
        <Panel className="px-6 py-10 text-center text-sm text-muted">No digests yet. The first one arrives the morning after something runs.</Panel>
      ) : null}
      {data?.digests.map((d) => (
        <Panel key={d.id}>
          <PanelHeader
            title={new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            action={
              d.commentUrl ? (
                <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={d.commentUrl} target="_blank" rel="noreferrer">
                  On GitHub <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null
            }
          />
          <div className="prose-relay px-4 py-3 text-sm">
            <Markdown remarkPlugins={[remarkGfm]}>{d.markdown}</Markdown>
          </div>
        </Panel>
      ))}
    </div>
  );
}
