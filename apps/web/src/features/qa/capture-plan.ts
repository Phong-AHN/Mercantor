import type { CapturePhase } from '@relay/core';

/**
 * Where an automated capture of a page is taken from.
 *
 * A page is registered once, under whichever host it was added with. The
 * BEFORE is the same path on the current storefront; the AFTER is the same
 * path on the new Shopline storefront. When there is no separate destination
 * (a redesign on the same domain), both come from the one URL, at different
 * times - which is exactly what a before and after of a Glow-Up is.
 */
export function captureSourceUrl(
  pageUrl: string,
  phase: CapturePhase,
  profile: { storefrontUrl: string; destinationUrl: string | null },
): string {
  const target = new URL(pageUrl);
  const origin =
    phase === 'AFTER' && profile.destinationUrl
      ? new URL(profile.destinationUrl).origin
      : new URL(profile.storefrontUrl).origin;
  return new URL(`${target.pathname}${target.search}`, origin).toString();
}

export const VIEWPORTS = {
  DESKTOP: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  MOBILE: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;

/** CSS pixels. A homepage longer than this is cut off rather than producing a 40 MB image. */
export const MAX_CAPTURE_HEIGHT = { DESKTOP: 10_000, MOBILE: 9_000 } as const;
