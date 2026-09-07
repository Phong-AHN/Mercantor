import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { landingPathFor } from '@relay/rbac';
import { getPrincipal } from '@/server/session';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default async function ForgotPasswordPage() {
  const principal = await getPrincipal();
  if (principal) redirect(landingPathFor(principal));

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 py-12 sm:px-10">
      <div className="w-full max-w-sm">
        <h1 className="text-ink text-[22px] font-semibold leading-7 tracking-tight">
          Forgot your password?
        </h1>
        <p className="text-muted mb-7 mt-1.5 text-[13.5px]">
          Enter your work email. If it has an account, a reset link is on its way.
        </p>

        <ForgotPasswordForm />

        <p className="text-muted mt-6 text-center text-[12.5px]">
          <a href="/sign-in" className="text-accent-ink underline-offset-4 hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
