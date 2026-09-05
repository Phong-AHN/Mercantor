import { vi } from 'vitest';
import { currentHeaders, currentSessionToken } from './request-context';

/**
 * Every server action goes through `next/headers` (the session cookie,
 * `x-forwarded-for`) and `next/cache` (`revalidatePath` after a mutation).
 * Both require a live Next.js request, which does not exist in a Vitest
 * process. Stubbing them here is what lets integration tests call the exact
 * exported action functions - `openBlockerAction`, `submitHandoffAction` and
 * so on - instead of a parallel copy of their logic.
 *
 * `vi.mock` calls in a setup file apply to the whole worker's module graph,
 * so every test file in this run sees the same stub.
 */
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name !== 'relay_session') return undefined;
      const token = currentSessionToken();
      return token ? { name, value: token } : undefined;
    },
    set: () => {},
    delete: () => {},
  }),
  headers: async () => {
    const stored = currentHeaders();
    return {
      get: (name: string) => stored[name.toLowerCase()] ?? null,
    };
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`Unexpected redirect to ${url} inside an integration test.`);
  },
}));

// `server-only` relies on webpack swapping in a no-op for server bundles; run
// under plain Node (as Vitest does) it always throws. Every `queries.ts` and
// `mutations.ts` file imports it deliberately, so this has to be a no-op here
// rather than removed there.
vi.mock('server-only', () => ({}));
