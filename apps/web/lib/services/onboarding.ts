import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Member, Workspace } from '../db/schema';
import { env } from '../env';

export interface OnboardingStep {
  key: 'signin' | 'workspace' | 'repo' | 'routine' | 'windows' | 'usage' | 'try' | 'sharing';
  title: string;
  status: 'done' | 'todo' | 'warn';
  optional: boolean;
  detail: string;
}

/** Getting-started checklist state (SPEC §21.2). */
export async function onboardingSteps(ws: Workspace, me: Member): Promise<{ steps: OnboardingStep[]; complete: boolean }> {
  const [finished] = await db()
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.workspaceId, ws.id), eq(schema.tasks.requesterMemberId, me.id), inArray(schema.tasks.status, ['done', 'merged'])))
    .limit(1);
  const repo = Boolean(ws.githubInstallationId && ws.repoOwner && ws.labelsCreatedAt);
  const beacon = me.usageSource === 'beacon';
  const steps: OnboardingStep[] = [
    { key: 'signin', title: 'Sign in with GitHub', status: 'done', optional: false, detail: 'Signed in.' },
    { key: 'workspace', title: 'Create a workspace', status: 'done', optional: false, detail: ws.name },
    {
      key: 'repo',
      title: 'Connect a repository',
      status: repo ? 'done' : 'todo',
      optional: false,
      detail: repo ? `${ws.repoOwner}/${ws.repoName}` : ws.githubInstallationId ? 'Installed. Pick the repository to use.' : 'Install the Relay GitHub App on one repository.',
    },
    {
      key: 'routine',
      title: 'Connect your Claude seat',
      status: me.routineConfiguredAt ? 'done' : 'todo',
      optional: false,
      detail: me.routineConfiguredAt ? `Routine saved (${me.routineHint ?? 'configured'}).` : 'Create a “Relay worker” routine and paste its URL and token.',
    },
    {
      key: 'windows',
      title: 'Set your windows',
      status: me.windowsSavedAt ? 'done' : 'todo',
      optional: false,
      detail: me.windowsSavedAt ? `${me.offHoursStart}–${me.offHoursEnd} ${me.timezone}, last ${me.beforeResetMinutes} min before reset.` : 'Confirm your time zone and off-hours.',
    },
    {
      key: 'usage',
      title: 'Usage data',
      status: beacon ? 'done' : me.usageSource === 'manual' ? 'warn' : 'todo',
      optional: true,
      detail: beacon ? 'Receiving live usage from Claude Code.' : 'Optional, recommended: connect the statusLine. Manual mode works without it.',
    },
    {
      key: 'try',
      title: 'Try it now',
      status: finished ? 'done' : 'todo',
      optional: false,
      detail: finished ? 'Your first result landed.' : 'Create a sample task, then use Run now or open a 60-minute test window.',
    },
    {
      key: 'sharing',
      title: 'Explore sharing',
      status: ws.demoMode ? 'done' : 'todo',
      optional: true,
      detail: ws.demoMode ? 'Demo mode is on.' : 'Turn on demo mode to add simulated teammates and see sharing.',
    },
  ];
  const complete = steps.filter((s) => !s.optional).every((s) => s.status === 'done');
  return { steps, complete };
}

export const SAMPLE_DOCS_TASK = {
  type: 'docs' as const,
  title: 'Write a CONTRIBUTING.md',
  description: 'Write a CONTRIBUTING.md that summarizes how to install, run, and test this repository, based on the README and package scripts.',
  likelyFiles: ['CONTRIBUTING.md'],
  size: 'S' as const,
};

export const SAMPLE_DEMO_TASK = {
  type: 'code' as const,
  title: 'Add unit tests for calcInvoice',
  description: 'Add unit tests for `calcInvoice` in src/billing.ts: empty items, tax, and discount codes.',
  likelyFiles: ['src/billing.ts', 'tests/billing.test.ts'],
  doneCheck: 'pnpm test',
  size: 'S' as const,
};

export function isDemoTemplateRepo(ws: Pick<Workspace, 'repoName'>): boolean {
  const t = (env().RELAY_DEMO_TEMPLATE_REPO ?? '').split('/').pop()?.replace(/\.git$/, '').toLowerCase();
  return Boolean(ws.repoName && t && ws.repoName.toLowerCase() === t) || /^relay-demo/i.test(ws.repoName ?? '');
}
