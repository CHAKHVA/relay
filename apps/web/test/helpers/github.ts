import { and, eq } from 'drizzle-orm';
import { POST as createWorkspace } from '@/app/api/workspaces/route';
import { db, schema } from '@/lib/db';
import { githubApp, installationOctokit, type GH } from '@/lib/github/app';
import { call, login, type TestUser } from './http';

export const TEST_REPO = (process.env.TEST_REPO ?? '').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
export const [TEST_OWNER, TEST_NAME] = TEST_REPO.split('/') as [string, string];
export const TEST_LABEL = 'relay-test';

let cachedInstallation: number | null = null;
export async function sandboxInstallationId(): Promise<number> {
  if (cachedInstallation) return cachedInstallation;
  const { data } = await githubApp().octokit.rest.apps.getRepoInstallation({ owner: TEST_OWNER, repo: TEST_NAME });
  cachedInstallation = data.id;
  return data.id;
}

export async function sandboxOctokit(): Promise<GH> {
  return installationOctokit(await sandboxInstallationId());
}

/** A dry-run workspace owned by `owner`, linked to the sandbox repo via the Relay Dev installation. */
export async function makeSandboxWorkspace(owner: TestUser | null = null) {
  const o = owner ?? (await login(TEST_OWNER, 'Owner'));
  const created = await call(createWorkspace, { as: o, body: { name: 'Sandbox', timezone: 'UTC' } });
  const wsId = created.data.workspace.id as string;
  const gh = await sandboxOctokit();
  const { data: repo } = await gh.rest.repos.get({ owner: TEST_OWNER, repo: TEST_NAME });
  await db()
    .update(schema.workspaces)
    .set({ githubInstallationId: await sandboxInstallationId(), repoOwner: TEST_OWNER, repoName: TEST_NAME, defaultBranch: repo.default_branch, dryRun: true })
    .where(eq(schema.workspaces.id, wsId));
  const [workspace] = await db().select().from(schema.workspaces).where(eq(schema.workspaces.id, wsId));
  const [member] = await db().select().from(schema.members).where(and(eq(schema.members.workspaceId, wsId), eq(schema.members.role, 'owner')));
  return { owner: o, wsId, workspace: workspace!, member: member!, gh };
}

/** Close every open test issue and delete test branches (SPEC §22.1 teardown). */
export async function cleanSandbox(gh: GH) {
  const ref = { owner: TEST_OWNER, repo: TEST_NAME };
  const issues = await gh.paginate(gh.rest.issues.listForRepo, { ...ref, labels: TEST_LABEL, state: 'open', per_page: 100 });
  for (const i of issues) {
    if (i.pull_request) continue;
    await gh.rest.issues.update({ ...ref, issue_number: i.number, state: 'closed' });
  }
  const branches = await gh.paginate(gh.rest.repos.listBranches, { ...ref, per_page: 100 });
  for (const b of branches) {
    if (b.name.startsWith('claude/relay-test') || b.name.startsWith('relay-test/')) {
      await gh.rest.git.deleteRef({ ...ref, ref: `heads/${b.name}` }).catch(() => {});
    }
  }
}
