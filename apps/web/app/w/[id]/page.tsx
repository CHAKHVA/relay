import type { Metadata } from 'next';
import { Board } from '@/components/app/board';
import { requirePageMember } from '@/lib/page-auth';

export const metadata: Metadata = { title: 'Board' };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(id);
  return <Board workspaceId={id} />;
}
