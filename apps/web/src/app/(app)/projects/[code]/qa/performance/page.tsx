import {
  CAPTURE_VIEWPORT_LABEL,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRelative,
  clock,
  PAGE_TYPE_LABEL,
  type CaptureViewport,
} from '@relay/core';
import { can } from '@relay/rbac';
import { describeMetric, perfTemplateFor } from '@relay/storefront';
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Empty,
  MetricDelta,
  MetricRow,
  TrendLineChart,
} from '@relay/ui';
import { RunPerfButton } from '@/components/qa/page-controls';
import { regressionOf } from '@/features/qa/perf';
import { getSiteQa, type PerfRow } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

const DEVICES: CaptureViewport[] = ['DESKTOP', 'MOBILE'];

function htmlBytes(run: PerfRow): number | null {
  const raw = run.raw as { htmlBytes?: number } | null;
  return typeof raw?.htmlBytes === 'number' ? raw.htmlBytes : null;
}

function Delta({
  label,
  first,
  latest,
  read,
  unit,
  format,
}: {
  label: string;
  first: PerfRow;
  latest: PerfRow;
  read: (run: PerfRow) => number | null;
  unit?: string;
  format?: (value: number) => string;
}) {
  const after = read(latest);
  if (after == null) return null;
  const before = first.id === latest.id ? null : read(first);
  const delta = describeMetric({ label, before, after, unit, direction: 'LOWER_IS_BETTER' });
  const show = (value: number) => (format ? format(value) : `${Math.round(value)}${unit ? ` ${unit}` : ''}`);
  return (
    <MetricDelta
      label={label}
      before={before == null ? null : show(before)}
      after={show(after)}
      improved={delta.improved}
    />
  );
}

export default async function PerformancePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa/performance`);
  const qa = await getSiteQa(principal, code);
  const canManage = can(principal, 'qa:manage');
  const now = clock.now();

  const pages = qa.pages.filter((page) => perfTemplateFor(page.pageType) && page.includeInScans);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="How these numbers are measured">
        Each check fetches the page&apos;s HTML from our server with a desktop or mobile browser identity
        and records server response time, HTML download time, and what the HTML asks the browser to
        load. It does not run JavaScript, so it undercounts what a real browser loads; use it to spot
        changes over time. For client-facing numbers, add Lighthouse results as headline numbers on the
        overview.
      </Alert>

      {pages.length === 0 ? (
        <Card>
          <Empty
            title="No pages to measure"
            description="Performance is tracked on homepage, collection, product, cart and checkout pages. Add them on the overview."
            className="py-12"
          />
        </Card>
      ) : (
        pages.map((page) => (
          <Card key={page.id}>
            <CardHeader
              title={PAGE_TYPE_LABEL[page.pageType].label}
              description={
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-[12px] underline-offset-4 hover:underline"
                >
                  {page.url}
                </a>
              }
              actions={
                canManage ? (
                  <>
                    <RunPerfButton code={code} pageId={page.id} device="DESKTOP" label="Run desktop" />
                    <RunPerfButton code={code} pageId={page.id} device="MOBILE" label="Run mobile" />
                  </>
                ) : null
              }
            />
            <CardBody className="grid gap-6 lg:grid-cols-2">
              {DEVICES.map((device) => {
                const runs = qa.perf.filter((run) => run.pageId === page.id && run.device === device);
                const ok = runs.filter((run) => !run.error);
                const latest = ok[0];
                const first = ok[ok.length - 1];
                const regression = latest ? regressionOf(latest, ok.slice(1)) : null;
                const lastFailure = runs[0]?.error ? runs[0] : null;
                const trend = ok.slice(0, 12).reverse();

                return (
                  <section key={device} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-ink text-[13.5px] font-semibold">
                        {CAPTURE_VIEWPORT_LABEL[device].label}
                      </h3>
                      {latest && (
                        <span className="text-muted text-[12px]">
                          {ok.length} run{ok.length === 1 ? '' : 's'} · latest{' '}
                          {formatRelative(latest.measuredAt, now)}
                        </span>
                      )}
                      {regression?.regressed && <Badge tone="danger" size="sm">Regression</Badge>}
                    </div>

                    {lastFailure && (
                      <p className="text-danger-ink text-[12.5px]">
                        Last run failed {formatRelative(lastFailure.measuredAt, now)}: {lastFailure.error}
                      </p>
                    )}
                    {regression?.regressed && (
                      <p className="text-danger-ink text-[12.5px]">{regression.reasons.join('; ')}.</p>
                    )}

                    {!latest || !first ? (
                      <p className="text-muted text-[13px]">No successful runs yet.</p>
                    ) : (
                      <>
                        <MetricRow>
                          <Delta label="Server response" first={first} latest={latest} read={(r) => r.ttfbMs} unit="ms" />
                          <Delta label="HTML load" first={first} latest={latest} read={(r) => r.loadMs} unit="ms" />
                          <Delta label="Resources in HTML" first={first} latest={latest} read={(r) => r.requestCount} />
                          <Delta
                            label="Third-party hosts"
                            first={first}
                            latest={latest}
                            read={(r) => r.thirdPartyHosts}
                          />
                          <Delta
                            label="HTML size"
                            first={first}
                            latest={latest}
                            read={htmlBytes}
                            format={(value) => formatFileSize(value)}
                          />
                        </MetricRow>
                        {first.id !== latest.id && (
                          <p className="text-faint text-[11.5px]">
                            Struck-through values are from the first run, {formatDate(first.measuredAt)}.
                          </p>
                        )}
                        {trend.length > 1 && (
                          <TrendLineChart
                            height={120}
                            points={trend.map((run) => ({
                              key: run.id,
                              label: formatDate(run.measuredAt),
                              values: { ttfb: run.ttfbMs, load: run.loadMs },
                            }))}
                            series={[
                              { key: 'ttfb', label: 'Server response (ms)', tone: 'accent' },
                              { key: 'load', label: 'HTML load (ms)', tone: 'info' },
                            ]}
                            format={(value) => `${Math.round(value)} ms`}
                          />
                        )}
                        <details>
                          <summary className="text-muted cursor-pointer text-[12px]">All runs</summary>
                          <ul className="mt-2 space-y-1">
                            {runs.slice(0, 30).map((run) => (
                              <li key={run.id} className="text-ink-soft flex flex-wrap gap-x-3 text-[12px] tabular-nums">
                                <span className="text-muted">{formatDateTime(run.measuredAt)}</span>
                                {run.error ? (
                                  <span className="text-danger-ink">{run.error}</span>
                                ) : (
                                  <>
                                    <span>{run.ttfbMs} ms response</span>
                                    <span>{run.loadMs} ms load</span>
                                    <span>{run.requestCount} resources</span>
                                    <span>{run.thirdPartyHosts} third-party hosts</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </>
                    )}
                  </section>
                );
              })}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
