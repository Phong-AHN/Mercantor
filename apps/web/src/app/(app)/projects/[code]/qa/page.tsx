import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { env } from '@relay/config';
import {
  DETECTION_STATE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  formatDate,
  formatRelative,
  PAGE_STATE_LABEL,
  STOREFRONT_BUILD_LABEL,
  STOREFRONT_PLATFORM_LABEL,
  clock,
} from '@relay/core';
import { can } from '@relay/rbac';
import { formatMetricValue } from '@relay/storefront';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DetailList,
  DetailRow,
  Empty,
  Stat,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import {
  AddPagesButton,
  CheckAllButton,
  CheckPageButton,
  DeleteMetricButton,
  IncludeToggle,
  MetricButton,
  PageTypeSelect,
  RemovePageButton,
} from '@/components/qa/page-controls';
import {
  DetectButton,
  ProfileButton,
  PublishToggle,
  type ProfileFormValues,
} from '@/components/qa/profile-controls';
import { ShowcaseCard } from '@/components/qa/showcase-card';
import { StagePill } from '@/components/domain';
import { getProject } from '@/features/projects/queries';
import { getSiteQa, listShowcase } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';
// "Check" runs in this page's function: fetching the page, probing its links
// and images, then the Gemini spelling pass can take well over the default.
export const maxDuration = 60;

const TEMPLATE_PATHS = [
  '/',
  '/collections/all',
  '/cart',
  '/search',
  '/pages/about',
  '/policies/refund-policy',
];

export default async function SiteQaOverviewPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa`);
  const [qa, project, showcase] = await Promise.all([
    getSiteQa(principal, code),
    getProject(principal, code),
    listShowcase(principal, code),
  ]);
  const canManage = can(principal, 'qa:manage');
  // Only whether it is on - the key itself never leaves the server.
  const spellingEnabled = Boolean(env().GEMINI_API_KEY?.trim());
  const canApprove = can(principal, 'finding:approve');
  const now = clock.now();
  const base = `/projects/${code}/qa`;
  const profile = qa.profile;

  if (!profile) {
    const initial: ProfileFormValues = {
      storefrontUrl: project.merchant.website ?? '',
      destinationUrl: '',
      sourcePlatform: 'UNKNOWN',
      destinationPlatform: 'SHOPLINE',
      build: 'UNKNOWN',
      themeName: '',
      themeVersion: '',
      engagementType: 'PLATFORM_MIGRATION',
      headline: '',
      summary: '',
      serviceTags: '',
      destinationBuildLabel: '',
      apps: '',
    };
    return (
      <Card>
        <Empty
          title="Site QA is not set up for this project"
          description="Add the current storefront URL to start checking pages, comparing before and after, and tracking performance."
          className="py-14"
        />
        {canManage && (
          <div className="-mt-8 flex justify-center pb-10">
            <ProfileButton code={code} initial={initial} mode="create" />
          </div>
        )}
      </Card>
    );
  }

  const apps = Array.isArray(profile.detectedApps)
    ? (profile.detectedApps as Array<{ name?: string; evidence?: string }>)
    : [];
  const detection = (profile.detectionSignals ?? null) as {
    confidence?: number;
    platform?: string;
    signals?: Array<{ signal: string; source: string }>;
  } | null;

  const initial: ProfileFormValues = {
    storefrontUrl: profile.storefrontUrl,
    destinationUrl: profile.destinationUrl ?? '',
    sourcePlatform: profile.sourcePlatform,
    destinationPlatform: profile.destinationPlatform,
    build: profile.build,
    themeName: profile.themeName ?? '',
    themeVersion: profile.themeVersion ?? '',
    engagementType: profile.engagementType ?? '',
    headline: profile.headline ?? '',
    summary: profile.summary ?? '',
    serviceTags: profile.serviceTags.join(', '),
    destinationBuildLabel: profile.destinationBuildLabel ?? '',
    apps: apps
      .map((app) => app.name)
      .filter(Boolean)
      .join('\n'),
  };

  const bySeverity = Object.fromEntries(
    FINDING_SEVERITIES.map((severity) => [
      severity,
      qa.open.filter((finding) => finding.severity === severity).length,
    ]),
  ) as Record<(typeof FINDING_SEVERITIES)[number], number>;
  const unshared = qa.open.filter((finding) => !finding.clientVisibleAt).length;
  const unreachable = qa.pages.filter((page) =>
    ['BLOCKED', 'NOT_FOUND', 'ERROR'].includes(page.state),
  );
  const includedPages = qa.pages.filter((page) => page.includeInScans);

  return (
    <div className="space-y-4">
      {showcase[0] && (
        <div className="space-y-2">
          <ShowcaseCard
            project={showcase[0]}
            href={base}
            findingsHref={`${base}/findings`}
            now={now}
            size="hero"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted text-[12.5px]">
              {profile.publishedAt
                ? `Published to the client ${formatDate(profile.publishedAt)}. They see shared comparisons and findings only.`
                : 'Internal only. The client sees nothing here until it is published.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {canManage && <ProfileButton code={code} initial={initial} mode="edit" />}
              {canApprove && <PublishToggle code={code} published={!!profile.publishedAt} />}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FINDING_SEVERITIES.slice()
          .reverse()
          .map((severity) => (
            <Link key={severity} href={`${base}/findings?severity=${severity}`} className="block">
              <Stat
                label={`${FINDING_SEVERITY_LABEL[severity].label} findings`}
                value={bySeverity[severity]}
                detail={bySeverity[severity] === 0 ? 'None open' : 'Open'}
                tone={
                  bySeverity[severity] === 0 ? 'success' : FINDING_SEVERITY_LABEL[severity].tone
                }
              />
            </Link>
          ))}
      </div>

      {(unreachable.length > 0 || (canApprove && unshared > 0)) && (
        <div className="space-y-2">
          {unreachable.length > 0 && (
            <Alert
              tone="warning"
              title={`${unreachable.length} page${unreachable.length === 1 ? '' : 's'} could not be checked`}
            >
              {unreachable
                .slice(0, 5)
                .map((page) => `${page.url} (${PAGE_STATE_LABEL[page.state].label.toLowerCase()})`)
                .join(', ')}
            </Alert>
          )}
          {canApprove && unshared > 0 && (
            <Alert
              tone="info"
              title={`${unshared} open finding${unshared === 1 ? ' is' : 's are'} internal`}
            >
              Review them on the{' '}
              <Link
                href={`${base}/findings?visible=internal`}
                className="underline underline-offset-4"
              >
                findings list
              </Link>{' '}
              and share the ones the client should see.
            </Alert>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Storefront"
            description="Detected from the live page, then confirmed by a person."
            actions={
              canManage ? (
                <>
                  <DetectButton code={code} />
                  {profile.detection === 'SUGGESTED' && (
                    <ProfileButton code={code} initial={initial} mode="confirm" />
                  )}
                </>
              ) : null
            }
          />
          <CardBody>
            <DetailList>
              <DetailRow label="Current storefront">
                <a
                  href={profile.storefrontUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent-ink inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  {profile.storefrontUrl.replace(/^https?:\/\//, '')}
                  <ExternalLink className="size-3" />
                </a>
              </DetailRow>
              <DetailRow label="Platform">
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {STOREFRONT_PLATFORM_LABEL[profile.sourcePlatform].label}
                  <StatusPill descriptor={DETECTION_STATE_LABEL[profile.detection]} size="sm" />
                </span>
              </DetailRow>
              <DetailRow label="Build">{STOREFRONT_BUILD_LABEL[profile.build].label}</DetailRow>
              <DetailRow label="Theme">
                {[profile.themeName, profile.themeVersion].filter(Boolean).join(' ') || '-'}
              </DetailRow>
              <DetailRow label="Installed apps">
                {apps.length === 0 ? (
                  '-'
                ) : (
                  <span className="flex flex-wrap justify-end gap-1">
                    {apps.map((app) => (
                      <Badge key={app.name} tone="neutral" size="sm" title={app.evidence}>
                        {app.name}
                      </Badge>
                    ))}
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Moving to">
                {profile.destinationBuildLabel ??
                  STOREFRONT_PLATFORM_LABEL[profile.destinationPlatform].label}
                {profile.destinationUrl && (
                  <span className="text-muted block text-[12px] font-normal">
                    {profile.destinationUrl.replace(/^https?:\/\//, '')}
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Launch status">
                <StagePill stage={project.stage} />
              </DetailRow>
            </DetailList>
            {detection?.signals && detection.signals.length > 0 && (
              <details className="mt-3">
                <summary className="text-muted cursor-pointer text-[12.5px]">
                  Why we think so: {detection.signals.length} signal
                  {detection.signals.length === 1 ? '' : 's'}, {detection.confidence ?? 0}%
                  confidence
                  {profile.detectedAt
                    ? `, detected ${formatRelative(profile.detectedAt, now)}`
                    : ''}
                </summary>
                <ul className="mt-2 space-y-1">
                  {detection.signals.map((signal, index) => (
                    <li key={index} className="text-ink-soft text-[12.5px]">
                      <span className="text-muted font-mono text-[11px]">{signal.source}</span>{' '}
                      {signal.signal}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {profile.confirmedBy && profile.confirmedAt && (
              <p className="text-faint mt-3 text-[11.5px]">
                {DETECTION_STATE_LABEL[profile.detection].label} by {profile.confirmedBy.name}{' '}
                {formatRelative(profile.confirmedAt, now)}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Headline numbers"
            count={qa.metrics.length}
            description="Measured before and after. The first three lead the project card."
            actions={canManage ? <MetricButton code={code} /> : null}
          />
          {qa.metrics.length === 0 ? (
            <Empty
              title="No numbers yet"
              description="Add results from Lighthouse or WebPageTest runs, e.g. requests or MB to load the homepage."
              className="py-10"
            />
          ) : (
            <ul className="divide-line divide-y">
              {qa.metrics.map((metric, index) => (
                <li
                  key={metric.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-ink text-[13.5px] font-medium">{metric.label}</p>
                    <p className="text-muted text-[12px] tabular-nums">
                      {metric.beforeValue == null
                        ? ''
                        : `${formatMetricValue(metric.beforeValue, metric.unit)} → `}
                      {formatMetricValue(metric.afterValue, metric.unit)}
                      {metric.measuredAt ? ` · measured ${formatDate(metric.measuredAt)}` : ''}
                      {index >= 3 ? ' · not on the card' : ''}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <MetricButton
                        code={code}
                        initial={{
                          metricId: metric.id,
                          label: metric.label,
                          beforeValue: metric.beforeValue == null ? '' : String(metric.beforeValue),
                          afterValue: metric.afterValue == null ? '' : String(metric.afterValue),
                          unit: metric.unit ?? '',
                          direction: metric.direction,
                          measuredAt: metric.measuredAt
                            ? metric.measuredAt.toISOString().slice(0, 10)
                            : '',
                        }}
                      />
                      <DeleteMetricButton code={code} metricId={metric.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pages"
          count={qa.pages.length}
          description={
            <>
              {qa.lastRun ? `Last check ${formatRelative(qa.lastRun.createdAt, now)}. ` : ''}
              Checks read titles, descriptions, headings, alt text, placeholder copy, and the status
              of up to 25 links and 15 images per page.{' '}
              {spellingEnabled
                ? 'Spelling and grammar are checked by AI (Gemini); its suggestions arrive as New for review.'
                : canManage
                  ? 'Spelling and grammar are not checked: no Gemini API key is configured on the server.'
                  : null}
            </>
          }
          actions={
            canManage ? (
              <>
                <CheckAllButton code={code} pageIds={includedPages.map((page) => page.id)} />
                <AddPagesButton code={code} suggestions={TEMPLATE_PATHS} />
              </>
            ) : null
          }
        />
        {qa.pages.length === 0 ? (
          <Empty
            title="No pages yet"
            description="Add the homepage, a collection, a product, the cart and a content page to start."
            className="py-10"
          />
        ) : (
          <div className="scrollbar-slim overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Page</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH align="right">Open findings</TH>
                  <TH>Last checked</TH>
                  {canManage && <TH align="right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {qa.pages.map((page) => (
                  <TR key={page.id} className={page.includeInScans ? undefined : 'opacity-60'}>
                    <TD className="max-w-[22rem]">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-ink block truncate font-medium underline-offset-4 hover:underline"
                        title={page.url}
                      >
                        {page.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </a>
                      {page.title && (
                        <span className="text-muted block truncate text-[12px]">{page.title}</span>
                      )}
                    </TD>
                    <TD>
                      {canManage ? (
                        <PageTypeSelect
                          code={code}
                          pageId={page.id}
                          pageType={page.pageType}
                          confirmed={page.pageTypeConfirmed}
                        />
                      ) : (
                        page.pageType
                      )}
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <StatusPill descriptor={PAGE_STATE_LABEL[page.state]} size="sm" />
                        {page.lastHttpStatus && (
                          <span className="text-faint font-mono text-[11px]">
                            {page.lastHttpStatus}
                          </span>
                        )}
                      </span>
                    </TD>
                    <TD align="right" className="tabular">
                      {page.openFindings > 0 ? (
                        <Link
                          href={`${base}/findings?q=${encodeURIComponent(page.url)}`}
                          className="text-accent-ink font-medium hover:underline"
                        >
                          {page.openFindings}
                        </Link>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </TD>
                    <TD className="text-muted whitespace-nowrap text-[12px]">
                      {page.lastHttpStatus ? formatRelative(page.lastSeenAt, now) : 'Never'}
                    </TD>
                    {canManage && (
                      <TD align="right">
                        <span className="inline-flex items-center gap-2">
                          <IncludeToggle
                            code={code}
                            pageId={page.id}
                            included={page.includeInScans}
                          />
                          {page.includeInScans && <CheckPageButton code={code} pageId={page.id} />}
                          <RemovePageButton code={code} pageId={page.id} url={page.url} />
                        </span>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
