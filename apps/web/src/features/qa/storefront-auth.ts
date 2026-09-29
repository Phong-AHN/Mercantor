import { decryptSecret, encryptSecret } from '@relay/core/server';
import { env } from '@relay/config';

/**
 * Getting past a storefront's password page.
 *
 * Shopify and Shopline both put an unlaunched store behind a `/password` page
 * with an ordinary HTML form; submitting it sets a session cookie. Site QA
 * stores the password encrypted (AES-256-GCM, `CREDENTIAL_ENCRYPTION_KEY`),
 * decrypts it only on the server at the moment of a check, and never sends it
 * - or its ciphertext - to a browser.
 */

export function encryptStorefrontPassword(plain: string): string {
  return encryptSecret(plain, env().CREDENTIAL_ENCRYPTION_KEY);
}

/** Null when unset, or when the value no longer decrypts (a rotated key): the check then reports the password page. */
export function decryptStorefrontPassword(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  try {
    return decryptSecret(encoded, env().CREDENTIAL_ENCRYPTION_KEY);
  } catch {
    return null;
  }
}

function sameSite(a: string, b: string): boolean {
  const strip = (host: string) => host.toLowerCase().replace(/^www\./, '');
  try {
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** Which saved password applies to a URL: the new storefront's on its host, else the current one's. */
export function passwordFor(
  url: string,
  profile: {
    storefrontUrl: string;
    destinationUrl: string | null;
    storefrontPasswordEnc: string | null;
    destinationPasswordEnc: string | null;
  },
): string | undefined {
  if (profile.destinationUrl && sameSite(url, profile.destinationUrl)) {
    return decryptStorefrontPassword(profile.destinationPasswordEnc) ?? undefined;
  }
  if (sameSite(url, profile.storefrontUrl)) {
    return decryptStorefrontPassword(profile.storefrontPasswordEnc) ?? undefined;
  }
  return undefined;
}
