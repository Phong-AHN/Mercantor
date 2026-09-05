/**
 * One error base with a stable machine code, an HTTP status, a message that is
 * safe to render, and structured context that never is. Carried over from AHN
 * Orbit, where the split stopped provider messages leaking to users.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ILLEGAL_TRANSITION'
  | 'PRECONDITION_FAILED'
  | 'INTEGRATION_UNAVAILABLE'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to display verbatim. */
  readonly userMessage: string;
  /** For logs and support. Never serialised into an API response. */
  readonly context: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    status: number,
    userMessage: string,
    context: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(`${code}: ${userMessage}`, options);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.context = context;
  }

  /** The wire shape. Context is deliberately absent. */
  toJSON(): { error: { code: ErrorCode; message: string } } {
    return { error: { code: this.code, message: this.userMessage } };
  }
}

export class UnauthenticatedError extends AppError {
  constructor(context: Record<string, unknown> = {}) {
    super('UNAUTHENTICATED', 401, 'Please sign in to continue.', context);
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = 'You do not have permission to do that.', context = {}) {
    super('FORBIDDEN', 403, userMessage, context);
  }
}

/**
 * Deliberately a 404, not a 403: telling someone a record exists but is not
 * theirs is itself a disclosure. Cross-tenant reads answer this.
 */
export class NotFoundError extends AppError {
  constructor(userMessage = 'Not found.', context = {}) {
    super('NOT_FOUND', 404, userMessage, context);
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    userMessage = 'Some fields need attention.',
    fieldErrors: Record<string, string[]> = {},
    context = {},
  ) {
    super('VALIDATION_FAILED', 422, userMessage, context);
    this.fieldErrors = fieldErrors;
  }

  override toJSON() {
    return {
      error: { code: this.code, message: this.userMessage, fields: this.fieldErrors },
    };
  }
}

export class ConflictError extends AppError {
  constructor(userMessage = 'That conflicts with the current state.', context = {}) {
    super('CONFLICT', 409, userMessage, context);
  }
}

export class IllegalTransitionError extends AppError {
  constructor(userMessage: string, context = {}) {
    super('ILLEGAL_TRANSITION', 409, userMessage, context);
  }
}

export class PreconditionFailedError extends AppError {
  readonly unmet: string[];

  constructor(userMessage: string, unmet: string[] = [], context = {}) {
    super('PRECONDITION_FAILED', 412, userMessage, context);
    this.unmet = unmet;
  }

  override toJSON() {
    return { error: { code: this.code, message: this.userMessage, unmet: this.unmet } };
  }
}

export class IntegrationUnavailableError extends AppError {
  constructor(provider: string, context = {}) {
    super(
      'INTEGRATION_UNAVAILABLE',
      503,
      `${provider} is not reachable right now. The update was saved and will be delivered when it recovers.`,
      { provider, ...context },
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Anything unexpected becomes a 500 with no internal detail attached. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return new AppError(
    'INTERNAL',
    500,
    'Something went wrong on our side. The team has been notified.',
    { original: error instanceof Error ? error.message : String(error) },
    { cause: error },
  );
}
