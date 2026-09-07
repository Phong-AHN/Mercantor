'use client';

import { useActionState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Alert, Button, Field, Input } from '@relay/ui';
import { signInAction } from '@/features/auth/actions';
import type { ActionResult } from '@/server/action';

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<never> | null, FormData>(
    signInAction,
    null,
  );
  const failed = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {failed && !failed.fieldErrors && (
        <Alert tone="danger" dense>
          {failed.error}
        </Alert>
      )}

      <Field label="Work email" htmlFor="email" required error={failed?.fieldErrors?.email ?? null}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@ahnmedia.com"
          required
          autoFocus
          aria-invalid={Boolean(failed?.fieldErrors?.email)}
        />
      </Field>

      <Field
        label={
          <span className="flex items-center justify-between gap-2">
            Password
            <a
              href="/forgot-password"
              className="text-accent-ink text-[12px] font-normal underline-offset-4 hover:underline"
            >
              Forgot password?
            </a>
          </span>
        }
        htmlFor="password"
        required
        error={failed?.fieldErrors?.password ?? null}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          required
          aria-invalid={Boolean(failed?.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
        Sign in
        <ArrowRight className="size-4" />
      </Button>

      <p className="text-muted text-center text-[12px]">
        Access is granted by an administrator. Contact your AHN or SHOPLINE lead if you cannot get
        in.
      </p>
    </form>
  );
}
