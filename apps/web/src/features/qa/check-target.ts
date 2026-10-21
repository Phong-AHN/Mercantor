import { isSameSite } from '@relay/storefront';

/**
 * Where a page is checked: the same page on the NEW store.
 *
 * Pages are listed by whatever address someone pasted, usually the current
 * store's, because that is the site that exists when the project starts. But
 * the checks (content QA, broken links, performance) are about the product
 * we are delivering, so they always run against the after store: the page's
 * path and query, on the destination's origin. A page already on the
 * destination is checked as it is. No destination yet means nothing to check
 * - never a silent fall back to the store being replaced.
 */
export function checkTargetFor(pageUrl: string, destinationUrl: string | null): string | null {
  if (!destinationUrl) return null;
  let page: URL;
  let destination: URL;
  try {
    page = new URL(pageUrl);
    destination = new URL(destinationUrl);
  } catch {
    return null;
  }
  if (isSameSite(pageUrl, destinationUrl)) return page.toString();
  return new URL(`${page.pathname}${page.search}`, destination.origin).toString();
}
