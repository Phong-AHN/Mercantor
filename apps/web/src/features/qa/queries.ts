import 'server-only';
import { cache } from 'react';
import {
  OPEN_FINDING_STATUSES,
  type CaptureViewport,
  type FindingCategory,
  type FindingSeverity,
  type FindingStatus,
} from '@relay/core';
import { db, type Prisma } from '@relay/db';
import { isConfinedToOwnProjects, projectScopeWhere, type Principal } from '@relay/rbac';
import { resolveProject } from '@/features/projects/mutations';
import { PERF_METHOD } from './perf';

/**
 * Site QA reads. The merchant rule lives here, once: a merchant principal
 * only ever gets findings someone shared (`clientVisibleAt` set, not a false
 * positive), comparisons someone shared, and the captures those comparisons
 * use. Pages never filter it themselves.
 */

function findingAudience(principal: Principal): Prisma.FindingWhereInput {
  return isConfinedToOwnProjects(principal)
    ? { clientVisibleAt: { not: null }, falsePositive: false }
    : {};
}

function comparisonAudience(principal: Principal): Prisma.ComparisonPairWhereInput {
  return isConfinedToOwnProjects(principal) ? { clientVisibleAt: { not: null } } : {};
}

export const captureSrc = (id: string) => `/api/captures/${id}`;

const CAPTURE_SELECT = {
  id: true,
  url: true,
  phase: true,
  viewport: true,
  width: true,
  height: true,
  projectStage: true,
  changeNote: true,
  capturedAt: true,
  requestedBy: { select: { name: true } },
} satisfies Prisma.PageCaptureSelect;

export type CaptureRow = Prisma.PageCaptureGetPayload<{ select: typeof CAPTURE_SELECT }>;

const PERF_SELECT = {
  id: true,
  pageId: true,
  url: true,
  template: true,
  device: true,
  ttfbMs: true,
  loadMs: true,
  requestCount: true,
  thirdPartyRequests: true,
  thirdPartyHosts: true,
  raw: true,
  error: true,
  conditions: true,
  measuredAt: true,
} satisfies Prisma.PerfTestSelect;

export type PerfRow = Prisma.PerfTestGetPayload<{ select: typeof PERF_SELECT }>;

export const getSiteQa = cache(async (principal: Principal, code: string) => {
  const project = await resolveProject(principal, code);
  const merchant = isConfinedToOwnProjects(principal);

  const [profile, pages, findings, comparisons, metrics, perf, lastRun] = await Promise.all([
    db.storefrontProfile.findUnique({
      where: { projectId: project.id },
      include: { confirmedBy: { select: { name: true } } },
    }),
    db.storefrontPage.findMany({
      where: { projectId: project.id },
      orderBy: [{ pageType: 'asc' }, { url: 'asc' }],
    }),
    db.finding.findMany({
      where: { projectId: project.id, ...findingAudience(principal) },
      select: { id: true, status: true, severity: true, category: true, pageId: true, clientVisibleAt: true },
    }),
    db.comparisonPair.findMany({
      where: { projectId: project.id, ...comparisonAudience(principal) },
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        beforeCapture: { select: CAPTURE_SELECT },
        afterCapture: { select: CAPTURE_SELECT },
      },
    }),
    db.showcaseMetric.findMany({
      where: { projectId: project.id },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.perfTest.findMany({
      where: { projectId: project.id },
      orderBy: { measuredAt: 'desc' },
      take: 400,
      select: PERF_SELECT,
    }),
    db.crawlRun.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, status: true, error: true },
    }),
  ]);

  const captures = merchant
    ? []
    : await db.pageCapture.findMany({
        where: { projectId: project.id },
        orderBy: { capturedAt: 'desc' },
        select: CAPTURE_SELECT,
      });

  const open = findings.filter((finding) => OPEN_FINDING_STATUSES.includes(finding.status));
  const openByPage = new Map<string, number>();
  for (const finding of open) {
    if (finding.pageId) openByPage.set(finding.pageId, (openByPage.get(finding.pageId) ?? 0) + 1);
  }

  return {
    project,
    merchant,
    profile,
    pages: pages.map((page) => ({ ...page, openFindings: openByPage.get(page.id) ?? 0 })),
    findings,
    open,
    comparisons,
    captures,
    metrics,
    perf: perf.filter(
      (run) => (run.conditions as { method?: string } | null)?.method === PERF_METHOD,
    ),
    lastRun,
  };
});

export type SiteQa = Awaited<ReturnType<typeof getSiteQa>>;

/** Captures grouped as the page history: one entry per URL and viewport, newest first. */
export function groupCaptures(captures: readonly CaptureRow[]) {
  const groups = new Map<
    string,
    { url: string; viewport: CaptureViewport; before: CaptureRow[]; after: CaptureRow[] }
  >();
  for (const capture of captures) {
    const key = `${capture.url}|${capture.viewport}`;
    const group = groups.get(key) ?? {
      url: capture.url,
      viewport: capture.viewport,
      before: [],
      after: [],
    };
    (capture.phase === 'BEFORE' ? group.before : group.after).push(capture);
    groups.set(key, group);
  }
  return [...groups.values()];
}

// ─── Findings list ──────────────────────────────────────────────────────────

export interface FindingFilters {
  projectCode?: string;
  q?: string;
  category?: FindingCategory;
  severity?: FindingSeverity;
  /** A status, or "open" for everything not resolved or dismissed. */
  status?: FindingStatus | 'open' | 'all';
  assigneeId?: string;
  from?: Date;
  to?: Date;
  clientVisible?: boolean;
}

export async function listFindings(principal: Principal, filters: FindingFilters) {
  const where: Prisma.FindingWhereInput = {
    ...findingAudience(principal),
    project: {
      ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput),
      ...(filters.projectCode ? { code: filters.projectCode } : {}),
    },
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.status === 'open' || filters.status === undefined
      ? { status: { in: [...OPEN_FINDING_STATUSES] } }
      : filters.status === 'all'
        ? {}
        : { status: filters.status }),
    ...(filters.clientVisible === undefined
      ? {}
      : filters.clientVisible
        ? { clientVisibleAt: { not: null } }
        : { clientVisibleAt: null }),
    ...(filters.from || filters.to
      ? { firstSeenAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { url: { contains: filters.q, mode: 'insensitive' } },
            { title: { contains: filters.q, mode: 'insensitive' } },
            { reference: { equals: filters.q.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [rows, facets] = await Promise.all([
    db.finding.findMany({
      where,
      orderBy: [{ firstSeenAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        reference: true,
        url: true,
        pageType: true,
        category: true,
        severity: true,
        status: true,
        source: true,
        title: true,
        evidenceText: true,
        firstSeenAt: true,
        lastSeenAt: true,
        clientVisibleAt: true,
        falsePositive: true,
        verificationResult: true,
        assignee: { select: { id: true, name: true } },
        project: { select: { code: true, merchant: { select: { name: true } } } },
        _count: { select: { comments: true } },
      },
    }),
    db.finding.groupBy({
      by: ['severity'],
      where: { ...where, severity: undefined },
      _count: { _all: true },
    }),
  ]);

  const bySeverity = Object.fromEntries(facets.map((facet) => [facet.severity, facet._count._all]));
  return { rows, bySeverity: bySeverity as Partial<Record<FindingSeverity, number>> };
}

export type FindingListRow = Awaited<ReturnType<typeof listFindings>>['rows'][number];

export async function getFinding(principal: Principal, code: string, reference: string) {
  const project = await resolveProject(principal, code);
  const merchant = isConfinedToOwnProjects(principal);
  const finding = await db.finding.findFirst({
    where: { projectId: project.id, reference, ...findingAudience(principal) },
    include: {
      assignee: { select: { id: true, name: true } },
      reviewedBy: { select: { name: true } },
      page: { select: { id: true, url: true, pageType: true } },
      comments: {
        where: merchant ? { clientVisible: true } : {},
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      // The internal history (who moved it, internal reasons) is not for the client.
      events: {
        take: merchant ? 0 : undefined,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  return finding ? { project, finding } : null;
}

// ─── Portfolio showcase ─────────────────────────────────────────────────────

/**
 * One card per project with a storefront profile. The client audience sees
 * only published projects and only what was shared on them.
 */
export async function listShowcase(principal: Principal, code?: string) {
  const merchant = isConfinedToOwnProjects(principal);
  const projects = await db.project.findMany({
    where: {
      ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput),
      ...(code ? { code } : {}),
      storefront: merchant ? { publishedAt: { not: null } } : { isNot: null },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      code: true,
      stage: true,
      migrationType: true,
      merchant: { select: { name: true } },
      storefront: true,
      comparisons: {
        where: comparisonAudience(principal),
        orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          beforeCapture: { select: CAPTURE_SELECT },
          afterCapture: { select: CAPTURE_SELECT },
        },
      },
      showcaseMetrics: {
        where: { featured: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        take: 3,
      },
      _count: {
        select: {
          findings: { where: { ...findingAudience(principal), status: { in: [...OPEN_FINDING_STATUSES] } } },
        },
      },
    },
  });
  return projects;
}

export type ShowcaseProject = Awaited<ReturnType<typeof listShowcase>>[number];
