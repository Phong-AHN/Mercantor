/**
 * Split out of `actions.ts` on purpose: that file has `'use server'` at the
 * top, and every top-level export from a `'use server'` file has to be an
 * async function - Next.js turns each one into a server action reference.
 * A plain array survived the server build but broke at runtime the moment a
 * Client Component imported it (`INVITABLE_ROLE_OPTIONS.map is not a
 * function`), because the client only ever receives a callable reference,
 * not the value. Shared, non-`'use server'` data both sides need lives here
 * instead.
 */

/**
 * Deliberately narrower than `USER_ROLES`: `MERCHANT` goes through
 * `inviteMerchantAction` instead (project-scoped, gated by `merchant:manage`
 * rather than the org-wide `user:manage`), and `PLATFORM_ADMIN` is not
 * grantable through this form at all - `user:manage` is already fairly
 * broad, and letting anyone who holds it mint the one role with unrestricted
 * reach is a real privilege-escalation path this form should not open.
 */
export const INVITABLE_ROLES = [
  'AHN_ADMIN',
  'AHN_PROJECT_MANAGER',
  'AHN_DEVELOPER',
  'SHOPLINE_ADMIN',
  'SHOPLINE_ACCOUNT_MANAGER',
  'SHOPLINE_SOLUTIONS_ENGINEER',
] as const;
