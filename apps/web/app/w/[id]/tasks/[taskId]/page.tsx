import type { Metadata } from 'next';
import { requirePageMember } from '@/lib/page-auth';
import { TaskDetail } from './task-detail';

export const metadata: Metadata = { title: 'Task' };

export default async function TaskPage({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  await requirePageMember(id);
  return <TaskDetail workspaceId={id} taskId={taskId} />;
}
