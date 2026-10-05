import { z } from 'zod';

/**
 * The input of `updateMerchantAction`. Lives outside `actions.ts` because
 * that file is `'use server'`, and Next's server-action compiler rejects any
 * non-async function defined there - including the `.transform` callbacks
 * below - with "Server Actions must be async functions".
 */

/** Trimmed; empty means "clear the value". */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);
}

export const updateMerchantInput = z.object({
  code: z.string().min(1),
  name: z.string().trim().min(2, 'Enter the merchant name.').max(200),
  website: z
    .string()
    .trim()
    .url('Enter a valid website URL, starting with https://.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || null),
  shoplineStoreId: optionalText(60),
  currentPlatform: optionalText(80),
  country: optionalText(80),
  industry: optionalText(80),
  notes: optionalText(4000),
  contact: z.object({
    name: z.string().trim().min(2, 'Enter the contact name.').max(120),
    email: z.string().trim().email('Enter a valid email address.'),
    phone: optionalText(40),
    title: optionalText(80),
  }),
});
