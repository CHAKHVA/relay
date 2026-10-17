import { DIGEST_GRACE_MINUTES } from './config';
import type { SchedTask, SeatMember, TaskStatus } from './types';
import { inLocalWindow, localDate, parseHHmm, toZoned } from './windows';

type DigestMember = Pick<SeatMember, 'id' | 'timezone' | 'offHoursEnd' | 'sharingEnabled'> & {
  lastDigestDate?: string | null;
};

/** True within the first 30 minutes after the member's off-hours end, once per local day. */
export function digestDue(member: DigestMember, now: Date): boolean {
  const z = toZoned(now, member.timezone);
  const end = parseHHmm(member.offHoursEnd);
  const m = z.hour * 60 + z.minute;
  if (!inLocalWindow(m, end, (end + DIGEST_GRACE_MINUTES) % (24 * 60))) return false;
  return member.lastDigestDate !== localDate(now, member.timezone);
}

export interface DigestContext {
  /** memberId → display label, e.g. "@ana" or "Ana (Simulated)". */
  names: Record<string, string>;
  /** Link to the task in Relay. */
  taskUrl: (taskId: string) => string;
}

const COMPLETED: TaskStatus[] = ['done', 'merged'];
const ATTENTION: TaskStatus[] = ['failed', 'stale'];
const PENDING: TaskStatus[] = ['queued', 'waiting_window', 'blocked', 'needs_triage'];

function line(t: SchedTask, ctx: DigestContext, extra: string): string {
  const links = [
    `[Relay](${ctx.taskUrl(t.id)})`,
    t.resultPrUrl ? `[PR](${t.resultPrUrl})` : null,
    t.resultCommentUrl ? `[comment](${t.resultCommentUrl})` : null,
  ].filter(Boolean);
  return `- **${t.id}** #${t.issueNumber} ${t.title}${extra ? ` — ${extra}` : ''} · ${links.join(' · ')}`;
}

/** Morning digest Markdown (SPEC §10.9), or null if every section is empty. */
export function buildDigest(member: DigestMember, tasks: SchedTask[], since: Date, ctx: DigestContext): string | null {
  const after = (d: Date | null | undefined) => !!d && d.getTime() >= since.getTime();
  const name = (id: string | null) => (id ? (ctx.names[id] ?? 'someone') : 'someone');

  const ranOnSeat = tasks.filter((t) => t.assigneeMemberId === member.id && COMPLETED.includes(t.status) && after(t.completedAt));
  const ready = tasks.filter((t) => t.requesterMemberId === member.id && COMPLETED.includes(t.status) && after(t.completedAt));
  const attention = tasks.filter(
    (t) => (t.requesterMemberId === member.id || t.assigneeMemberId === member.id) && ATTENTION.includes(t.status),
  );
  const plan = tasks.filter(
    (t) => PENDING.includes(t.status) && (t.requesterMemberId === member.id || member.sharingEnabled),
  );

  const sections: string[] = [];
  if (ranOnSeat.length) {
    sections.push(
      '### Ran on your seat\n' +
        ranOnSeat
          .map((t) => line(t, ctx, t.requesterMemberId === member.id ? 'your task' : `shared · requested by ${name(t.requesterMemberId)}`))
          .join('\n'),
    );
  }
  if (ready.length) {
    sections.push(
      '### Ready for you\n' +
        ready.map((t) => line(t, ctx, t.assigneeMemberId && t.assigneeMemberId !== member.id ? `run on ${name(t.assigneeMemberId)}'s seat` : '')).join('\n'),
    );
  }
  if (attention.length) {
    sections.push('### Needs attention\n' + attention.map((t) => line(t, ctx, t.status)).join('\n'));
  }
  if (plan.length) {
    sections.push(
      "### Tonight's plan\n" +
        plan.map((t) => line(t, ctx, t.requesterMemberId === member.id ? 'your task' : `teammate's task (if you have headroom)`)).join('\n'),
    );
  }
  if (!sections.length) return null;
  return sections.join('\n\n');
}
