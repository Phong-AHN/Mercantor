/**
 * Storefront QA — the parts that are pure functions.
 *
 * Everything here runs without a browser, a network or a database, which is
 * what makes the crawler's decisions testable: what counts as one page, what
 * kind of page it is, what platform built it, what is wrong with it, and
 * whether a problem is the same one as yesterday.
 *
 * The browser work (Playwright), the storage of screenshots and the writing of
 * rows live in the worker, on top of this.
 */

export { normaliseUrl, isSameSite, matchesPattern, shouldCrawl } from './url';
export type { NormaliseOptions } from './url';

export { classifyPageType, perfTemplateFor, pickPerfTargets, PERF_TEMPLATES } from './classify';
export type { PageType, PerfTemplate } from './classify';

export { detectStorefront, detectApps, classifyBuild } from './detect';
export type {
  Detection,
  DetectedSignal,
  StorefrontSignals,
  StorefrontPlatform,
  StorefrontBuild,
} from './detect';

export { checkPage, checkSite, fingerprint } from './checks';
export type { PageDocument, CheckFinding, FindingCategory, FindingSeverity } from './checks';

export {
  describeMetric,
  formatMetricValue,
  comparable,
  headlineMetrics,
  metricFreshness,
  indexSummary,
} from './showcase';
export type {
  MetricPair,
  MetricDelta,
  MetricDirection,
  PerfSample,
  IndexInput,
} from './showcase';
