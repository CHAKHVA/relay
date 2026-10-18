import type { Metadata } from 'next';
import { requirePageMember } from '@/lib/page-auth';
import { RecurringView } from './recurring-view';

export const metadata: Metadata = { title: 'Recurring' };

export default async function RecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(id);
  return <RecurringView workspaceId={id} />;
}
