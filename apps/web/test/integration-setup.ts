import { vi } from 'vitest';
import { currentHeaders, currentSessionToken } from './request-context';

/**
 * `packages/integrations/src/registry.ts` falls back to these three env vars
 * when an organization has not configured its own credentials - the whole
 * point being that AHN's own shared Slack/ClickUp/Resend account still works
 * without every organization pasting a token first. A developer's real
 * `.env` has real values for exactly this reason. Without blanking them
 * here, no test fixture organization has a configured `OrganizationIntegration`
 * row (nothing here creates one unless a test deliberately does), so every
 * one of them would fall through to these real, working credentials and
 * integration tests would post real Slack messages, create real ClickUp
 * tasks and send real email - not a mock, a live outbound call, on every
 * test run. Delete rather than merely ignore: `env()` reads `process.env`
 * directly, so anything still set here is still live no matter what this
 * file's own mocks do elsewhere.
 */
delete process.env.SLACK_BOT_TOKEN;
delete process.env.CLICKUP_API_TOKEN;
delete process.env.CLICKUP_TEAM_ID;
delete process.env.RESEND_API_KEY;

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
