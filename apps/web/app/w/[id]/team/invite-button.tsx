'use client';

import { Check, Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { api } from '@/lib/client/api';

export function InviteButton({ workspaceId }: { workspaceId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (url) {
    return (
      <div className="flex items-center gap-2">
        <Input readOnly value={url} aria-label="Invite link" className="w-72" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="secondary"
          size="icon"
          aria-label="Copy invite link"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    );
  }
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          const r = await api<{ url: string }>(`/api/workspaces/${workspaceId}/invites`, { method: 'POST' });
          setUrl(r.url);
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <UserPlus /> Invite member
    </Button>
  );
}
