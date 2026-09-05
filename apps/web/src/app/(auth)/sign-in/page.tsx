import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CircleCheck } from 'lucide-react';
import { landingPathFor } from '@relay/rbac';
import { getPrincipal } from '@/server/session';
import { SignInForm } from './sign-in-form';
import { DemoAccounts } from './demo-accounts';

export const metadata: Metadata = { title: 'Sign in' };

const PROMISES = [
  'Where every migration stands, without asking.',
  'Who owns the next step, and how long they have owned it.',
  'What is blocking launch, with the clock running on it.',
  'Whether the merchant approved, and whether AHN has been paid.',
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const principal = await getPrincipal();
  if (principal) redirect(landingPathFor(principal));

  const { next } = await searchParams;

  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel. Hidden on small screens - it is atmosphere, not content. */}
      <section className="bg-ink relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-[0.18]" aria-hidden />
        <div
          className="absolute -left-32 -top-40 size-[540px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, oklch(0.55 0.2 275), transparent 68%)' }}
          aria-hidden
        />
        <div
          className="absolute -bottom-48 -right-32 size-[520px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, oklch(0.62 0.15 245), transparent 70%)' }}
          aria-hidden
        />

        <div className="relative p-12">
          <div className="flex items-center gap-3">
            <RelayMark />
            <div>
              <p className="text-[15px] font-semibold leading-5 tracking-tight">Relay</p>
              <p className="text-[12px] leading-4 text-white/55">AHN &times; SHOPLINE</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-lg p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            Migration project portal
          </p>
          <h1 className="mt-4 text-balance text-[38px] font-semibold leading-[1.1] tracking-tight">
            One merchant. One project record. One source of truth.
          </h1>
          <ul className="mt-8 space-y-3">
            {PROMISES.map((promise) => (
              <li key={promise} className="flex items-start gap-3 text-[14px] text-white/75">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-white/45" />
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative p-12">
          <p className="text-[12px] text-white/40">
            Slack, ClickUp and email are integrations around this record - not separate places where
            project status lives.
          </p>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <RelayMark tone="dark" />
            <div>
              <p className="text-ink text-[15px] font-semibold leading-5 tracking-tight">Relay</p>
              <p className="text-muted text-[12px] leading-4">AHN &times; SHOPLINE</p>
            </div>
          </div>

          <h2 className="text-ink text-[22px] font-semibold leading-7 tracking-tight">
            Sign in to the portal
          </h2>
          <p className="text-muted mb-7 mt-1.5 text-[13.5px]">
            Use the account your project lead issued you.
          </p>

          <SignInForm next={next} />
          <DemoAccounts />
        </div>
      </section>
    </main>
  );
}

function RelayMark({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`grid size-9 place-items-center rounded-[11px] ${
        tone === 'light' ? 'bg-white/10 ring-1 ring-white/20' : 'bg-accent'
      }`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M5 17V9.5A4.5 4.5 0 0 1 9.5 5H12"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          className={tone === 'light' ? 'text-white' : 'text-white'}
        />
        <path
          d="M19 7v7.5a4.5 4.5 0 0 1-4.5 4.5H12"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          className={tone === 'light' ? 'text-white/55' : 'text-white/60'}
        />
      </svg>
    </span>
  );
}
