import type { Metadata } from 'next';
import { env } from '@/lib/env';
import { requirePageMember } from '@/lib/page-auth';
import { ROUTINE_PROMPT } from '@/lib/routine-prompt.generated';
import { StartChecklist } from './start-checklist';

export const metadata: Metadata = { title: 'Getting started' };

export default async function StartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member } = await requirePageMember(id);
  const t = env().RELAY_DEMO_TEMPLATE_REPO?.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') ?? null;
  return <StartChecklist workspaceId={id} owner={member.role === 'owner'} prompt={ROUTINE_PROMPT} templateRepo={t} />;
}
