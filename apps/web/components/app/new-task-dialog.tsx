'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Hint, Input, Select, Textarea } from '@/components/ui/field';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import type { BoardState } from '@/lib/client/types';

const TYPES = [
  { value: 'code', label: 'Code' },
  { value: 'review', label: 'Review' },
  { value: 'docs', label: 'Docs' },
  { value: 'business', label: 'Business' },
] as const;
type TaskType = (typeof TYPES)[number]['value'];

export function NewTaskDialog({ board, open, onOpenChange, onCreated, }: { board: BoardState; open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const wsId = board.workspace.id;
  const [type, setType] = useState<TaskType>('code');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [fileInput, setFileInput] = useState('');
  const [doneCheck, setDoneCheck] = useState('');
  const [targetPr, setTargetPr] = useState('');
  const [size, setSize] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requester, setRequester] = useState(board.meMemberId);
  const [pulls, setPulls] = useState<{ number: number; title: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || type !== 'review') return;
    api<{ pulls: { number: number; title: string }[] }>(`/api/w/${wsId}/pulls`)
      .then((r) => setPulls(r.pulls))
      .catch(() => setPulls([]));
  }, [open, type, wsId]);

  const needsTriage = (type === 'code' && (!files.length || !doneCheck.trim())) || (type === 'review' && !targetPr);

  function addFile() {
    const parts = fileInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) setFiles((f) => [...new Set([...f, ...parts])]);
    setFileInput('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const pending = fileInput.trim() ? [...new Set([...files, ...fileInput.split(/[\s,]+/).filter(Boolean)])] : files;
      await api(`/api/w/${wsId}/tasks`, {
        body: {
          type,
          title,
          description,
          likelyFiles: pending,
          doneCheck: doneCheck.trim() || null,
          targetPr: type === 'review' && targetPr ? Number(targetPr) : null,
          size: size || null,
          priority,
          requesterMemberId: requester !== board.meMemberId ? requester : undefined,
        },
      });
      toast.success('Task created: GitHub issue opened');
      setTitle('');
      setDescription('');
      setFiles([]);
      setFileInput('');
      setDoneCheck('');
      setTargetPr('');
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(640px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="font-display text-lg font-semibold">New task</Dialog.Title>
              <Dialog.Description className="text-sm text-muted">Opens a GitHub issue labeled <code className="font-mono">relay</code>.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
            <div role="radiogroup" aria-label="Task type" className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={type === t.value}
                  onClick={() => setType(t.value)}
                  className={cn('h-8 rounded-md text-sm font-medium transition-colors', type === t.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong' : 'text-muted hover:text-ink')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Field label="Title" htmlFor="nt-title">
              <Input id="nt-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </Field>
            <Field label="Description" htmlFor="nt-desc" hint="What should be done, and why. Plain Markdown.">
              <Textarea id="nt-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {type === 'review' ? (
              <Field label="Pull request to review" htmlFor="nt-pr">
                <div className="flex gap-2">
                  <Select id="nt-pr" value={targetPr} onChange={(e) => setTargetPr(e.target.value)}>
                    <option value="">Choose an open PR…</option>
                    {pulls.map((p) => (
                      <option key={p.number} value={p.number}>
                        #{p.number} {p.title}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="PR number" inputMode="numeric" placeholder="or #" className="w-24" value={targetPr} onChange={(e) => setTargetPr(e.target.value.replace(/\D/g, ''))} />
                </div>
              </Field>
            ) : null}
            {type !== 'business' && type !== 'review' ? (
              <Field label="Likely files" htmlFor="nt-files" hint="Optional. Used to avoid two agents editing the same files. Press Enter to add.">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface p-1.5">
                  {files.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">
                      {f}
                      <button type="button" aria-label={`Remove ${f}`} onClick={() => setFiles(files.filter((x) => x !== f))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="nt-files"
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                    value={fileInput}
                    placeholder="src/auth.ts"
                    onChange={(e) => setFileInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addFile();
                      }
                    }}
                    onBlur={addFile}
                  />
                </div>
              </Field>
            ) : null}
            {type === 'code' ? (
              <Field label="Done check" htmlFor="nt-check" hint="A command that proves success, e.g. pnpm test.">
                <Input id="nt-check" value={doneCheck} onChange={(e) => setDoneCheck(e.target.value)} className="font-mono" placeholder="pnpm test" />
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Size" htmlFor="nt-size">
                <Select id="nt-size" value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="">Let the agent estimate</option>
                  <option value="S">S (small)</option>
                  <option value="M">M (medium)</option>
                  <option value="L">L (large)</option>
                </Select>
              </Field>
              <Field label="Priority" htmlFor="nt-prio">
                <Select id="nt-prio" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </Select>
              </Field>
            </div>
            {board.workspace.demoMode ? (
              <Field label="Requester" htmlFor="nt-req" hint="Demo mode: create the task on behalf of any member.">
                <Select id="nt-req" value={requester} onChange={(e) => setRequester(e.target.value)}>
                  {board.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                      {m.simulated ? ' (Simulated)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {needsTriage ? <Hint role="status">Missing details: this will be triaged by an agent first, which fills them in.</Hint> : null}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={busy || !title.trim()}>
                <Plus /> Create task
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
