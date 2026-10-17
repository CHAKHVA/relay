import { ArrowRight, GitPullRequest, Moon, Share2, Timer } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeroArt } from '@/components/site/hero-art';
import { SiteShell } from '@/components/site/shell';
import { SignInButton } from '@/components/sign-in-button';
import { getPageUser } from '@/lib/page-auth';

const STEPS = [
  { icon: GitPullRequest, title: 'Every task is a GitHub issue', body: 'Label an issue “relay”, or create one on the board. Results come back as a draft PR or a comment, attributed to you.' },
  { icon: Moon, title: 'It runs in your idle windows', body: 'After work hours, or in the last minutes before your 5-hour limit resets, Relay starts your Claude routine on your own seat.' },
  { icon: Share2, title: 'Teammates can opt in to share', body: 'When someone is out of headroom, a teammate’s idle seat can pick the task up. Fully attributed, pausable anytime, nothing is pooled.' },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getPageUser();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';
  if (user) redirect(safeNext);
  const video = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
  return (
    <SiteShell action={<SignInButton next={safeNext} size="md" />}>
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-14 pt-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-medium text-muted">
              <Timer className="size-3.5" aria-hidden="true" /> For teams on Claude Pro, Max, Team or Enterprise
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] sm:text-5xl">Make sure the AI limits your team already pays for get used.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Each person’s queued tasks run on their own Claude seat after work hours or just before their limits reset. Members who opt in let their idle seat pick up teammates’ tasks automatically.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <SignInButton next={safeNext} />
              <Link href="/guide" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                See how it works <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-faint">Takes about five minutes. Works on your own repo, with your own subscription.</p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <HeroArt />
          </div>
        </section>

        <section aria-labelledby="how" className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-6 py-12">
            <h2 id="how" className="font-display text-2xl font-semibold">
              How it works
            </h2>
            <ol className="mt-6 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold">
                      {i + 1}. {s.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="need" className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 md:grid-cols-2">
          <div>
            <h2 id="need" className="font-display text-2xl font-semibold">
              What you need
            </h2>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-muted">
              <li>A GitHub account and a repository you can install apps on (or a copy of our demo repo).</li>
              <li>A Claude Pro, Max, Team or Enterprise plan with Claude Code routines.</li>
              <li>About five minutes to follow the getting-started checklist.</li>
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold">Built to be trusted</h2>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-muted">
              <li>Your routine runs on your account. Relay never calls an AI model itself.</li>
              <li>Every action on GitHub is attributed. Sharing is opt-in and pausable.</li>
              <li>Relay keeps a reserve of your limit untouched, and shows every figure as an estimate.</li>
            </ul>
          </div>
        </section>

        {video ? (
          <section className="mx-auto w-full max-w-4xl px-6 pb-14">
            <div className="aspect-video overflow-hidden rounded-xl border border-line">
              <iframe className="size-full" src={video} title="Relay in 60 seconds" allow="fullscreen; picture-in-picture" loading="lazy" />
            </div>
          </section>
        ) : null}
      </main>
    </SiteShell>
  );
}
