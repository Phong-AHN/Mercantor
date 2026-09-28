'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  clock,
  ConflictError,
  ENGAGEMENT_TYPES,
  STOREFRONT_BUILDS,
  STOREFRONT_PLATFORMS,
  ValidationError,
  type PageType,
} from '@relay/core';
import { db, transaction, type Prisma } from '@relay/db';
import {
  checkPage,
  classifyPageType,
  detectApps,
  detectStorefront,
  fingerprint,
  isSameSite,
  normaliseUrl,
  perfTemplateFor,
} from '@relay/storefront';
import { actionOk, defineAction } from '@/server/action';
import { audit } from '@/server/record';
import { resolveProject, revalidateProject } from '@/features/projects/mutations';
import {
  allowedHostsFor,
  fetchStorefrontPage,
  FetchRefused,
  probeUrl,
  type Device,
} from './fetch-page';
import { assetUrls, extractDocument, measureHtml } from './html';
import { PERF_METHOD } from './perf';

const PAGE_TYPE_VALUES = [
  'HOME',
  'COLLECTION',
  'PRODUCT',
  'CART',
  'CHECKOUT',
  'SEARCH',
  'ACCOUNT',
  'BLOG',
  'ARTICLE',
  'POLICY',
  'CONTENT',
  'OTHER',
] as const satisfies readonly PageType[];

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value ? value : undefined));

function requireUrl(raw: string, field: string): string {
  const url = normaliseUrl(raw);
  if (!url) {
    throw new ValidationError('That is not a web address.', {
      [field]: ['Enter a full address, e.g. https://shop.example.com'],
    });
  }
  return url;
}

function revalidateQa(code: string): void {
  revalidateProject(code);
  revalidatePath('/qa');
  revalidatePath('/findings');
  revalidatePath('/portal/qa');
}

async function loadProfile(projectId: string) {
  const profile = await db.storefrontProfile.findUnique({ where: { projectId } });
  if (!profile) {
    throw new ConflictError('Set the storefront URL for this project first.');
  }
  return profile;
}

// ─── Storefront profile ─────────────────────────────────────────────────────

/**
 * Saving the profile is also how a person confirms or corrects the detected
 * platform: a detection stays SUGGESTED until somebody saves over it, and
 * becomes CORRECTED rather than CONFIRMED when what they saved differs.
 */
export const saveStorefrontProfileAction = defineAction({
  name: 'qa.profile.save',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    storefrontUrl: z.string().trim().min(1, 'Enter the current storefront URL.').max(500),
    destinationUrl: optionalUrl,
    sourcePlatform: z.enum(STOREFRONT_PLATFORMS),
    destinationPlatform: z.enum(STOREFRONT_PLATFORMS),
    build: z.enum(STOREFRONT_BUILDS),
    themeName: z.string().trim().max(120).optional(),
    themeVersion: z.string().trim().max(40).optional(),
    engagementType: z.enum(ENGAGEMENT_TYPES).nullable().optional(),
    headline: z.string().trim().max(200).optional(),
    summary: z.string().trim().max(2000).optional(),
    serviceTags: z.string().trim().max(500).optional(),
    destinationBuildLabel: z.string().trim().max(120).optional(),
    apps: z.string().trim().max(2000).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const storefrontUrl = requireUrl(input.storefrontUrl, 'storefrontUrl');
    const destinationUrl = input.destinationUrl
      ? requireUrl(input.destinationUrl, 'destinationUrl')
      : null;
    const now = clock.now();

    await transaction(async (tx) => {
      const before = await tx.storefrontProfile.findUnique({ where: { projectId: project.id } });

      const identity = {
        sourcePlatform: input.sourcePlatform,
        build: input.build,
        themeName: input.themeName || null,
        themeVersion: input.themeVersion || null,
      };
      const changedFromSuggestion =
        before !== null &&
        (before.sourcePlatform !== identity.sourcePlatform ||
          before.build !== identity.build ||
          (before.themeName ?? null) !== identity.themeName ||
          (before.themeVersion ?? null) !== identity.themeVersion);

      const detectedApps = input.apps
        ? input.apps
            .split(/[\n,]/)
            .map((name) => name.trim())
            .filter(Boolean)
            .slice(0, 50)
            .map((name) => ({ name }))
        : undefined;

      const data = {
        storefrontUrl,
        destinationUrl,
        ...identity,
        destinationPlatform: input.destinationPlatform,
        detection: changedFromSuggestion ? ('CORRECTED' as const) : ('CONFIRMED' as const),
        confirmedById: ctx.principal.id,
        confirmedAt: now,
        engagementType: input.engagementType ?? null,
        headline: input.headline || null,
        summary: input.summary || null,
        serviceTags: (input.serviceTags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12),
        destinationBuildLabel: input.destinationBuildLabel || null,
        ...(detectedApps !== undefined
          ? { detectedApps: detectedApps as unknown as Prisma.InputJsonValue }
          : {}),
      };

      const saved = await tx.storefrontProfile.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, ...data },
        update: data,
        select: { id: true },
      });

      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.profile.save',
        entityType: 'StorefrontProfile',
        entityId: saved.id,
        before: before
          ? {
              storefrontUrl: before.storefrontUrl,
              sourcePlatform: before.sourcePlatform,
              build: before.build,
              themeName: before.themeName,
            }
          : null,
        after: { storefrontUrl, ...identity },
        ip: ctx.ip,
      });
    });

    revalidateQa(input.code);
    return actionOk(undefined, 'Storefront saved.');
  },
});

/**
 * Fetch the current storefront and suggest platform, build, theme and apps.
 * Never overwrites what a person already confirmed: the new signals are kept
 * for comparison, the confirmed answer stays.
 */
export const detectStorefrontAction = defineAction({
  name: 'qa.profile.detect',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1) }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const profile = await loadProfile(project.id);

    let page;
    try {
      page = await fetchStorefrontPage(profile.storefrontUrl, {
        allowedHosts: allowedHostsFor([profile.storefrontUrl]),
        device: 'DESKTOP',
      });
    } catch (error) {
      throw new ConflictError(
        error instanceof FetchRefused
          ? error.message
          : `Could not load ${profile.storefrontUrl}. Check the address and try again.`,
      );
    }

    const assets = assetUrls(page.html, page.finalUrl);
    const signals = {
      html: page.html,
      headers: page.headers,
      cookies: page.cookies,
      assetUrls: [...assets.scripts, ...assets.styles],
    };
    const detection = detectStorefront(signals);
    const apps = detectApps(signals);
    const confirmed = profile.detection !== 'SUGGESTED';

    await transaction(async (tx) => {
      await tx.storefrontProfile.update({
        where: { id: profile.id },
        data: {
          detectionSignals: {
            confidence: detection.confidence,
            platform: detection.platform,
            build: detection.build,
            themeName: detection.themeName,
            themeVersion: detection.themeVersion,
            signals: detection.signals,
            httpStatus: page.status,
          } as unknown as Prisma.InputJsonValue,
          detectedAt: clock.now(),
          detectedApps: apps as unknown as Prisma.InputJsonValue,
          ...(confirmed
            ? {}
            : {
                sourcePlatform: detection.platform,
                build: detection.build,
                themeName: detection.themeName,
                themeVersion: detection.themeVersion,
              }),
        },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.profile.detect',
        entityType: 'StorefrontProfile',
        entityId: profile.id,
        after: { platform: detection.platform, confidence: detection.confidence },
        ip: ctx.ip,
      });
    });

    revalidateQa(input.code);
    const differs = confirmed && detection.platform !== profile.sourcePlatform;
    return actionOk(
      { platform: detection.platform, confidence: detection.confidence },
      differs
        ? `Detected ${detection.platform}, which differs from the confirmed platform. The confirmed answer was kept.`
        : `Detected ${detection.platform} (${detection.confidence}% confidence).`,
    );
  },
});

/** Publishing puts the project on the client-facing showcase. */
export const setShowcasePublishedAction = defineAction({
  name: 'qa.profile.publish',
  permission: 'finding:approve',
  input: z.object({ code: z.string().min(1), published: z.boolean() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const profile = await loadProfile(project.id);
    await transaction(async (tx) => {
      await tx.storefrontProfile.update({
        where: { id: profile.id },
        data: { publishedAt: input.published ? clock.now() : null },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.profile.publish',
        entityType: 'StorefrontProfile',
        entityId: profile.id,
        after: { published: input.published },
        ip: ctx.ip,
      });
    });
    revalidateQa(input.code);
    return actionOk(undefined, input.published ? 'Published to the client.' : 'Unpublished.');
  },
});

// ─── Pages ──────────────────────────────────────────────────────────────────

export const addPagesAction = defineAction({
  name: 'qa.pages.add',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    urls: z.string().trim().min(1, 'Paste at least one URL.').max(20_000),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const profile = await loadProfile(project.id);
    const roots = [profile.storefrontUrl, profile.destinationUrl].filter(
      (url): url is string => !!url,
    );

    const lines = input.urls
      .split(/\s+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 200) {
      throw new ValidationError('Add up to 200 pages at a time.', {
        urls: [`You pasted ${lines.length}.`],
      });
    }

    const accepted = new Map<string, PageType>();
    const rejected: string[] = [];
    for (const line of lines) {
      const url = normaliseUrl(line, profile.storefrontUrl);
      if (!url || !roots.some((root) => isSameSite(url, root))) {
        rejected.push(line);
        continue;
      }
      accepted.set(url, classifyPageType(url));
    }

    if (accepted.size === 0) {
      throw new ValidationError('None of those are pages on this storefront.', {
        urls: ['Pages must be on the storefront or destination URL.'],
      });
    }

    const created = await transaction(async (tx) => {
      const result = await tx.storefrontPage.createMany({
        data: [...accepted].map(([url, pageType]) => ({
          projectId: project.id,
          url,
          pageType,
        })),
        skipDuplicates: true,
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.pages.add',
        entityType: 'StorefrontPage',
        after: { added: result.count, submitted: lines.length },
        ip: ctx.ip,
      });
      return result.count;
    });

    revalidateQa(input.code);
    const skipped = accepted.size - created;
    const parts = [`${created} page${created === 1 ? '' : 's'} added`];
    if (skipped > 0) parts.push(`${skipped} already listed`);
    if (rejected.length > 0) parts.push(`${rejected.length} not on this storefront`);
    return actionOk({ created, skipped, rejected }, `${parts.join(', ')}.`);
  },
});

export const updatePageAction = defineAction({
  name: 'qa.pages.update',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    pageId: z.string().uuid(),
    pageType: z.enum(PAGE_TYPE_VALUES).optional(),
    includeInScans: z.boolean().optional(),
    excludedReason: z.string().trim().max(300).optional(),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const page = await tx.storefrontPage.findFirst({
        where: { id: input.pageId, projectId: project.id },
        select: { id: true, pageType: true, includeInScans: true },
      });
      if (!page) throw new ConflictError('That page is not on this project.');

      await tx.storefrontPage.update({
        where: { id: page.id },
        data: {
          ...(input.pageType ? { pageType: input.pageType, pageTypeConfirmed: true } : {}),
          ...(input.includeInScans !== undefined
            ? {
                includeInScans: input.includeInScans,
                excludedReason: input.includeInScans ? null : input.excludedReason || null,
                state: input.includeInScans ? 'ACCESSIBLE' : 'EXCLUDED',
              }
            : {}),
        },
      });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.pages.update',
        entityType: 'StorefrontPage',
        entityId: page.id,
        before: { pageType: page.pageType, includeInScans: page.includeInScans },
        after: { pageType: input.pageType, includeInScans: input.includeInScans },
        ip: ctx.ip,
      });
    });
    revalidateQa(input.code);
    return actionOk(undefined, 'Page updated.');
  },
});

export const removePageAction = defineAction({
  name: 'qa.pages.remove',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1), pageId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    await transaction(async (tx) => {
      const page = await tx.storefrontPage.findFirst({
        where: { id: input.pageId, projectId: project.id },
        select: { id: true, url: true },
      });
      if (!page) throw new ConflictError('That page is not on this project.');
      // Findings, captures and runs keep their URL; only the link to the page row goes.
      await tx.storefrontPage.delete({ where: { id: page.id } });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.pages.remove',
        entityType: 'StorefrontPage',
        entityId: page.id,
        before: { url: page.url },
        ip: ctx.ip,
      });
    });
    revalidateQa(input.code);
    return actionOk(undefined, 'Page removed.');
  },
});

// ─── Content check ──────────────────────────────────────────────────────────

const LINK_BUDGET = 25;
const IMAGE_BUDGET = 15;

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

/**
 * Fetch one page and run the automated content checks on it.
 *
 * Findings are keyed by fingerprint, so re-checking a page never files the
 * same problem twice: it bumps `lastSeenAt` instead. A finding waiting for
 * verification is verified here too - passed when the problem is gone,
 * failed when it is still there - but a person still resolves it.
 */
export const runPageCheckAction = defineAction({
  name: 'qa.pages.check',
  permission: 'qa:manage',
  input: z.object({ code: z.string().min(1), pageId: z.string().uuid() }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const profile = await loadProfile(project.id);
    const page = await db.storefrontPage.findFirst({
      where: { id: input.pageId, projectId: project.id },
    });
    if (!page) throw new ConflictError('That page is not on this project.');

    const run = await db.crawlRun.create({
      data: {
        projectId: project.id,
        trigger: 'MANUAL',
        status: 'RUNNING',
        requestedById: ctx.principal.id,
        startedAt: clock.now(),
        pagesDiscovered: 1,
      },
      select: { id: true },
    });

    let fetched;
    try {
      fetched = await fetchStorefrontPage(page.url, {
        allowedHosts: allowedHostsFor([profile.storefrontUrl, profile.destinationUrl]),
        device: 'DESKTOP',
      });
    } catch (error) {
      const message =
        error instanceof FetchRefused ? error.message : 'The page did not respond in time.';
      await db.$transaction([
        db.crawlRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', finishedAt: clock.now(), pagesUnreachable: 1, error: message },
        }),
        db.storefrontPage.update({
          where: { id: page.id },
          data: { state: 'ERROR', lastSeenAt: clock.now() },
        }),
      ]);
      revalidateQa(input.code);
      throw new ConflictError(message);
    }

    const state =
      fetched.status === 404 || fetched.status === 410
        ? ('NOT_FOUND' as const)
        : fetched.status === 401 || fetched.status === 403
          ? ('BLOCKED' as const)
          : fetched.status >= 400
            ? ('ERROR' as const)
            : ('ACCESSIBLE' as const);

    const doc = extractDocument(fetched.html, fetched.finalUrl, fetched.status);

    if (state === 'ACCESSIBLE') {
      const sameSiteLinks = [
        ...new Map(
          doc.links
            .map((link) => ({ ...link, href: normaliseUrl(link.href) ?? link.href }))
            .filter((link) => isSameSite(link.href, fetched.finalUrl))
            .map((link) => [link.href, link] as const),
        ).values(),
      ].slice(0, LINK_BUDGET);
      const linkStatus = await mapLimited(sameSiteLinks, 5, (link) => probeUrl(link.href));
      doc.links = sameSiteLinks.map((link, index) => ({
        ...link,
        ...(linkStatus[index] != null ? { status: linkStatus[index]! } : {}),
      }));

      const probedImages = doc.images.slice(0, IMAGE_BUDGET);
      const imageStatus = await mapLimited(probedImages, 5, (image) => probeUrl(image.src));
      probedImages.forEach((image, index) => {
        const status = imageStatus[index];
        image.loaded = status == null || status < 400;
      });
    }

    const results = state === 'ACCESSIBLE' ? checkPage(doc) : [];
    const now = clock.now();

    const summary = await transaction(async (tx) => {
      await tx.storefrontPage.update({
        where: { id: page.id },
        data: {
          state,
          lastHttpStatus: fetched.status,
          title: doc.title?.slice(0, 300) ?? null,
          lastSeenAt: now,
          ...(fetched.finalUrl !== page.url ? { canonicalUrl: fetched.finalUrl } : {}),
        },
      });

      await tx.pageScan.create({
        data: {
          crawlRunId: run.id,
          pageId: page.id,
          httpStatus: fetched.status,
          ttfbMs: fetched.ttfbMs,
          loadMs: fetched.loadMs,
          title: doc.title?.slice(0, 300) ?? null,
          metaDescription: doc.metaDescription?.slice(0, 1000) ?? null,
          h1: doc.h1[0]?.slice(0, 300) ?? null,
          wordCount: doc.text ? doc.text.split(/\s+/).length : 0,
          imageCount: doc.images.length,
          imagesMissingAlt: doc.images.filter((image) => !image.alt?.trim()).length,
          internalLinks: doc.links.length,
          brokenLinks: doc.links.filter((link) => (link.status ?? 0) >= 400).length,
        },
      });

      const seen = new Set<string>();
      let opened = 0;
      let count = await tx.finding.count({ where: { projectId: project.id } });

      for (const result of results) {
        const print = fingerprint({
          category: result.category,
          detector: result.detector,
          url: page.url,
          evidenceText: result.evidenceText,
        });
        if (seen.has(print)) continue;
        seen.add(print);

        const existing = await tx.finding.findUnique({
          where: { projectId_fingerprint: { projectId: project.id, fingerprint: print } },
          select: { id: true, status: true, falsePositive: true },
        });

        if (existing) {
          const reopened = existing.status === 'RESOLVED' && !existing.falsePositive;
          const failedVerification = existing.status === 'READY_FOR_VERIFICATION';
          await tx.finding.update({
            where: { id: existing.id },
            data: {
              lastSeenAt: now,
              occurrences: { increment: 1 },
              ...(reopened ? { status: 'IN_PROGRESS' } : {}),
              ...(failedVerification
                ? { verificationResult: 'FAILED', verifiedAt: now }
                : {}),
            },
          });
          if (reopened || failedVerification) {
            await tx.findingEvent.create({
              data: {
                findingId: existing.id,
                actorId: ctx.principal.id,
                field: reopened ? 'status' : 'verification',
                fromValue: existing.status,
                toValue: reopened ? 'IN_PROGRESS' : 'FAILED',
                note: 'Still present when the page was re-checked.',
              },
            });
          }
          continue;
        }

        count += 1;
        await tx.finding.create({
          data: {
            projectId: project.id,
            reference: `FND-${count}`,
            pageId: page.id,
            url: page.url,
            pageType: page.pageType,
            category: result.category,
            severity: result.severity,
            source: 'AUTOMATED',
            detector: result.detector,
            title: result.title.slice(0, 300),
            recommendation: result.recommendation ?? null,
            evidenceText: result.evidenceText?.slice(0, 2000) ?? null,
            evidenceContext: (result.evidenceContext ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
            suggestion: result.suggestion ?? null,
            confidence: 100,
            fingerprint: print,
            firstCrawlRunId: run.id,
          },
        });
        opened += 1;
      }

      // Automated findings on this page that did not fire this time.
      const cleared = await tx.finding.findMany({
        where: {
          projectId: project.id,
          pageId: page.id,
          source: 'AUTOMATED',
          status: 'READY_FOR_VERIFICATION',
          fingerprint: { notIn: [...seen] },
        },
        select: { id: true },
      });
      for (const finding of cleared) {
        await tx.finding.update({
          where: { id: finding.id },
          data: { verificationResult: 'PASSED', verifiedAt: now },
        });
        await tx.findingEvent.create({
          data: {
            findingId: finding.id,
            actorId: ctx.principal.id,
            field: 'verification',
            toValue: 'PASSED',
            note: 'No longer detected when the page was re-checked.',
          },
        });
      }

      await tx.crawlRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          finishedAt: clock.now(),
          pagesScanned: 1,
          pagesUnreachable: state === 'ACCESSIBLE' ? 0 : 1,
          findingsOpened: opened,
        },
      });

      return { opened, verified: cleared.length };
    });

    revalidateQa(input.code);
    if (state !== 'ACCESSIBLE') {
      return actionOk(summary, `The page returned ${fetched.status}; no checks were run.`);
    }
    const parts = [`${summary.opened} new finding${summary.opened === 1 ? '' : 's'}`];
    if (summary.verified > 0) parts.push(`${summary.verified} fix${summary.verified === 1 ? '' : 'es'} verified`);
    return actionOk(summary, `Checked. ${parts.join(', ')}.`);
  },
});

// ─── Performance ────────────────────────────────────────────────────────────

/**
 * A lightweight performance run: fetch the HTML with a desktop or mobile
 * user agent and record server response time, download time and what the
 * HTML asks the browser to load. Runs record their method so a future
 * browser-based run is never charted against these.
 */
export const runPerfTestAction = defineAction({
  name: 'qa.perf.run',
  permission: 'qa:manage',
  input: z.object({
    code: z.string().min(1),
    pageId: z.string().uuid(),
    device: z.enum(['DESKTOP', 'MOBILE']),
  }),
  async handler(input, ctx) {
    const project = await resolveProject(ctx.principal, input.code);
    const profile = await loadProfile(project.id);
    const page = await db.storefrontPage.findFirst({
      where: { id: input.pageId, projectId: project.id },
      select: { id: true, url: true, pageType: true },
    });
    if (!page) throw new ConflictError('That page is not on this project.');

    const template = perfTemplateFor(page.pageType);
    if (!template) {
      throw new ConflictError(
        'Performance is tracked for homepage, collection, product, cart and checkout pages. Change the page type first.',
      );
    }

    const device = input.device as Device;
    const conditions = {
      method: PERF_METHOD,
      device,
      region: process.env.VERCEL_REGION ?? 'local',
    };

    let result: Prisma.PerfTestUncheckedCreateInput;
    try {
      const fetched = await fetchStorefrontPage(page.url, {
        allowedHosts: allowedHostsFor([profile.storefrontUrl, profile.destinationUrl]),
        device,
      });
      const measured = measureHtml(fetched.html, fetched.finalUrl, fetched.bytes);
      result = {
        projectId: project.id,
        pageId: page.id,
        url: page.url,
        template,
        device,
        conditions,
        ttfbMs: fetched.ttfbMs,
        loadMs: fetched.loadMs,
        requestCount: measured.resourceCount,
        thirdPartyRequests: measured.thirdPartyRequests,
        thirdPartyHosts: measured.thirdPartyHosts.length,
        raw: {
          httpStatus: fetched.status,
          htmlBytes: measured.htmlBytes,
          truncated: fetched.truncated,
          scriptCount: measured.scriptCount,
          stylesheetCount: measured.stylesheetCount,
          imageCount: measured.imageCount,
          thirdPartyHosts: measured.thirdPartyHosts,
        },
        error: fetched.status >= 400 ? `HTTP ${fetched.status}` : null,
      };
    } catch (error) {
      result = {
        projectId: project.id,
        pageId: page.id,
        url: page.url,
        template,
        device,
        conditions,
        error: error instanceof FetchRefused ? error.message : 'The page did not respond in time.',
      };
    }

    const created = await transaction(async (tx) => {
      const row = await tx.perfTest.create({ data: result, select: { id: true, error: true } });
      await audit(tx, {
        principal: ctx.principal,
        projectId: project.id,
        action: 'qa.perf.run',
        entityType: 'PerfTest',
        entityId: row.id,
        after: { url: page.url, device, error: row.error },
        ip: ctx.ip,
      });
      return row;
    });

    revalidateQa(input.code);
    if (created.error) throw new ConflictError(`Run recorded as failed: ${created.error}`);
    return actionOk({ id: created.id }, 'Performance check recorded.');
  },
});
