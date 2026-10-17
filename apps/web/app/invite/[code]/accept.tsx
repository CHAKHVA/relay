'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, detectTimeZone } from '@/lib/client/api';

export function AcceptInvite({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await api<{ workspaceId: string }>(`/api/invites/${code}/accept`, { body: { timezone: detectTimeZone() } });
          router.push(`/w/${r.workspaceId}/start`);
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {busy ? 'Joining…' : 'Join workspace'}
    </Button>
  );
}
