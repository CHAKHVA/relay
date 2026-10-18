import { eq } from 'drizzle-orm';
import { db, schema } from '../lib/db';
import { loadDemoTeam } from '../lib/services/demo';
import { saveRoutine } from '../lib/services/seat';
import { newId } from '../lib/ids';
import { sandboxInstallationId, TEST_NAME, TEST_OWNER } from '../test/helpers/github';

/** A realistic board for screenshots and UI tests: demo team, usage, and tasks in every state (no GitHub writes). */
export async function seedDemoBoard(wsId: string) {
  await db()
    .update(schema.workspaces)
    .set({ githubInstallationId: await sandboxInstallationId(), repoOwner: TEST_OWNER, repoName: TEST_NAME, defaultBranch: 'main', labelsCreatedAt: new Date(), demoMode: true, dryRun: true })
    .where(eq(schema.workspaces.id, wsId));
  const [ws] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId));
  const [owner] = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
  await saveRoutine(owner!, { fireUrl: 'https://api.anthropic.com/v1/claude_code/routines/trig_VISUALTEST1/fire', token: 'fake-visual-token-value' });
  await loadDemoTeam(ws!, owner!);
  const now = new Date();
  await db()
    .update(schema.members)
    .set({ usedPct5h: 42, resets5hAt: new Date(now.getTime() + 95 * 60_000), usedPctWeek: 31, usageSource: 'beacon', usageUpdatedAt: now, windowsSavedAt: now, timezone: 'Asia/Tbilisi', offHoursStart: '19:00', offHoursEnd: '08:00' })
    .where(eq(schema.members.id, owner!.id));
  const sims = await db().select().from(schema.members).where(eq(schema.members.workspaceId, wsId));
  const ana = sims.find((m) => m.displayName === 'Ana')!;
  const luka = sims.find((m) => m.displayName === 'Luka')!;
  const t = (n: number, id: string, over: Partial<typeof schema.tasks.$inferInsert>) =>
    db().insert(schema.tasks).values({
      id,
      workspaceId: wsId,
      issueNumber: n,
      issueUrl: `https://github.com/${TEST_OWNER}/${TEST_NAME}/issues/${n}`,
      title: 'Task',
      type: 'code',
      requesterMemberId: owner!.id,
      status: 'queued',
      createdAt: new Date(now.getTime() - (20 - n) * 3600_000),
      ...over,
    });
  const mins = (m: number) => new Date(now.getTime() - m * 60_000);
  await t(1, 'r7f3a', { title: 'Add unit tests for calcInvoice', requesterMemberId: ana.id, assigneeMemberId: owner!.id, status: 'dispatched', runKind: 'work', shared: true, priority: 'high', size: 'S', likelyFiles: ['src/billing.ts', 'tests/billing.test.ts'], doneCheck: 'pnpm test', windowKind: 'off_hours', costPct: 5, dispatchedAt: mins(6), sessionUrl: 'https://claude.ai/code/session_demo1', branch: 'claude/relay-r7f3a', requesterUsedPctAtDispatch: 96 });
  await t(2, 'r2k9d', { title: 'Add input validation to validateLogin', status: 'dispatched', assigneeMemberId: owner!.id, runKind: 'work', size: 'S', likelyFiles: ['src/auth.ts', 'tests/auth.test.ts'], doneCheck: 'pnpm test', windowKind: 'manual', costPct: 5, dispatchedAt: mins(3), sessionUrl: 'https://claude.ai/code/session_demo2', branch: 'claude/relay-r2k9d' });
  await t(3, 'r5m1x', { title: 'Return structured errors from validateLogin', requesterMemberId: ana.id, status: 'blocked', statusReason: 'Blocked on src/auth.ts by r2k9d', blockedByTaskId: 'r2k9d', blockedOnFiles: ['src/auth.ts'], size: 'S', likelyFiles: ['src/auth.ts'], doneCheck: 'pnpm test' });
  await t(4, 'r8w4q', { title: 'Review PR #4: billing refactor', type: 'review', requesterMemberId: luka.id, targetPrNumber: 4, status: 'waiting_window', statusReason: 'Next window: Giorgi at 19:00 Asia/Tbilisi', priority: 'low' });
  await t(5, 'r3c7z', { title: 'Compare 3 approaches for multi-currency formatting', type: 'business', requesterMemberId: ana.id, status: 'done', runKind: 'work', shared: true, windowKind: 'off_hours', costPct: 12, estTokens: 400_000, requesterUsedPctAtDispatch: 96, assigneeMemberId: owner!.id, completedAt: mins(40), resultCommentUrl: `https://github.com/${TEST_OWNER}/${TEST_NAME}/issues/5#issuecomment-1`, result: { taskId: 'r3c7z', jobKind: 'work', type: 'business', summary: 'Recommends Intl.NumberFormat with a currency table.', outputMode: 'comment', commentMarkdown: '## Recommendation\n\nUse `Intl.NumberFormat` with an explicit currency table.\n\n| Approach | Effort | Risk |\n|---|---|---|\n| Intl.NumberFormat | Low | Low |\n| Currency library | Medium | Medium |\n| Hand-rolled | High | High |\n\n- Start with USD, EUR, GEL.', filesChanged: [], checkCommand: '', checkPassed: null, triage: null, notes: '' } });
  await t(6, 'r6n2b', { title: 'Weekly dependency audit', type: 'docs', status: 'done', runKind: 'work', windowKind: 'before_reset', costPct: 5, estTokens: 150_000, assigneeMemberId: owner!.id, completedAt: mins(300), resultPrUrl: `https://github.com/${TEST_OWNER}/${TEST_NAME}/pull/6` });
  await t(7, 'r9v8y', { title: 'The signup page feels slow', status: 'needs_triage', statusReason: 'Missing type, likelyFiles, doneCheck' });
  await t(8, 'r4h6t', { title: 'Migrate formatMoney to Intl', status: 'failed', statusReason: 'The done check failed (`pnpm test`). 2 tests failed.', runKind: 'work', assigneeMemberId: owner!.id });
  await db().insert(schema.events).values([
    { id: newId(), workspaceId: wsId, taskId: 'r2k9d', kind: 'task_dispatched', message: 'r2k9d work dispatched to @giorgi’s seat (manual) [dry run]', createdAt: mins(3) },
    { id: newId(), workspaceId: wsId, taskId: 'r5m1x', kind: 'task_blocked', message: 'r5m1x Blocked on src/auth.ts by r2k9d', createdAt: mins(4) },
    { id: newId(), workspaceId: wsId, taskId: 'r7f3a', kind: 'task_dispatched', message: 'r7f3a work dispatched to @giorgi’s seat (off-hours, shared) [dry run]', createdAt: mins(6) },
    { id: newId(), workspaceId: wsId, taskId: 'r3c7z', kind: 'task_done', message: 'r3c7z done (comment posted) [dry run]', createdAt: mins(40) },
  ]);
  const { notify } = await import('../lib/engine/notify');
  await notify({ memberId: owner!.id, kind: 'my_task_ready', title: 'Your task r3c7z is ready', body: 'Compare 3 approaches for multi-currency formatting', url: `/w/${wsId}/tasks/r3c7z`, dedupeKey: 'seed-1' });
  await notify({ memberId: owner!.id, kind: 'task_done_on_my_seat', title: 'Ran r7f3a for Ana', body: 'Add unit tests for calcInvoice', dedupeKey: 'seed-2' });
  await db().insert(schema.digests).values({ id: newId(), memberId: owner!.id, date: new Date(now.getTime() - 86400_000).toISOString().slice(0, 10), commentUrl: `https://github.com/${TEST_OWNER}/${TEST_NAME}/issues/20#issuecomment-1`, markdown: '### Ran on your seat\n- **r3c7z** #5 Compare 3 approaches — shared · requested by Ana (Simulated) · [Relay](https://example.com)\n- **r6n2b** #6 Weekly dependency audit — your task · [PR](https://example.com)\n\n### Needs attention\n- **r4h6t** #8 Migrate formatMoney to Intl — failed\n\n### Tonight\'s plan\n- **r8w4q** #4 Review PR #4 — waiting for a window' });
  await db().insert(schema.recurringTasks).values([
    { id: newId(), workspaceId: wsId, creatorMemberId: owner!.id, title: 'Weekly dependency audit', body: 'Audit dependencies.', type: 'docs', cron: '0 9 * * 1', timezone: 'Asia/Tbilisi', nextRunAt: new Date(now.getTime() + 3 * 86400_000), lastRunAt: new Date(now.getTime() - 4 * 86400_000) },
    { id: newId(), workspaceId: wsId, creatorMemberId: owner!.id, title: 'Nightly flaky-test report', body: '', type: 'business', cron: '0 20 * * *', timezone: 'Asia/Tbilisi', enabled: false, nextRunAt: now },
  ]);
  return { owner: owner!, ana, luka };
}
