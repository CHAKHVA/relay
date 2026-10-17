import type { Metadata } from 'next';
import { requirePageMember } from '@/lib/page-auth';
import { TeamTable } from './team-table';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(id);
  return <TeamTable workspaceId={id} />;
}
