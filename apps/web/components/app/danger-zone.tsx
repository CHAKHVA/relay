'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/client/api';

export function DeleteWorkspace({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete workspace
      </Button>
    );
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/api/workspaces/${workspaceId}`, { method: 'DELETE', body: { confirmName: confirm } });
          toast.success('Workspace deleted');
          router.push('/onboarding');
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label={`Type “${name}” to confirm`} htmlFor="del-ws" hint="Deletes all Relay data for this workspace: tasks, events, members, credentials. GitHub issues and PRs stay.">
        <Input id="del-ws" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={busy || confirm.trim() !== name}>
          Delete forever
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm('Delete your Relay account? This removes your memberships, usage tokens and routine credentials. It cannot be undone.')) return;
        setBusy(true);
        try {
          await api('/api/me/account', { method: 'DELETE' });
          router.push('/');
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      Delete my account
    </Button>
  );
}
