import { redirect } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { landingPathFor } from '@relay/rbac';
import { getPrincipal } from '@/server/session';
import { AuthMark } from '../auth-mark';
import { SignInForm } from './sign-in-form';
import { DemoAccounts } from './demo-accounts';
import portfolio from '../../../../public/sign-in/portfolio-dark.png';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const principal = await getPrincipal();
  if (principal) redirect(landingPathFor(principal));

  const { next } = await searchParams;

  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* The product itself, not decoration: the real portfolio dashboard,
          bleeding off the bottom-right of the panel. Fixed dark tones in both
          themes. Hidden below lg - on a phone the form is the page. */}
      <section className="border-white/8 relative hidden overflow-hidden border-r bg-[oklch(0.165_0.005_260)] text-white lg:flex lg:flex-col">
        <div className="relative px-12 pt-12">
          <AuthMark tone="onDark" />
          <h1 className="mt-16 max-w-md text-balance text-[40px] font-semibold leading-[1.08] tracking-[-0.035em]">
            Every migration, one shared record.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-6 text-white/65">
            Where each SHOPLINE move stands, who owns the next step, and what is blocking launch.
          </p>
        </div>

        <div className="relative mt-12 flex-1">
          <div className="border-white/12 absolute left-12 top-0 w-[1100px] overflow-hidden rounded-tl-[var(--radius-2xl)] border-l border-t shadow-[0_-24px_80px_-24px_oklch(0_0_0/0.8)]">
            <Image
              src={portfolio}
              alt="The Mercantor portfolio dashboard: projects by stage, health and ageing."
              sizes="1100px"
              placeholder="blur"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <AuthMark tone="onCanvas" />
          </div>

          <h2 className="text-ink text-[24px] font-semibold leading-8 tracking-[-0.025em]">
            Sign in
          </h2>
          <p className="text-muted mb-8 mt-1.5 text-[13.5px]">
            Use the account your project lead issued you.
          </p>

          <SignInForm next={next} />
          <DemoAccounts />
        </div>
      </section>
    </main>
  );
}
