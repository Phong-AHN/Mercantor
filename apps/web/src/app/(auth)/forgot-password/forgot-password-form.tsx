'use client';

import { useActionState } from 'react';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { Alert, Button, Field, Input } from '@relay/ui';
import { requestPasswordResetAction } from '@/features/account/actions';
import type { ActionResult } from '@/server/action';

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult<undefined> | null, FormData>(
    requestPasswordResetAction,
    null,
  );
  const failed = state && !state.ok ? state : null;

  if (state?.ok) {
    return (
      <Alert tone="success" dense>
        <span className="flex items-start gap-2">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </span>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
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

      <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
        Send reset link
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
