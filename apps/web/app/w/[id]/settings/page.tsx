import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageMember } from '@/lib/page-auth';
import { env } from '@/lib/env';
import { SettingsView } from './settings-view';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member } = await requirePageMember(id);
  if (member.role !== 'owner') notFound();
  const t = env().RELAY_DEMO_TEMPLATE_REPO?.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') ?? null;
  return <SettingsView workspaceId={id} templateRepo={t} />;
}
