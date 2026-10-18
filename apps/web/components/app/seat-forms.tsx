'use client';

import { Check, Copy, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Hint, Input, Select } from '@/components/ui/field';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { api, detectTimeZone } from '@/lib/client/api';
import { relTime } from '@/lib/client/format';
import type { BoardMember, BoardState } from '@/lib/client/types';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
      } catch {
        toast.error('Could not copy. Select the text and copy it manually.');
      }
    },
  };
}

function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium" id={id}>
          {label}
        </div>
        <p className="mt-0.5 max-w-prose text-sm text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-primary bg-primary' : 'border-line-strong bg-surface-2'}`}
      >
        <span className={`absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} style={{ width: 18, height: 18 }} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

export function useSeatMutation(workspaceId: string) {
  const qc = useQueryClient();
  return async <T,>(path: string, init?: { method?: string; body?: unknown }, ok?: string): Promise<T | null> => {
    try {
      const r = await api<T>(`/api/w/${workspaceId}${path}`, init);
      await qc.invalidateQueries({ queryKey: ['board', workspaceId] });
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };
}

// --- Windows -----------------------------------------------------------------
export function WindowsForm({ me, workspaceId }: { me: BoardMember; workspaceId: string }) {
  const mutate = useSeatMutation(workspaceId);
  const zones = useMemo(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
      return list.includes('UTC') ? list : ['UTC', ...list];
    } catch {
      return ['UTC', detectTimeZone()];
    }
  }, []);
  const [f, setF] = useState({ timezone: me.timezone, offHoursStart: me.offHoursStart, offHoursEnd: me.offHoursEnd, beforeResetMinutes: me.beforeResetMinutes, reservePct: me.reservePct, maxConcurrent: me.maxConcurrent });
  const [saving, setSaving] = useState(false);
  const detected = typeof window !== 'undefined' ? detectTimeZone() : me.timezone;
  return (
    <form
      className="grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await mutate('/me', { method: 'PATCH', body: f }, 'Windows saved');
        setSaving(false);
      }}
    >
      <Field label="Time zone" htmlFor="tz" hint={detected !== f.timezone ? <button type="button" className="text-primary underline" onClick={() => setF({ ...f, timezone: detected })}>Use detected: {detected}</button> : 'Detected from your browser.'}>
        <Select id="tz" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
          {(zones.includes(f.timezone) ? zones : [f.timezone, ...zones]).map((z) => (
            <option key={z}>{z}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Off-hours start" htmlFor="oh-s">
          <Input id="oh-s" type="time" required value={f.offHoursStart} onChange={(e) => setF({ ...f, offHoursStart: e.target.value })} />
        </Field>
        <Field label="Off-hours end" htmlFor="oh-e">
          <Input id="oh-e" type="time" required value={f.offHoursEnd} onChange={(e) => setF({ ...f, offHoursEnd: e.target.value })} />
        </Field>
      </div>
      <Field label="Before-reset window (minutes)" htmlFor="br" hint="Run in the last N minutes before your 5-hour limit resets.">
        <Input id="br" type="number" min={0} max={300} value={f.beforeResetMinutes} onChange={(e) => setF({ ...f, beforeResetMinutes: Number(e.target.value) })} />
      </Field>
      <Field label="Keep in reserve (%)" htmlFor="rs" hint="Relay never uses the last part of your 5-hour limit.">
        <Input id="rs" type="number" min={0} max={90} value={f.reservePct} onChange={(e) => setF({ ...f, reservePct: Number(e.target.value) })} />
      </Field>
      <Field label="Max concurrent runs" htmlFor="mc">
        <Input id="mc" type="number" min={1} max={5} value={f.maxConcurrent} onChange={(e) => setF({ ...f, maxConcurrent: Number(e.target.value) })} />
      </Field>
      <div className="flex items-end justify-end sm:col-span-2">
        <Button type="submit" disabled={saving}>
          Save windows
        </Button>
      </div>
    </form>
  );
}

// --- Sharing + pause + test window ----------------------------------------------
export function SeatControls({ me, workspaceId, now }: { me: BoardMember; workspaceId: string; now: string }) {
  const mutate = useSeatMutation(workspaceId);
  const until = me.testWindowUntil ? new Date(me.testWindowUntil) : null;
  const open = until && until.getTime() > new Date(now).getTime();
  return (
    <div className="divide-y divide-line px-4">
      <Toggle
        label="Share my idle seat"
        checked={me.sharingEnabled}
        onChange={(v) => mutate('/me', { method: 'PATCH', body: { sharingEnabled: v } })}
        description="Teammates’ tasks will run on your Claude account and appear on GitHub as you. Only when you are inside a run window and above your reserve. You can pause anytime."
      />
      <Toggle label="Pause my seat" checked={me.paused} onChange={(v) => mutate('/me', { method: 'PATCH', body: { paused: v } })} description="Nothing new is dispatched to your seat while paused. Running jobs finish." />
      <BrowserNotifications />
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <div className="text-sm font-medium">Test window</div>
          <p className="mt-0.5 text-sm text-muted">Don’t want to wait for tonight? Open a run window right now.{open ? ` Open until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
        </div>
        {open ? (
          <Button variant="secondary" onClick={() => mutate('/me/test-window', { method: 'DELETE' }, 'Test window closed')}>
            Close window
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => mutate('/me/test-window', { body: { minutes: 60 } }, 'Run window open for 60 minutes')}>
            Open a 60-min window
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Routine wizard -------------------------------------------------------------
export function RoutineWizard({ me, workspaceId, repo, prompt, dryRun }: { me: BoardMember; workspaceId: string; repo: string | null; prompt: string; dryRun: boolean }) {
  const mutate = useSeatMutation(workspaceId);
  const { copied, copy } = useCopy();
  const [fireUrl, setFireUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const steps: { n: string; title: string; body: React.ReactNode }[] = [
    {
      n: 'a',
      title: 'Create the routine',
      body: (
        <>
          Open{' '}
          <a className="text-primary underline" href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">
            claude.ai/code/routines
          </a>{' '}
          and choose <b>New routine</b>. Name it <code className="font-mono">Relay worker</code>.
        </>
      ),
    },
    {
      n: 'b',
      title: 'Select the repository',
      body: <>Pick {repo ? <code className="font-mono">{repo}</code> : 'the workspace repository'}. Claude needs GitHub access to it so each run can clone and push <code className="font-mono">claude/relay-*</code> branches.</>,
    },
    { n: 'c', title: 'Environment', body: <>Use the Default environment. Optional setup script: <code className="font-mono">pnpm install</code> or <code className="font-mono">npm ci</code>, or leave blank.</> },
    {
      n: 'd',
      title: 'Paste the prompt',
      body: (
        <div className="flex flex-col gap-2">
          <span>Paste this as the routine prompt and remove any connectors.</span>
          <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{prompt}</pre>
          <Button size="sm" variant="secondary" className="w-fit" onClick={() => copy('prompt', prompt)}>
            {copied === 'prompt' ? <Check /> : <Copy />} Copy prompt
          </Button>
        </div>
      ),
    },
    { n: 'e', title: 'Add an API trigger', body: <>Add an <b>API trigger</b>, copy its URL, generate a token, then paste both below.</> },
  ];
  return (
    <div className="flex flex-col gap-4 p-4">
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden="true">
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.title}</div>
              <div className="mt-0.5 text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      {me.routineConfigured ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <Badge tone="run">
            <Check className="size-3" aria-hidden="true" /> Configured
          </Badge>
          <span className="font-mono text-xs">{me.routineHint}</span>
          <span className="text-muted">
            saved {relTime(me.routineConfiguredAt)}
            {me.routineTestAt ? ` · tested ${relTime(me.routineTestAt)}` : ''}
          </span>
          <span className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (!dryRun && !window.confirm('This sends one real run to your routine. It uses a routine run and some quota. Continue?')) return;
                setBusy(true);
                const r = await mutate<{ ok: boolean; sessionUrl?: string }>('/me/routine/test', { method: 'POST' });
                setBusy(false);
                if (r?.ok) toast.success(dryRun ? 'Dry run: no routine was fired' : 'Test run started', { description: r.sessionUrl });
              }}
              disabled={busy}
            >
              Send test run
            </Button>
            <Button size="sm" variant="ghost" aria-label="Remove routine" onClick={() => mutate('/me/routine', { method: 'DELETE' }, 'Routine removed')}>
              <Trash2 />
            </Button>
          </span>
        </div>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await mutate('/me/routine', { method: 'PUT', body: { fireUrl, token } }, 'Routine saved (encrypted)');
          setBusy(false);
          if (r) {
            setFireUrl('');
            setToken('');
          }
        }}
      >
        <Field label="Trigger URL" htmlFor="r-url" hint="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire">
          <Input id="r-url" required value={fireUrl} onChange={(e) => setFireUrl(e.target.value)} placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" autoComplete="off" className="font-mono text-xs" />
        </Field>
        <Field label="Token" htmlFor="r-token" hint="Stored encrypted. Never shown again.">
          <Input id="r-token" required type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        </Field>
        <Button type="submit" disabled={busy}>
          <KeyRound /> {me.routineConfigured ? 'Replace' : 'Save'}
        </Button>
      </form>
    </div>
  );
}

// --- Usage data -----------------------------------------------------------------
type TokenRow = { id: string; name: string; lastUsedAt: string | null; createdAt: string };

export function UsageSetup({ me, workspaceId }: { me: BoardMember; workspaceId: string }) {
  const qc = useQueryClient();
  const { copied, copy } = useCopy();
  const { data } = useQuery({ queryKey: ['usage-tokens', workspaceId], queryFn: () => api<{ tokens: TokenRow[] }>(`/api/w/${workspaceId}/me/usage-tokens`) });
  const [fresh, setFresh] = useState<string | null>(null);
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
  const token = fresh ?? '<token from Relay>';
  const snippet = JSON.stringify(
    { statusLine: { type: 'command', command: 'node ~/.relay/relay-statusline.mjs' }, env: { RELAY_URL: origin, RELAY_USAGE_TOKEN: token } },
    null,
    2,
  );
  const curl = `mkdir -p ~/.relay && curl -fsSL ${origin}/relay-statusline.mjs -o ~/.relay/relay-statusline.mjs`;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {me.usageSource === 'beacon' ? (
          <Badge tone="run">Live</Badge>
        ) : (
          <Badge tone="dusk">{me.usageSource === 'manual' ? 'Manual mode' : 'No data yet'}</Badge>
        )}
        <span className="text-muted">
          {me.usedPct5h != null
            ? `Last value: ${Math.round(me.usedPct5h)}% of the 5-hour limit (${me.usageSource}), ${relTime(me.usageUpdatedAt)}.`
            : 'Create a usage token and connect the statusLine, or set your usage by hand on the board.'}
        </span>
      </div>
      <ol className="flex flex-col gap-3 text-sm">
        <li>
          <b>1. Create a token</b>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  const r = await api<{ id: string; token: string }>(`/api/w/${workspaceId}/me/usage-tokens`, { body: { name: 'statusLine' } });
                  setFresh(r.token);
                  await qc.invalidateQueries({ queryKey: ['usage-tokens', workspaceId] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <KeyRound /> Create usage token
            </Button>
            {fresh ? (
              <>
                <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs break-all">{fresh}</code>
                <Button size="sm" variant="ghost" onClick={() => copy('tok', fresh)}>
                  {copied === 'tok' ? <Check /> : <Copy />} Copy
                </Button>
              </>
            ) : null}
          </div>
          {fresh ? <Hint className="mt-1 text-dusk-ink">Shown once. Copy it now.</Hint> : null}
          {data?.tokens.length ? (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {data.tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span>
                    <b className="text-sm">{t.name}</b> · created {relTime(t.createdAt)} · {t.lastUsedAt ? `last used ${relTime(t.lastUsedAt)}` : 'never used'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api(`/api/w/${workspaceId}/me/usage-tokens/${t.id}`, { method: 'DELETE' });
                      await qc.invalidateQueries({ queryKey: ['usage-tokens', workspaceId] });
                    }}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        <li>
          <b>2. Download the script</b>
          <div className="mt-1.5 flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-2.5 font-mono text-xs">{curl}</pre>
            <Button size="icon" variant="secondary" aria-label="Copy command" onClick={() => copy('curl', curl)}>
              {copied === 'curl' ? <Check /> : <Copy />}
            </Button>
          </div>
        </li>
        <li>
          <b>3. Add to </b>
          <code className="font-mono text-xs">~/.claude/settings.json</code>
          <div className="mt-1.5 flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-2.5 font-mono text-xs">{snippet}</pre>
            <Button size="icon" variant="secondary" aria-label="Copy settings" onClick={() => copy('json', snippet)}>
              {copied === 'json' ? <Check /> : <Copy />}
            </Button>
          </div>
        </li>
      </ol>
      <Hint>
        Field names in Claude Code’s status payload can change; the script saves the raw payload to <code className="font-mono">~/.relay/statusline-last.json</code> for debugging. The manual slider on your seat card always works.
      </Hint>
    </div>
  );
}

export function SeatSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      {children}
    </Panel>
  );
}

export function useMe(board: BoardState | undefined) {
  return board?.members.find((m) => m.id === board.meMemberId);
}

export function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="inline-flex items-center gap-1 text-primary underline" href={href} target="_blank" rel="noreferrer">
      {children} <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

function BrowserNotifications() {
  const [perm, setPerm] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('relay:browser-notifications') === '1';
    } catch {
      return false;
    }
  });
  if (perm === 'unsupported') return null;
  const enabled = on && perm === 'granted';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <div className="text-sm font-medium">Browser notifications</div>
        <p className="mt-0.5 max-w-prose text-sm text-muted">
          {perm === 'denied' ? 'Blocked in your browser settings for this site.' : 'Get a pop-up when a task is ready or fails while a Relay tab is open. No background service is used.'}
        </p>
      </div>
      <Button
        variant="secondary"
        disabled={perm === 'denied'}
        onClick={async () => {
          if (enabled) {
            localStorage.setItem('relay:browser-notifications', '0');
            setOn(false);
            return;
          }
          const p = perm === 'granted' ? 'granted' : await Notification.requestPermission();
          setPerm(p);
          if (p === 'granted') {
            localStorage.setItem('relay:browser-notifications', '1');
            setOn(true);
          }
        }}
      >
        {enabled ? 'Turn off' : 'Enable browser notifications'}
      </Button>
    </div>
  );
}
