import { describe, expect, it } from 'vitest';
import { isPermanentSlackLookupFailure } from './integrations';

/**
 * A transient Slack lookup failure (rate limit, outage) must never be
 * treated the same as "this person genuinely has no Slack account" - the
 * former is retryable and the latter is a permanent skip, and conflating
 * them marks a real delivery `SKIPPED` forever instead of letting the
 * two-minute sweep retry it.
 */
describe('isPermanentSlackLookupFailure', () => {
  it('is not permanent when the lookup itself failed but is retryable', () => {
    expect(
      isPermanentSlackLookupFailure({
        code: 'UNAVAILABLE',
        userMessage: 'Slack could not be reached.',
        retryable: true,
      }),
    ).toBe(false);
  });

  it('is permanent for a genuine "no Slack account" result', () => {
    expect(
      isPermanentSlackLookupFailure({
        code: 'NOT_FOUND',
        userMessage: 'No Slack account is registered for that email.',
        retryable: false,
      }),
    ).toBe(true);
  });

  it('defaults to not permanent when there is no error at all', () => {
    expect(isPermanentSlackLookupFailure(undefined)).toBe(false);
  });
});
