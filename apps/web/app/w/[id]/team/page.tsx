import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { requirePageMember } from '@/lib/page-auth';
import { listMembers } from '@/lib/services/workspaces';
import { InviteButton } from './invite-button';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member: me } = await requirePageMember(id);
  const members = await listMembers(id);
  return (
    <Panel>
      <PanelHeader
        title="Team"
        description="Each member runs tasks on their own Claude seat. Sharing is opt-in per member."
        action={me.role === 'owner' ? <InviteButton workspaceId={id} /> : null}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Time zone</th>
              <th className="px-4 py-2 font-medium">Off-hours</th>
              <th className="px-4 py-2 font-medium">Sharing</th>
              <th className="px-4 py-2 font-medium">Routine</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.displayName}</span>
                    {m.githubLogin ? <span className="text-muted">@{m.githubLogin}</span> : null}
                    {m.simulated ? <Badge tone="dusk" title="Not a real seat; never runs tasks">Simulated</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">{m.role === 'owner' ? 'Owner' : 'Member'}</td>
                <td className="px-4 py-2.5">{m.timezone}</td>
                <td className="px-4 py-2.5">
                  {m.offHoursStart}–{m.offHoursEnd}
                </td>
                <td className="px-4 py-2.5">{m.sharingEnabled ? 'On' : 'Off'}</td>
                <td className="px-4 py-2.5">{m.routineConfiguredAt ? 'Configured' : m.simulated ? '—' : 'Not set up'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
