import type { Metadata } from 'next';
import { requirePageMember } from '@/lib/page-auth';
import { DigestView } from './digest-view';

export const metadata: Metadata = { title: 'Digest' };

export default async function DigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(id);
  return <DigestView workspaceId={id} />;
}
