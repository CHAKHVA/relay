'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { api, detectTimeZone } from '@/lib/client/api';

function inviteCodeFrom(value: string): string | null {
  const v = value.trim();
  const m = /\/invite\/([A-Za-z0-9_-]+)/.exec(v);
  if (m) return m[1] ?? null;
  return /^[A-Za-z0-9_-]{6,}$/.test(v) ? v : null;
}

export function OnboardingForms() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy('create');
    try {
      const r = await api<{ workspace: { id: string } }>('/api/workspaces', { body: { name, timezone: detectTimeZone() } });
      router.push(`/w/${r.workspace.id}/start`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCodeFrom(invite);
    if (!code) {
      toast.error('Paste the full invite link, for example https://…/invite/abc123');
      return;
    }
    setBusy('join');
    try {
      const r = await api<{ workspaceId: string }>(`/api/invites/${code}/accept`, { body: { timezone: detectTimeZone() } });
      router.push(`/w/${r.workspaceId}/start`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="p-5">
        <form onSubmit={create} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Create a workspace</h2>
          <Field label="Workspace name" htmlFor="ws-name" hint="Usually your team or project name.">
            <Input id="ws-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments team" />
          </Field>
          <Button type="submit" disabled={!name.trim() || busy !== null}>
            {busy === 'create' ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
      </Panel>
      <Panel className="p-5">
        <form onSubmit={join} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Join with an invite</h2>
          <Field label="Invite link" htmlFor="invite" hint="Your workspace owner can create one on the Team page.">
            <Input id="invite" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="https://…/invite/…" />
          </Field>
          <Button type="submit" variant="secondary" disabled={!invite.trim() || busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join workspace'}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
