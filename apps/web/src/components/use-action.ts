'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@relay/ui';
import type { ActionResult } from '@/server/action';

/**
 * One hook behind every mutation form. It owns the three things each of them
 * needs and none of them should re-implement: the pending flag, the field
 * errors the server returned, and the toast plus refresh on success.
 */
export interface UseAction<Input, Output> {
  run: (input: Input) => Promise<ActionResult<Output>>;
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]>;
  /** Extra detail some errors carry, e.g. unmet handoff preconditions. */
  unmet: string[];
  reset: () => void;
}

export function useAction<Input, Output>(
  action: (input: Input) => Promise<ActionResult<Output>>,
  options: {
    onSuccess?: (data: Output, message?: string) => void;
    successMessage?: string;
    /** Set false for actions whose result is already on screen. */
    toastOnSuccess?: boolean;
    refresh?: boolean;
  } = {},
): UseAction<Input, Output> {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [unmet, setUnmet] = useState<string[]>([]);

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
    setUnmet([]);
  }, []);

  const run = useCallback(
    async (input: Input) => {
      setBusy(true);
      reset();
      try {
        const result = await action(input);
        if (result.ok) {
          if (options.toastOnSuccess !== false) {
            toast.success(options.successMessage ?? result.message ?? 'Saved.');
          }
          options.onSuccess?.(result.data, result.message);
          if (options.refresh !== false) startTransition(() => router.refresh());
        } else {
          setError(result.error);
          setFieldErrors(result.fieldErrors ?? {});
          // `unmet` rides along on precondition failures; the server puts the
          // list in fieldErrors under a reserved key so the envelope stays flat.
          setUnmet(result.fieldErrors?.__unmet ?? []);
          if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) {
            toast.error(result.error);
          }
        }
        return result;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'That did not work. Try again.';
        setError(message);
        toast.error('Something went wrong', message);
        return { ok: false as const, error: message };
      } finally {
        setBusy(false);
      }
    },
    [action, options, reset, router, toast],
  );

  return { run, pending: pending || busy, error, fieldErrors, unmet, reset };
}
