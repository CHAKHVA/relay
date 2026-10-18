'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { toast } from 'sonner';
import { api } from '@/lib/client/api';
import type { BoardState } from '@/lib/client/types';
import { useRefreshBoard } from '@/lib/client/use-board';
import { NEW_TASK_EVENT } from './header-tools';

/** ⌘K / Ctrl+K palette: new task, test window, pause, sharing, navigation (SPEC §13.2). */
export function CommandPalette({ board }: { board: BoardState }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const refresh = useRefreshBoard(board.workspace.id);
  const wsId = board.workspace.id;
  const me = board.members.find((m) => m.id === board.meMemberId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setOpen(false);
    try {
      await fn();
      await refresh();
      toast.success(label);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const go = (path: string) => () => {
    setOpen(false);
    router.push(`/w/${wsId}${path}`);
  };
  const windowOpen = me?.testWindowUntil ? new Date(me.testWindowUntil).getTime() > new Date(board.now).getTime() : false;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-50 w-[min(560px,94vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-xl" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop>
            <Command.Input autoFocus placeholder="Type a command…" className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none" />
            <Command.List className="max-h-80 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No matching command.</Command.Empty>
              <Command.Group heading="Actions" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                <Item onSelect={() => { setOpen(false); window.dispatchEvent(new Event(NEW_TASK_EVENT)); }} hint="N">New task</Item>
                {windowOpen ? (
                  <Item onSelect={() => run('Test window closed', () => api(`/api/w/${wsId}/me/test-window`, { method: 'DELETE' }))}>Close my test window</Item>
                ) : (
                  <Item onSelect={() => run('Run window open for 60 minutes', () => api(`/api/w/${wsId}/me/test-window`, { body: { minutes: 60 } }))}>Open a 60-min test window</Item>
                )}
                <Item onSelect={() => run(me?.paused ? 'Seat resumed' : 'Seat paused', () => api(`/api/w/${wsId}/me`, { method: 'PATCH', body: { paused: !me?.paused } }))}>{me?.paused ? 'Resume my seat' : 'Pause my seat'}</Item>
                <Item onSelect={() => run(me?.sharingEnabled ? 'Sharing off' : 'Sharing on', () => api(`/api/w/${wsId}/me`, { method: 'PATCH', body: { sharingEnabled: !me?.sharingEnabled } }))}>{me?.sharingEnabled ? 'Turn sharing off' : 'Turn sharing on'}</Item>
              </Command.Group>
              <Command.Group heading="Go to" className="text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                <Item onSelect={go('')}>Board</Item>
                <Item onSelect={go('/recurring')}>Recurring tasks</Item>
                <Item onSelect={go('/team')}>Team</Item>
                <Item onSelect={go('/digest')}>Digest</Item>
                <Item onSelect={go('/me')}>My seat</Item>
                <Item onSelect={go('/start')}>Getting started</Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({ children, onSelect, hint }: { children: React.ReactNode; onSelect: () => void; hint?: string }) {
  return (
    <Command.Item onSelect={onSelect} className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-primary-soft">
      {children}
      {hint ? <kbd className="rounded border border-line-strong px-1.5 text-[11px] text-muted">{hint}</kbd> : null}
    </Command.Item>
  );
}
