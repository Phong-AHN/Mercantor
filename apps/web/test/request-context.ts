/**
 * The mutable "current request" an integration test is acting as. Each test
 * calls `actingAs(token)` before invoking a server action, exactly the way a
 * real request would carry one session cookie.
 *
 * A module-level variable is safe here only because integration tests run
 * with `fileParallelism: false` - one file's tests never interleave with
 * another's.
 */
let sessionToken: string | undefined;
let requestHeaders: Record<string, string> = {};

export function actingAs(token: string | undefined): void {
  sessionToken = token;
}

export function currentSessionToken(): string | undefined {
  return sessionToken;
}

export function withHeaders(headers: Record<string, string>): void {
  requestHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

export function currentHeaders(): Record<string, string> {
  return requestHeaders;
}

export function resetRequestContext(): void {
  sessionToken = undefined;
  requestHeaders = {};
}
