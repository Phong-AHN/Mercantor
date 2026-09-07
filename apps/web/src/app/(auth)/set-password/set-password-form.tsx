'use client';

import { useActionState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Alert, Button, Field, Input } from '@relay/ui';
import { setPasswordAction } from '@/features/account/actions';
import type { ActionResult } from '@/server/action';

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<never> | null, FormData>(
    setPasswordAction,
    null,
  );
  const failed = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      {failed && !failed.fieldErrors && (
        <Alert tone="danger" dense>
          {failed.error}
        </Alert>
      )}

      <Field
        label="New password"
        htmlFor="password"
        required
        hint="At least 12 characters."
        error={failed?.fieldErrors?.password ?? null}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={12}
          aria-invalid={Boolean(failed?.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
        Set password
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
