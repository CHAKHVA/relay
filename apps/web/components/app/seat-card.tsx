'use client';

import { Moon, Pause, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/client/api';
import { clock, dayClock, relTime } from '@/lib/client/format';
import type { BoardMember } from '@/lib/client/types';
import { UsageRing } from './usage-ring';

const WINDOW_TEXT = { off_hours: 'Off-hours now', before_reset: 'Before-reset window', test: 'Test window open' } as const;

function confidence(m: BoardMember): { text: string; tone: 'run' | 'dusk' | 'neutral' | 'primary' } {
  if (m.usageSource === 'simulated') return { text: 'simulated', tone: 'dusk' };
  if (m.usageSource === 'manual') return { text: 'manual', tone: 'primary' };
  if (m.estimate.confidence === 'live') return { text: 'live', tone: 'run' };
  if (m.estimate.confidence === 'estimated') return { text: 'estimated', tone: 'neutral' };
  return { text: 'unknown', tone: 'neutral' };
}

export function SeatCard({ member, isMe, canSlide, workspaceId, onChanged }: { member: BoardMember; isMe: boolean; canSlide: boolean; workspaceId: string; onChanged: () => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const conf = confidence(member);
  const used = member.estimate.usedPct5h;
  const known = member.estimate.confidence !== 'unknown' || member.usedPct5h != null;
  const shown = draft ?? (known ? used : null);

  async function commit(value: number) {
    try {
      await api(`/api/w/${workspaceId}/members/${member.id}/usage`, { method: 'PATCH', body: { usedPct5h: value } });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDraft(null);
    }
  }

  return (
    <article className="rounded-lg border border-line bg-surface p-3" aria-label={`${member.displayName}'s seat`}>
      <div className="flex items-start gap-3">
        <UsageRing used={shown} reserve={member.reservePct} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold">{member.displayName}</h3>
            {isMe ? <Badge tone="outline">You</Badge> : null}
            {member.simulated ? (
              <Badge tone="dusk" title="Not a real seat; never runs tasks">
                Simulated
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {member.activeWindow ? (
              <span className="inline-flex items-center gap-1 font-medium text-run">
                <Moon className="size-3" aria-hidden="true" />
                {WINDOW_TEXT[member.activeWindow]}
              </span>
            ) : member.nextWindowAt ? (
              <>
                Next: {dayClock(member.nextWindowAt, member.timezone)} <span className="text-faint">({member.timezone})</span>
              </>
            ) : (
              'No upcoming window'
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={conf.tone}>{conf.text}</Badge>
            {member.sharingEnabled ? (
              <Badge tone="run">
                <Share2 className="size-3" aria-hidden="true" /> Sharing
              </Badge>
            ) : (
              <Badge>Not sharing</Badge>
            )}
            {member.paused ? (
              <Badge tone="danger">
                <Pause className="size-3" aria-hidden="true" /> Paused
              </Badge>
            ) : null}
            {!member.simulated && !member.routineConfigured ? <Badge tone="dusk">No routine</Badge> : null}
            {member.running > 0 ? <Badge tone="primary">{member.running} running</Badge> : null}
          </div>
        </div>
      </div>
      {member.usedPctWeek != null ? (
        <div className="mt-2.5" title={`Weekly: ${Math.round(member.usedPctWeek)}% used`}>
          <div className="flex justify-between text-[11px] text-muted">
            <span>Week</span>
            <span className="tabular-nums">{Math.round(member.usedPctWeek)}%</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line" role="presentation">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, member.usedPctWeek)}%` }} />
          </div>
        </div>
      ) : null}
      {member.resets5hAt && (member.usageSource !== 'simulated') ? (
        <p className="mt-2 text-[11px] text-muted">
          Resets {clock(member.resets5hAt, member.timezone)} · {relTime(member.resets5hAt)}
        </p>
      ) : null}
      {canSlide ? (
        <div className="mt-2.5">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <span className="shrink-0">Set usage</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft ?? Math.round(used)}
              onChange={(e) => setDraft(Number(e.target.value))}
              onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
              aria-label={`Set ${member.displayName}'s 5-hour usage`}
              className="h-1 w-full accent-[var(--primary)]"
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}
