'use client';

import { RoutineWizard, SeatControls, SeatSection, UsageSetup, WindowsForm, useMe } from '@/components/app/seat-forms';
import { useBoard } from '@/lib/client/use-board';

export function MySeat({ workspaceId, prompt }: { workspaceId: string; prompt: string }) {
  const { data: board } = useBoard(workspaceId);
  const me = useMe(board);
  if (!board || !me) return <p className="text-sm text-muted" role="status">Loading…</p>;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">My seat</h1>
        <p className="mt-1 text-sm text-muted">Your Claude subscription, your rules. Relay only runs work on your seat inside the windows you set.</p>
      </div>
      <SeatSection title="Sharing and pause">
        <SeatControls me={me} workspaceId={workspaceId} now={board.now} />
      </SeatSection>
      <SeatSection title="Run windows" description="Off-hours in your time zone, plus the last minutes before your 5-hour limit resets.">
        {/* key forces a fresh form when saved values change elsewhere */}
        <WindowsForm key={`${me.timezone}${me.offHoursStart}${me.offHoursEnd}${me.beforeResetMinutes}${me.reservePct}${me.maxConcurrent}`} me={me} workspaceId={workspaceId} />
      </SeatSection>
      <SeatSection title="Claude routine" description="One “Relay worker” routine on your own Claude account. Credentials are encrypted and never shown again.">
        <RoutineWizard me={me} workspaceId={workspaceId} repo={board.workspace.repo} prompt={prompt} dryRun={board.workspace.dryRun} />
      </SeatSection>
      <SeatSection title="Usage data" description="Lets Relay see your real 5-hour usage so it never overspends your reserve.">
        <UsageSetup me={me} workspaceId={workspaceId} />
      </SeatSection>
    </div>
  );
}
