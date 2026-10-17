import type { Metadata } from 'next';
import { requirePageMember } from '@/lib/page-auth';
import { ROUTINE_PROMPT } from '@/lib/routine-prompt.generated';
import { MySeat } from './my-seat';

export const metadata: Metadata = { title: 'My seat' };

export default async function MePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(id);
  return <MySeat workspaceId={id} prompt={ROUTINE_PROMPT} />;
}
