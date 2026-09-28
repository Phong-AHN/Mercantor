import {
  CAPTURE_PHASE_LABEL,
  CAPTURE_VIEWPORT_LABEL,
  clock,
  formatDate,
  formatRelative,
  PAGE_TYPE_LABEL,
  stageLabel,
} from '@relay/core';
import { can } from '@relay/rbac';
import {
  BeforeAfter,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Empty,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import {
  AutoCaptureAllButton,
  AutoCaptureButton,
  CompareButton,
  ComparisonControls,
  DeleteCaptureButton,
  UploadCaptureButton,
} from '@/components/qa/capture-controls';
import { captureSrc, getSiteQa, groupCaptures } from '@/features/qa/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';
// Server actions run in this page's function: an automated full-page
// screenshot needs a browser start plus a page load, well past the default.
export const maxDuration = 60;

function pathOf(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '') || '/';
}

function host(url: string): string {
  return new URL(url).host;
}

export default async function ComparisonsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/qa/comparisons`);
  const qa = await getSiteQa(principal, code);
  const canManage = can(principal, 'qa:manage');
  const canApprove = can(principal, 'finding:approve');
  const groups = groupCaptures(qa.captures);
  const now = clock.now();
  const includedPages = qa.pages.filter((page) => page.includeInScans);
  // Captures arrive newest first, so the first one seen per key is the latest.
  const latestCapture = new Map<string, (typeof qa.captures)[number]>();
  for (const capture of qa.captures) {
    const key = `${capture.url}|${capture.viewport}|${capture.phase}`;
    if (!latestCapture.has(key)) latestCapture.set(key, capture);
  }
  const pageUrls = [
    ...new Set([
      ...qa.pages.map((page) => page.url),
      ...(qa.profile?.destinationUrl ? [qa.profile.destinationUrl] : []),
    ]),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Comparisons"
          count={qa.comparisons.length}
          description="Curated before and after pairs. These are what the client sees once shared."
        />
        {qa.comparisons.length === 0 ? (
          <Empty
            title="No comparisons yet"
            description="Upload a before and an after capture of the same page below, then make a comparison from them."
            className="py-10"
          />
        ) : (
          <CardBody className="grid gap-6 lg:grid-cols-2">
            {qa.comparisons.map((pair) => (
              <figure key={pair.id} className="space-y-2.5">
                <BeforeAfter
                  before={{ src: captureSrc(pair.beforeCapture.id), alt: `${pair.label} before` }}
                  after={{ src: captureSrc(pair.afterCapture.id), alt: `${pair.label} after` }}
                  afterLabel={pair.afterLabel}
                  aspectRatio={pair.beforeCapture.viewport === 'MOBILE' ? 9 / 16 : 16 / 10}
                  className={pair.beforeCapture.viewport === 'MOBILE' ? 'mx-auto max-w-xs' : undefined}
                />
                <figcaption className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                      {pair.label}
                      <Badge tone="neutral" size="sm" variant="outline">
                        {CAPTURE_VIEWPORT_LABEL[pair.beforeCapture.viewport].label}
                      </Badge>
                      {pair.featured && <Badge tone="accent" size="sm">Leads the card</Badge>}
                      {pair.clientVisibleAt ? (
                        <Badge tone="accent" size="sm">Shared</Badge>
                      ) : (
                        <Badge tone="muted" size="sm">Internal</Badge>
                      )}
                    </p>
                    <p className="text-muted mt-0.5 text-[12px]">
                      {formatDate(pair.beforeCapture.capturedAt)} → {formatDate(pair.afterCapture.capturedAt)}
                      {pair.changeNote ? ` · ${pair.changeNote}` : ''}
                    </p>
                  </div>
                  {!qa.merchant && (
                    <ComparisonControls
                      code={code}
                      pairId={pair.id}
                      visible={!!pair.clientVisibleAt}
                      canApprove={canApprove}
                      canManage={canManage}
                    />
                  )}
                </figcaption>
              </figure>
            ))}
          </CardBody>
        )}
      </Card>

      {canManage && qa.profile && (
        <Card>
          <CardHeader
            title="Automatic captures"
            description={
              qa.profile.destinationUrl
                ? `A browser screenshots each page, full length. Before comes from ${host(qa.profile.storefrontUrl)}, after from the same path on ${host(qa.profile.destinationUrl)}.`
                : `A browser screenshots each page, full length, from ${host(qa.profile.storefrontUrl)}. Take the before now; take the after from the same URL once the new site is live, or set the new storefront URL on the overview.`
            }
            actions={
              <>
                <AutoCaptureAllButton code={code} pageIds={includedPages.map((page) => page.id)} phase="BEFORE" />
                <AutoCaptureAllButton code={code} pageIds={includedPages.map((page) => page.id)} phase="AFTER" />
              </>
            }
          />
          {includedPages.length === 0 ? (
            <Empty
              title="No pages to capture"
              description="Add pages on the overview first: homepage, a collection, a product, the cart."
              className="py-10"
            />
          ) : (
            <div className="scrollbar-slim overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Page</TH>
                    <TH>Before</TH>
                    <TH>After</TH>
                  </TR>
                </THead>
                <TBody>
                  {includedPages.map((page) => (
                    <TR key={page.id}>
                      <TD className="max-w-[18rem]">
                        <span className="text-ink block truncate font-mono text-[12.5px]" title={page.url}>
                          {pathOf(page.url)}
                        </span>
                        <span className="text-muted text-[12px]">{PAGE_TYPE_LABEL[page.pageType].label}</span>
                      </TD>
                      {(['BEFORE', 'AFTER'] as const).map((phase) => (
                        <TD key={phase}>
                          <div className="flex flex-wrap gap-3">
                            {(['DESKTOP', 'MOBILE'] as const).map((viewport) => {
                              const last = latestCapture.get(`${page.url}|${viewport}|${phase}`);
                              return (
                                <div key={viewport} className="space-y-0.5">
                                  <AutoCaptureButton code={code} pageId={page.id} phase={phase} viewport={viewport} />
                                  <p className="text-faint text-[11px]">
                                    {last ? formatRelative(last.capturedAt, now) : 'none yet'}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      )}

      {!qa.merchant && (
        <Card>
          <CardHeader
            title="Capture history"
            description="Every screenshot ever uploaded, by page and viewport, newest first. Nothing is overwritten."
            actions={canManage ? <UploadCaptureButton code={code} pages={pageUrls} /> : null}
          />
          {groups.length === 0 ? (
            <Empty
              title="No captures yet"
              description="Upload a desktop and a mobile screenshot of the current site as the before."
              className="py-10"
            />
          ) : (
            <ul className="divide-line divide-y">
              {groups.map((group) => {
                const history = [...group.before, ...group.after].sort(
                  (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime(),
                );
                return (
                  <li key={`${group.url}|${group.viewport}`} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-ink flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
                        <span className="truncate font-mono" title={group.url}>
                          {pathOf(group.url)}
                        </span>
                        <Badge tone="neutral" size="sm" variant="outline">
                          {CAPTURE_VIEWPORT_LABEL[group.viewport].label}
                        </Badge>
                        <span className="text-muted text-[12px] font-normal">
                          {group.before.length} before · {group.after.length} after
                        </span>
                      </p>
                      {canManage && (
                        <div className="flex gap-1.5">
                          <UploadCaptureButton
                            code={code}
                            pages={pageUrls}
                            defaults={{
                              url: group.url,
                              viewport: group.viewport,
                              phase: group.before.length === 0 ? 'BEFORE' : 'AFTER',
                            }}
                          />
                          <CompareButton
                            code={code}
                            url={group.url}
                            label={pathOf(group.url) === '/' ? 'Homepage' : pathOf(group.url)}
                            before={group.before}
                            after={group.after}
                          />
                        </div>
                      )}
                    </div>
                    <ol className="scrollbar-slim flex gap-3 overflow-x-auto pb-1">
                      {history.map((capture) => (
                        <li key={capture.id} className="w-40 shrink-0">
                          <a
                            href={captureSrc(capture.id)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="border-line bg-surface-2 block aspect-[4/5] overflow-hidden rounded-[var(--radius-md)] border"
                          >
                            <img
                              src={captureSrc(capture.id)}
                              alt={`${CAPTURE_PHASE_LABEL[capture.phase].label} capture from ${formatDate(capture.capturedAt)}`}
                              loading="lazy"
                              className="size-full object-cover object-top"
                            />
                          </a>
                          <div className="mt-1.5 flex items-start justify-between gap-1">
                            <div className="min-w-0 text-[11.5px] leading-4">
                              <StatusPill descriptor={CAPTURE_PHASE_LABEL[capture.phase]} size="sm" />
                              <p className="text-ink mt-1">{formatDate(capture.capturedAt)}</p>
                              <p className="text-muted truncate" title={capture.changeNote ?? undefined}>
                                {capture.changeNote ?? stageLabel(capture.projectStage)}
                              </p>
                              <p className="text-faint">
                                {capture.width}px{capture.requestedBy ? ` · ${capture.requestedBy.name}` : ''}
                              </p>
                            </div>
                            {canManage && <DeleteCaptureButton code={code} captureId={capture.id} />}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
