import { WINDOW_STARTING_NOTICE_MINUTES, buildDigest, digestDue, localDate, nextWindowStart } from '@relay/core';
import { and, eq, or, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Task, Workspace } from '../db/schema';
import { newId } from '../ids';
import { log } from '../http';
import { ensureLabels, repoOf, workspaceOctokit } from '../github/repo';
import { toSched, toSeat } from './load';
import { ghName } from './names';
import { notify } from './notify';
import { recordEvent } from './events';
import { taskUrl } from './status-comment';
import { appUrl } from '../env';

const DIGEST_LABEL = 'relay-digest';

/** Tick step 4 (SPEC §11.1): post each due member's morning digest on their digest issue. */
export async function runDigests(ws: Workspace, members: Member[], tasks: Task[], now: Date): Promise<number> {
  let posted = 0;
  const sched = tasks.map(toSched);
  const names = Object.fromEntries(members.map((m) => [m.id, ghName(m) ?? m.displayName]));
  for (const m of members) {
    if (m.simulated || !digestDue(toSeat(m), now)) continue;
    const today = localDate(now, m.timezone);
    // Claim today's digest so concurrent ticks can't post it twice.
    const [claimed] = await db()
      .update(schema.members)
      .set({ lastDigestDate: today })
      .where(and(eq(schema.members.id, m.id), or(isNull(schema.members.lastDigestDate), ne(schema.members.lastDigestDate, today))))
      .returning();
    if (!claimed) continue;
    const since = new Date(now.getTime() - 24 * 3600_000);
    const markdown = buildDigest(toSeat(m), sched, since, { names, taskUrl: (id) => taskUrl(ws.id, id) });
    if (!markdown) continue;
    try {
      const gh = await workspaceOctokit(ws);
      const ref = repoOf(ws);
      let issueNumber = m.digestIssueNumber;
      if (!issueNumber) {
        await ensureLabels(gh, ref);
        const { data } = await gh.rest.issues.create({ ...ref, title: `Relay digest · @${m.githubLogin ?? m.displayName}`, body: 'Relay posts your morning digest here. Mute this issue to stop notifications.', labels: [DIGEST_LABEL] });
        issueNumber = data.number;
        await db().update(schema.members).set({ digestIssueNumber: issueNumber }).where(eq(schema.members.id, m.id));
      }
      const mention = m.githubLogin ? `@${m.githubLogin} ` : '';
      const { data: comment } = await gh.rest.issues.createComment({ ...ref, issue_number: issueNumber, body: `${mention}Good morning. Here is what happened (${today}).\n\n${markdown}` });
      await db().insert(schema.digests).values({ id: newId(), memberId: m.id, date: today, markdown, commentUrl: comment.html_url }).onConflictDoNothing();
      await notify({ memberId: m.id, kind: 'digest', title: 'Your morning digest is ready', body: `Digest for ${today}`, url: comment.html_url, dedupeKey: `digest:${today}` });
      await recordEvent({ workspaceId: ws.id, memberId: m.id, kind: 'digest_posted', message: `Digest posted for ${m.displayName} (${today})` });
      posted++;
    } catch (e) {
      // Release the claim so the next tick retries within the grace period.
      await db().update(schema.members).set({ lastDigestDate: m.lastDigestDate }).where(eq(schema.members.id, m.id));
      log('warn', 'digest failed', { workspaceId: ws.id, memberId: m.id, error: (e as Error).message });
    }
  }
  return posted;
}

/** One "your window starts soon" notification per window, only when there is queued work (SPEC §14). */
export async function runWindowNotices(ws: Workspace, members: Member[], tasks: Task[], now: Date): Promise<number> {
  const waiting = tasks.filter((t) => ['queued', 'waiting_window', 'needs_triage'].includes(t.status));
  let n = 0;
  for (const m of members) {
    if (m.simulated || m.paused) continue;
    const mine = waiting.filter((t) => t.requesterMemberId === m.id);
    const sharable = m.sharingEnabled ? waiting.filter((t) => t.requesterMemberId !== m.id) : [];
    if (!mine.length && !sharable.length) continue;
    const seat = toSeat(m);
    const start = nextWindowStart(seat, now, seat);
    if (!start) continue;
    const mins = (start.getTime() - now.getTime()) / 60_000;
    if (mins <= 0 || mins > WINDOW_STARTING_NOTICE_MINUTES) continue;
    await notify({
      memberId: m.id,
      kind: 'window_starting',
      title: 'Your run window starts soon',
      body: `${mine.length + sharable.length} task(s) are waiting for a window.`,
      url: `${appUrl()}/w/${ws.id}`,
      dedupeKey: `window:${start.toISOString()}`,
    });
    n++;
  }
  return n;
}
