import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { SignInButton } from '@/components/sign-in-button';
import { getPageUser } from '@/lib/page-auth';

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getPageUser();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';
  if (user) redirect(safeNext);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <Logo />
      <h1 className="text-4xl font-semibold">Make sure the AI limits your team already pays for get used.</h1>
      <SignInButton next={safeNext} />
      <Link href="/guide" className="text-primary underline">How it works</Link>
    </main>
  );
}
