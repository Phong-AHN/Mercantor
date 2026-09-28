import type { Metadata } from 'next';
import {
  CAPTURE_VIEWPORT_LABEL,
  clock,
  formatDate,
  formatRelative,
  isAppError,
  PERF_TEMPLATE_LABEL,
} from '@relay/core';
import { BeforeAfter, Badge, Card, CardBody, CardHeader, Empty, Table, TBody, TD, TH, THead, TR } from '@relay/ui';
import { FindingsList } from '@/components/qa/findings-list';
import { ShowcaseCard } from '@/components/qa/showcase-card';
import { getPortalProject } from '@/features/portal/queries';
import { captureSrc, getSiteQa, listFindings, listShowcase } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Site review' };
export const dynamic = 'force-dynamic';

export default async function PortalSiteReviewPage() {
  const principal = await requirePrincipalOrRedirect('/portal/qa');

  let project;
  try {
    project = await getPortalProject(principal);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') {
      return <Empty title="No project yet" description={error.message} className="py-16" />;
    }
    throw error;
  }

  const [qa, showcase, findings] = await Promise.all([
    getSiteQa(principal, project.code),
    listShowcase(principal, project.code),
    listFindings(principal, { projectCode: project.code, status: 'all' }),
  ]);
  const now = clock.now();

  if (!qa.profile?.publishedAt || !showcase[0]) {
    return (
      <Card>
        <Empty
          title="Your site review is being prepared"
          description="Before and after comparisons, measured results and the QA findings for your storefront will appear here once your AHN team shares them."
          className="py-16"
        />
      </Card>
    );
  }

  const latestByTemplate = new Map<string, (typeof qa.perf)[number]>();
  for (const run of qa.perf) {
    if (run.error) continue;
    const key = `${run.template}|${run.device}`;
    if (!latestByTemplate.has(key)) latestByTemplate.set(key, run);
  }
  const perfRows = [...latestByTemplate.values()];
  const openCount = findings.rows.filter((row) => !['RESOLVED', 'DISMISSED'].includes(row.status)).length;

  return (
    <div className="space-y-6">
      <ShowcaseCard
        project={showcase[0]}
        href="/portal/qa"
        findingsHref="#findings"
        now={now}
        size="hero"
      />

      {qa.comparisons.length > 1 && (
        <Card>
          <CardHeader title="Page by page" count={qa.comparisons.length} description="Drag the handle, or use the arrow keys, to compare." />
          <CardBody className="grid gap-6 md:grid-cols-2">
            {qa.comparisons.map((pair) => (
              <figure key={pair.id} className="space-y-2">
                <BeforeAfter
                  before={{ src: captureSrc(pair.beforeCapture.id), alt: `${pair.label} before` }}
                  after={{ src: captureSrc(pair.afterCapture.id), alt: `${pair.label} after` }}
                  afterLabel={pair.afterLabel}
                  aspectRatio={pair.beforeCapture.viewport === 'MOBILE' ? 9 / 16 : 16 / 10}
                  className={pair.beforeCapture.viewport === 'MOBILE' ? 'mx-auto max-w-xs' : undefined}
                />
                <figcaption className="text-[13px]">
                  <span className="text-ink font-semibold">{pair.label}</span>{' '}
                  <span className="text-muted">
                    · {CAPTURE_VIEWPORT_LABEL[pair.beforeCapture.viewport].label} ·{' '}
                    {formatDate(pair.afterCapture.capturedAt)}
                  </span>
                  {pair.changeNote && <p className="text-muted mt-0.5">{pair.changeNote}</p>}
                </figcaption>
              </figure>
            ))}
          </CardBody>
        </Card>
      )}

      {perfRows.length > 0 && (
        <Card>
          <CardHeader
            title="Speed checks"
            description="How quickly each key page responds, from our latest check."
          />
          <div className="scrollbar-slim overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Page</TH>
                  <TH>Device</TH>
                  <TH align="right">Server response</TH>
                  <TH align="right">Page load (HTML)</TH>
                  <TH align="right">Third-party hosts</TH>
                  <TH>Checked</TH>
                </TR>
              </THead>
              <TBody>
                {perfRows.map((run) => (
                  <TR key={run.id}>
                    <TD>{PERF_TEMPLATE_LABEL[run.template].label}</TD>
                    <TD>{CAPTURE_VIEWPORT_LABEL[run.device].label}</TD>
                    <TD align="right" className="tabular">{run.ttfbMs ?? '-'} ms</TD>
                    <TD align="right" className="tabular">{run.loadMs ?? '-'} ms</TD>
                    <TD align="right" className="tabular">{run.thirdPartyHosts ?? '-'}</TD>
                    <TD className="text-muted text-[12px]">{formatRelative(run.measuredAt, now)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}

      <Card id="findings">
        <CardHeader
          title="What we found"
          count={findings.rows.length}
          description={
            openCount > 0
              ? `${openCount} still being worked on. Open one to see the detail or reply to the team.`
              : 'Everything shared with you has been dealt with.'
          }
          actions={openCount > 0 ? <Badge tone="warning">{openCount} open</Badge> : null}
        />
        <FindingsList
          rows={findings.rows}
          hrefFor={(row) => `/portal/qa/findings/${row.reference}`}
          showVisibility={false}
        />
      </Card>
    </div>
  );
}
