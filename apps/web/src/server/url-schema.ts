import { z } from 'zod';

/**
 * A URL somebody types that the app will later render as a link.
 *
 * `z.string().url()` alone accepts any scheme the URL parser does -
 * `javascript:alert(1)` and `data:text/html,...` included - and these values
 * end up in `<a href>` for everyone on the project, merchants too. Only web
 * links are kept. Lives outside the `'use server'` action files because
 * Next's server-action compiler rejects the non-async `refine` callback
 * there.
 */
export function httpUrl(message: string) {
  return z
    .string()
    .trim()
    .url(message)
    .refine((value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === 'https:' || protocol === 'http:';
      } catch {
        return false;
      }
    }, message);
}
