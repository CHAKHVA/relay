'use client';

import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useBoard, useRefreshBoard } from '@/lib/client/use-board';
import { NewTaskDialog } from './new-task-dialog';

export const NEW_TASK_EVENT = 'relay:new-task';

/** Header right side: mode badges, demo clock, New task. Owns the global `N` shortcut. */
export function HeaderTools({ workspaceId }: { workspaceId: string }) {
  const { data: board } = useBoard(workspaceId);
  const refresh = useRefreshBoard(workspaceId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openIt = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener(NEW_TASK_EVENT, openIt);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(NEW_TASK_EVENT, openIt);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!board) return null;
  const ws = board.workspace;
  return (
    <>
      {ws.dryRun ? (
        <Badge tone="dusk" title="No routine is fired; results are simulated">
          DRY RUN
        </Badge>
      ) : null}
      {ws.demoMode ? <Badge tone="primary">DEMO</Badge> : null}
      {ws.demoMode && ws.clockOffsetMinutes !== 0 ? (
        <Badge tone="outline" title="Demo clock">
          Clock {new Date(board.now).toISOString().slice(5, 16).replace('T', ' ')} UTC
        </Badge>
      ) : null}
      <Button size="sm" onClick={() => setOpen(true)} disabled={!ws.githubConnected || !ws.repo} title={ws.repo ? 'New task (N)' : 'Connect a repository first'}>
        <Plus /> New task <kbd className="ml-1 hidden rounded border border-white/30 px-1 text-[10px] font-normal sm:inline">N</kbd>
      </Button>
      <NewTaskDialog board={board} open={open} onOpenChange={setOpen} onCreated={refresh} />
    </>
  );
}
