import type { Metadata } from 'next';
import Link from 'next/link';
import {
  clock,
  ENGAGEMENT_TYPE_LABEL,
  ENGAGEMENT_TYPES,
  STAGE_PHASE_LABEL,
  STAGE_PHASES,
  STAGES,
} from '@relay/core';
import { db, type Prisma } from '@relay/db';
import { can, isConfinedToOwnProjects, projectScopeWhere } from '@relay/rbac';
import { indexSummary } from '@relay/storefront';
import { Card, CardHeader, Empty, FilterChips, PageHeader, PermissionDenied } from '@relay/ui';
import { ShowcaseCard } from '@/components/qa/showcase-card';
import { hrefWith, type SearchParams } from '@/features/qa/filters';
import { listShowcase } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Site QA' };
export const dynamic = 'force-dynamic';

function one(params: SearchParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default async function SiteQaGalleryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const principal = await requirePrincipalOrRedirect('/qa');
  if (!can(principal, 'qa:read')) return <PermissionDenied />;

  const params = await searchParams;
  const raw = { type: one(params, 'type'), phase: one(params, 'phase') };
  const merchant = isConfinedToOwnProjects(principal);
  const now = clock.now();

  const [all, notSetUp] = await Promise.all([
    listShowcase(principal),
    merchant
      ? Promise.resolve([])
      : db.project.findMany({
          where: {
            ...(projectScopeWhere(principal) as Prisma.ProjectWhereInput),
            storefront: { is: null },
            stage: { not: 'COMPLETED' },
          },
          orderBy: { updatedAt: 'desc' },
          take: 12,
          select: { code: true, merchant: { select: { name: true } } },
        }),
  ]);

  const summary = indexSummary({
    audience: merchant ? 'client' : 'agency',
    projects: all.map((project) => ({
      engagementType: project.storefront?.engagementType ?? null,
      stage: STAGES[project.stage].phase,
      publishedAt: project.storefront?.publishedAt ?? null,
      comparisons: project.comparisons.length,
      clientVisibleFindings: project._count.findings,
    })),
  });

  const shown = all.filter(
    (project) =>
      (!raw.type || project.storefront?.engagementType === raw.type) &&
      (!raw.phase || STAGES[project.stage].phase === raw.phase),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site QA"
        description={
          merchant
            ? 'Your storefront before and after, what was measured, and what we found.'
            : 'Every storefront we are rebuilding: before and after, measured results, and open QA findings.'
        }
      />

      <p className="text-ink flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[15px]">
        <span>
          <span className="text-[28px] font-semibold tabular-nums tracking-tight">{summary.projects}</span>{' '}
          <span className="text-muted">project{summary.projects === 1 ? '' : 's'}</span>
        </span>
        <span>
          <span className="text-[28px] font-semibold tabular-nums tracking-tight">{summary.comparisons}</span>{' '}
          <span className="text-muted">page comparison{summary.comparisons === 1 ? '' : 's'}</span>
        </span>
        <Link href="/findings" className="hover:text-accent-ink">
          <span className="text-[28px] font-semibold tabular-nums tracking-tight">{summary.findings}</span>{' '}
          <span className="text-muted">open finding{summary.findings === 1 ? '' : 's'}</span>
        </Link>
      </p>

      <div className="space-y-2">
        <FilterChips
          legend="Engagement"
          active={raw.type}
          hrefFor={(value) => hrefWith('/qa', raw, { type: value || null })}
          options={[
            { value: '', label: 'All', count: summary.projects },
            ...ENGAGEMENT_TYPES.map((type) => ({
              value: type,
              label: ENGAGEMENT_TYPE_LABEL[type].label,
              count: summary.byEngagement[type] ?? 0,
            })),
          ]}
        />
        <FilterChips
          legend="Stage"
          active={raw.phase}
          hrefFor={(value) => hrefWith('/qa', raw, { phase: value || null })}
          options={[
            { value: '', label: 'All', count: summary.projects },
            ...STAGE_PHASES.map((phase) => ({
              value: phase,
              label: STAGE_PHASE_LABEL[phase],
              count: summary.byStage[phase] ?? 0,
            })),
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty
            title={all.length === 0 ? 'Nothing to show yet' : 'No projects match these filters'}
            description={
              all.length === 0
                ? merchant
                  ? 'Your agency has not published your site review yet.'
                  : 'Open a project, go to Site QA, and set up its storefront.'
                : 'Clear a filter to see more.'
            }
            className="py-14"
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {shown.map((project) => {
            const base = merchant ? '/portal/qa' : `/projects/${project.code}/qa`;
            return (
              <ShowcaseCard
                key={project.id}
                project={project}
                href={base}
                findingsHref={merchant ? '/portal/qa#findings' : `${base}/findings`}
                now={now}
              />
            );
          })}
        </div>
      )}

      {notSetUp.length > 0 && (
        <Card>
          <CardHeader
            title="Not set up yet"
            count={notSetUp.length}
            description="Active projects without a storefront on Site QA."
          />
          <ul className="flex flex-wrap gap-2 px-5 py-4">
            {notSetUp.map((project) => (
              <li key={project.code}>
                <Link
                  href={`/projects/${project.code}/qa`}
                  className="border-line text-ink hover:bg-surface-2 inline-flex rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
                >
                  {project.merchant.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
