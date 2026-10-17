import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/shell';

export const metadata: Metadata = { title: 'Try Relay on your own project', description: 'A step-by-step guide to setting up Relay with your GitHub repository and Claude subscription.' };

const STEPS: { title: string; why: string; body: React.ReactNode }[] = [
  { title: 'Sign in with GitHub', why: 'So tasks and results are attributed to you.', body: 'Use “Sign in with GitHub” on the home page. Relay reads your name and email address only.' },
  { title: 'Create a workspace', why: 'A workspace is one team and one repository.', body: 'Give it a name. You become its owner and can invite teammates with a link.' },
  {
    title: 'Connect a repository',
    why: 'Every task is a GitHub issue in this repository.',
    body: (
      <>
        Click <b>Install Relay GitHub App</b> and choose <i>one</i> repository, then pick it in Relay. No project handy? Create a copy of the Relay demo repo from the link on that step. Relay creates its labels (<code>relay</code>, <code>relay:high</code> …) for you.
      </>
    ),
  },
  {
    title: 'Connect your Claude seat',
    why: 'Your routine runs the work on your own Claude subscription.',
    body: (
      <>
        On{' '}
        <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer">
          claude.ai/code/routines
        </a>
        , create a routine named <code>Relay worker</code> for the same repository, paste the prompt Relay shows you, add an <b>API trigger</b>, then paste its URL and token into Relay. They’re stored encrypted and never shown again. “Send test run” is optional and uses one routine run.
      </>
    ),
  },
  { title: 'Set your windows', why: 'Relay only runs work when you’re not using your seat.', body: 'Confirm your time zone and off-hours (default 19:00–08:00), the minutes before your 5-hour limit resets, and the reserve Relay must leave untouched.' },
  {
    title: 'Usage data (optional, recommended)',
    why: 'Lets Relay see your real 5-hour usage so it never overspends.',
    body: 'Create a usage token, download the tiny statusLine script, and add the snippet to ~/.claude/settings.json. Without it, you can set your usage by hand with a slider.',
  },
  { title: 'Try it now', why: 'See a result without waiting for tonight.', body: 'Create the sample task, then press Run now or open a 60-minute test window. In Dry run mode nothing is fired, so it’s a free rehearsal. Runs on a real routine take a few minutes.' },
  { title: 'Explore sharing (optional)', why: 'Layer 2: idle seats help teammates.', body: 'Turn on demo mode to add simulated teammates (always labeled Simulated). Real teammates join by invite link and opt in to sharing on their own seat.' },
];

export default function GuidePage() {
  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-3xl px-6 pb-16 pt-6">
        <h1 className="font-display text-3xl font-semibold">Try Relay on your own project</h1>
        <p className="mt-3 text-muted">Relay is public: you bring your own GitHub account, repository, and Claude plan. Nothing depends on the people who built it.</p>
        <ol className="mt-8 flex flex-col gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{i + 1}</span>
              <div className="prose-relay">
                <h2 className="!mt-0 text-lg">{s.title}</h2>
                <p className="text-sm text-faint">Why: {s.why}</p>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-sm text-muted">
          Known limits: routine runs take minutes, routines are a research preview, and Team/Enterprise owners can disable routines. <Link href="/privacy" className="text-primary underline">What Relay stores</Link>.
        </p>
      </main>
    </SiteShell>
  );
}
