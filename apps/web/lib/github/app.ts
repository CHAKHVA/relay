import { Webhooks } from '@octokit/webhooks';
import { App, Octokit } from 'octokit';
import { env, githubPrivateKey } from '../env';

export const GITHUB_TIMEOUT_MS = 15_000;

/** fetch with a hard timeout for every GitHub call (SPEC §18). */
const timeoutFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(GITHUB_TIMEOUT_MS) });

const RelayOctokit = Octokit.defaults({ request: { fetch: timeoutFetch }, userAgent: 'relay-app' });
export type GH = InstanceType<typeof RelayOctokit>;

const g = globalThis as unknown as { __relayApp?: App; __relayWebhooks?: Webhooks };

export function githubApp(): App {
  if (!g.__relayApp) {
    const e = env();
    g.__relayApp = new App({
      appId: e.GITHUB_APP_ID,
      privateKey: githubPrivateKey(),
      Octokit: RelayOctokit,
    });
  }
  return g.__relayApp;
}

export async function installationOctokit(installationId: number): Promise<GH> {
  return (await githubApp().getInstallationOctokit(installationId)) as GH;
}

export function webhooks(): Webhooks {
  if (!g.__relayWebhooks) g.__relayWebhooks = new Webhooks({ secret: env().GITHUB_WEBHOOK_SECRET });
  return g.__relayWebhooks;
}

/** An Octokit authenticated as a signed-in user (user-to-server token), for verifying installation access. */
export function userOctokit(token: string): GH {
  return new RelayOctokit({ auth: token });
}

export function installUrl(state: string): string {
  return `https://github.com/apps/${env().GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
}
