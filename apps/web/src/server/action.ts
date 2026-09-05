import type { z } from 'zod';
import { logger } from '@relay/observability';
import { isAppError, PreconditionFailedError, toAppError, ValidationError } from '@relay/core';
import { assertCan, type Permission, type Principal } from '@relay/rbac';
import { requirePrincipal, requestMeta } from './session';

/**
 * Uniform result shape for every server action. Screens render `error` and
 * `fieldErrors` without knowing which action produced them, which is what keeps
 * error handling consistent instead of re-invented per form.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function actionOk<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export interface ActionContext {
  principal: Principal;
  ip: string | null;
  userAgent: string | null;
}

/**
 * The single entry point every mutation goes through:
 *
 *   1. authenticate  - resolve the session cookie to a principal
 *   2. authorize     - assert the declared permission, from the database role
 *   3. validate      - zod parse the input
 *   4. run           - the handler, which receives only typed, checked values
 *
 * A handler cannot skip a step, because it never sees the raw input and never
 * builds its own principal.
 */
export function defineAction<Input extends z.ZodTypeAny, Output>(config: {
  name: string;
  permission: Permission | Permission[];
  input: Input;
  handler: (input: z.infer<Input>, ctx: ActionContext) => Promise<ActionResult<Output>>;
}) {
  return async (raw: unknown): Promise<ActionResult<Output>> => {
    try {
      const principal = await requirePrincipal();

      const permissions = Array.isArray(config.permission)
        ? config.permission
        : [config.permission];
      for (const permission of permissions)
        assertCan(principal, permission, { action: config.name });

      const parsed = config.input.safeParse(raw);
      if (!parsed.success) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path.join('.') || '_';
          (fieldErrors[key] ??= []).push(issue.message);
        }
        throw new ValidationError('Some fields need attention.', fieldErrors);
      }

      const meta = await requestMeta();
      return await config.handler(parsed.data, { principal, ...meta });
    } catch (error) {
      const appError = toAppError(error);
      if (!isAppError(error) || appError.status >= 500) {
        logger.error({ err: error, action: config.name }, 'server action failed');
      }
      // A precondition failure carries a list rather than per-field messages;
      // it rides in the same envelope under a reserved key so callers only ever
      // deal with one error shape.
      const fieldErrors =
        error instanceof ValidationError
          ? error.fieldErrors
          : error instanceof PreconditionFailedError
            ? { __unmet: error.unmet }
            : undefined;

      return { ok: false, error: appError.userMessage, code: appError.code, fieldErrors };
    }
  };
}

/** Reads a `FormData` into a plain object, dropping empty optional strings. */
export function formValues(form: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (value instanceof File) continue;
    const trimmed = value.trim();
    if (trimmed === '') continue;
    const existing = values[key];
    if (existing === undefined) {
      values[key] = trimmed;
    } else if (Array.isArray(existing)) {
      existing.push(trimmed);
    } else {
      values[key] = [existing, trimmed];
    }
  }
  return values;
}
