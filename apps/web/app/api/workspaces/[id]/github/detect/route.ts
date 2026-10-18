import { z } from 'zod';
import { requireOwner } from '@/lib/access';
import { badRequest, json, parseBody, route } from '@/lib/http';
import { linkInstallation, userInstallations } from '@/lib/services/github-connect';

const bodySchema = z.object({ installationId: z.number().int().positive().optional() });

/** For users who installed the app straight from GitHub (no setup redirect): find the installation by their own token and link it. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { workspace, user } = await requireOwner(req, id);
  const { installationId } = await parseBody(req, bodySchema);
  const installs = await userInstallations(user.id, req.headers);
  if (!installs) throw badRequest('Relay could not read your GitHub sign-in. Sign out, sign in with GitHub again, then retry.', 'github_token_missing');
  if (installs.length === 0) throw badRequest('GitHub shows no Relay installation for your account yet. Install the app first.', 'no_installation');
  const chosen = installationId ? installs.find((i) => i.id === installationId) : installs.length === 1 ? installs[0] : undefined;
  if (installationId && !chosen) throw badRequest('That installation is not visible to your GitHub account.', 'installation_not_visible');
  if (!chosen) return json({ linked: false, installations: installs });
  await linkInstallation(workspace, chosen.id);
  return json({ linked: true, installations: installs });
});
