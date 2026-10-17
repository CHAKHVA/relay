import { requireMember } from '@/lib/access';
import { json, route } from '@/lib/http';
import { onboardingSteps } from '@/lib/services/onboarding';

export const GET = route<{ id: string }>(async (req, { id }) => {
  const { workspace, member } = await requireMember(req, id);
  return json(await onboardingSteps(workspace, member));
});
