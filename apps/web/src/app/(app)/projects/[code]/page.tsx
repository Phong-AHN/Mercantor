import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import {
  ACTIVITY_TYPE_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
  APPROVAL_TYPES,
  formatDate,
  formatDuration,
  formatRelative,
  STAGES,
  type ProjectStage,
} from '@relay/core';
import {
  Avatar,
  Badge,
  BarList,
  type BarListItem,
  Card,
  CardBody,
  CardHeader,
  cn,
  Empty,
  PersonCell,
  ProgressBar,
  StageRail,
  StatusPill,
  TeamSplitBar,
  Timeline,
  TimelineItem,
  Unassigned,
} from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

const PROVIDER_LABEL: Record<string, string> = {
  SLACK: 'Slack',
  CLICKUP: 'ClickUp',
  EMAIL: 'Email',
};

const LINK = 'text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline';

/**
 * The Overview tab. The next step, health and launch date are in the status
 * band above every tab, and time figures are in the answers - so this page
 * does not repeat them. It holds what is only here: checklist progress, what
 * happened recently, who is on the project, the approval set, and the stage
 * history.
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}`);
  const project = await getProject(principal, code);
  const now = project.snapshot.time.now;
  const base = `/projects/${project.code}`;

  const accessDone = project.accessItems.filter((item) => item.status === 'VERIFIED').length;
  const assetsDone = project.assetItems.filter((item) => item.status === 'APPROVED').length;
  const requiredAssets = project.assetItems.filter((item) => item.required);
  const inScope = project.scopeItems.filter((item) => item.disposition === 'IN_SCOPE');
  const scopeDone = inScope.filter(
    (item) => item.status === 'VERIFIED' || item.status === 'MIGRATED',
  ).length;
  const changeRequests = project.scopeItems.filter((item) => item.disposition === 'CHANGE_REQUEST');
  // Approved and on an invoice line is resolved, not open - the invoices page
  // owns it from there.
  const openChangeRequests = changeRequests.filter((item) => !item.changeRequestApprovedAt);

  const visitedStages = [...new Set(project.snapshot.visitedStages)] as ProjectStage[];

  // Stages in track order (a sequence, so order carries meaning), each against
  // its target. Over target is a status, so it takes the warning tone - with
  // the word "over" beside it, never colour alone.
  const stageTimes: BarListItem[] = project.snapshot.time.byStage
    .filter((entry) => entry.totalMs > 0)
    .map((entry) => ({
      key: entry.stage,
      label: STAGES[entry.stage].label,
      value: entry.totalMs,
      target: entry.targetMs,
      tone: entry.overTarget ? ('warning' as const) : ('accent' as const),
      display: `${formatDuration(entry.totalMs, { compact: true })}${entry.overTarget ? ' over' : ''}`,
    }));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ChecklistCard
            title="Access"
            href={`${base}/access`}
            done={accessDone}
            total={project.accessItems.length}
            blocking={
              project.accessItems.filter((item) => item.blocking && item.status !== 'VERIFIED')
                .length
            }
            blockingLabel="blocking item(s) not verified"
          />
          <ChecklistCard
            title="Assets"
            href={`${base}/assets`}
            done={assetsDone}
            total={project.assetItems.length}
            blocking={
              requiredAssets.filter(
                (item) => item.status === 'NOT_REQUESTED' || item.status === 'REQUESTED',
              ).length
            }
            blockingLabel="required asset(s) not received"
          />
          <ChecklistCard
            title="Migration scope"
            href={`${base}/scope`}
            done={scopeDone}
            total={inScope.length}
            blocking={openChangeRequests.length}
            blockingLabel="change request(s) open"
          />
        </div>

        <Card>
          <CardHeader
            title="Where the time went"
            description={`${formatDuration(project.snapshot.time.ageMs, { compact: true })} so far. Blocked time is charged to whoever owned the blocker.`}
            actions={
              <Link href={`${base}/time`} className={LINK}>
                Time & SLA
              </Link>
            }
          />
          <CardBody className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <section aria-labelledby="time-by-team">
              <h3 id="time-by-team" className="text-ink mb-3 text-[13px] font-semibold">
                By team
              </h3>
              <TeamSplitBar
                byTeam={project.snapshot.time.byTeam}
                format={(ms) => formatDuration(ms, { compact: true })}
                height="lg"
              />
            </section>
            <section aria-labelledby="time-by-stage">
              <h3 id="time-by-stage" className="text-ink mb-3 text-[13px] font-semibold">
                By stage, against its target
              </h3>
              {stageTimes.length === 0 ? (
                <p className="text-muted text-[13px]">No stage has been timed yet.</p>
              ) : (
                <>
                  <BarList
                    items={stageTimes}
                    format={(ms) => formatDuration(ms, { compact: true })}
                  />
                  <p className="text-muted mt-3 flex items-center gap-2 text-[12px]">
                    <span className="bg-ink-soft inline-block h-3 w-px" aria-hidden />
                    Target
                    <span
                      className="bg-warning ml-3 inline-block h-2 w-4 rounded-full"
                      aria-hidden
                    />
                    Over target
                  </p>
                </>
              )}
            </section>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent events"
            description={`Last activity ${formatRelative(project.lastActivityAt, now)}. Recorded by the portal as things happen.`}
            actions={
              <Link href={`${base}/timeline`} className={LINK}>
                All events
              </Link>
            }
          />
          <CardBody>
            {project.activities.length === 0 ? (
              <Empty
                title="Nothing recorded yet"
                description="Stage moves, blockers, approvals and updates will appear here as they happen. Log an update to start the record."
                className="py-8"
              />
            ) : (
              <Timeline>
                {project.activities.slice(0, 7).map((event, index, list) => (
                  <TimelineItem
                    key={event.id}
                    tone={ACTIVITY_TYPE_LABEL[event.type].tone}
                    title={event.summary}
                    meta={formatRelative(event.occurredAt, now)}
                    connector={index < list.length - 1}
                  >
                    {event.detail && <p className="line-clamp-2">{event.detail}</p>}
                    {event.actor && (
                      <p className="text-faint mt-1 text-[11.5px]">{event.actor.name}</p>
                    )}
                  </TimelineItem>
                ))}
              </Timeline>
            )}
          </CardBody>
        </Card>

        <Card>
          <details open className="group">
            <summary className="border-line hover:bg-surface-2 focus-visible:ring-accent flex cursor-pointer list-none items-start justify-between gap-3 rounded-t-[var(--radius-lg)] border-b px-5 py-4 focus-visible:outline-none focus-visible:ring-2 group-[:not([open])]:rounded-b-[var(--radius-lg)] group-[:not([open])]:border-b-0 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="text-ink block text-[15px] font-semibold leading-6">
                  Stage history
                </span>
                <span className="text-muted mt-0.5 block text-[13px]">
                  Every stage visited, with the time spent in each. Re-work shows as a step behind
                  the current one.
                </span>
              </span>
              <ChevronDown
                className="text-muted mt-1 size-4 shrink-0 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <CardBody>
              <StageRail
                current={project.stage}
                durations={project.snapshot.stageDurations}
                visited={visitedStages}
                currentDurationMs={project.snapshot.time.currentStageMs}
              />
              <p className="mt-3">
                <Link href={`${base}/time`} className={LINK}>
                  Full time breakdown
                </Link>
              </p>
            </CardBody>
          </details>
        </Card>
      </div>

      {/* ---- right rail ------------------------------------------------- */}
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader title="Who is on this" />
          <CardBody className="space-y-3">
            <PersonRow label="AHN project manager" person={project.people.ahnPm} />
            <PersonRow label="AHN developer" person={project.people.ahnDev} />
            <PersonRow label="AHN designer" person={project.people.ahnDesigner} />
            <PersonRow label="SHOPLINE account manager" person={project.people.shoplineAm} />
            <PersonRow label="SHOPLINE solutions engineer" person={project.people.shoplineSe} />

            <div className="border-line border-t pt-3">
              <h3 className="text-muted mb-2 text-[12px] font-medium">Merchant contacts</h3>
              {project.merchantDetail.contacts.length === 0 ? (
                <p className="text-muted text-[12.5px]">No contact recorded yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {project.merchantDetail.contacts.map((contact) => (
                    <li key={contact.id} className="flex items-start gap-2.5">
                      <Avatar name={contact.name} team="MERCHANT" size="sm" />
                      <div className="min-w-0">
                        <p className="text-ink truncate text-[13px] font-medium leading-4">
                          {contact.name}
                          {contact.isPrimary && (
                            <Badge tone="warning" size="sm" className="ml-1.5 align-middle">
                              Primary
                            </Badge>
                          )}
                        </p>
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-muted hover:text-accent-ink block truncate text-[11.5px]"
                        >
                          {contact.email}
                        </a>
                        {contact.phone && (
                          <p className="text-faint text-[11.5px]">{contact.phone}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Approvals"
            actions={
              <Link href={`${base}/approvals`} className={LINK}>
                Manage approvals
              </Link>
            }
          />
          <CardBody>
            <ul className="space-y-2">
              {APPROVAL_TYPES.map((type) => {
                const approval = project.approvals.find((item) => item.type === type);
                const status = approval?.status ?? 'NOT_REQUESTED';
                return (
                  <li key={type} className="flex items-center justify-between gap-3">
                    <span className="text-ink-soft min-w-0 truncate text-[12.5px]">
                      {APPROVAL_TYPE_LABEL[type].label}
                    </span>
                    <span className="shrink-0 text-right">
                      <StatusPill descriptor={APPROVAL_STATUS_LABEL[status]} size="sm" />
                      {approval?.decidedAt && (
                        <span className="text-faint block text-[10.5px]">
                          {formatDate(approval.decidedAt)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {(project.integrations.length > 0 || project.scopeSummary) && (
          <Card>
            <details className="group">
              <summary className="hover:bg-surface-2 focus-visible:ring-accent flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-lg)] px-5 py-4 focus-visible:outline-none focus-visible:ring-2 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="text-ink block text-[15px] font-semibold leading-6">
                    More details
                  </span>
                  <span className="text-muted block text-[13px]">
                    {[
                      project.integrations.length > 0 ? 'Connected tools' : null,
                      project.scopeSummary ? 'scope summary' : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                <ChevronDown
                  className="text-muted size-4 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-line space-y-5 border-t px-5 py-4">
                {project.integrations.length > 0 && (
                  <section>
                    <h3 className="text-ink mb-1 text-[13px] font-semibold">Connected</h3>
                    <ul className="space-y-1">
                      {project.integrations.map((link) => (
                        <li key={link.id}>
                          <a
                            href={link.externalUrl ?? '#'}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:bg-surface-2 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1 py-1.5 transition-colors"
                          >
                            <span className="min-w-0">
                              <span className="text-muted block text-[11.5px] font-medium">
                                {PROVIDER_LABEL[link.provider] ?? link.provider}
                              </span>
                              <span className="text-ink block truncate text-[12.5px]">
                                {link.displayName ?? link.externalId}
                              </span>
                            </span>
                            <Badge tone={link.isActive ? 'success' : 'muted'} size="sm">
                              {link.isActive ? 'Linked' : 'Off'}
                            </Badge>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {project.scopeSummary && (
                  <section>
                    <h3 className="text-ink mb-1 text-[13px] font-semibold">Scope summary</h3>
                    <p className="text-ink-soft whitespace-pre-line text-[13px] leading-5">
                      {project.scopeSummary}
                    </p>
                  </section>
                )}
              </div>
            </details>
          </Card>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  label,
  person,
}: {
  label: string;
  person: { name: string; team: 'AHN' | 'SHOPLINE' | 'MERCHANT' | 'OTHER'; role: string } | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted text-[12px]">{label}</span>
      {person ? <PersonCell name={person.name} team={person.team} size="sm" /> : <Unassigned />}
    </div>
  );
}

function ChecklistCard({
  title,
  href,
  done,
  total,
  blocking,
  blockingLabel,
}: {
  title: string;
  href: string;
  done: number;
  total: number;
  blocking: number;
  blockingLabel: string;
}) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  return (
    <Link
      href={href}
      className="border-line bg-surface-1 shadow-card hover:shadow-raised focus-visible:ring-accent block rounded-[var(--radius-lg)] border p-4 transition-shadow focus-visible:outline-none focus-visible:ring-2"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-ink text-[12.5px] font-medium">{title}</p>
        <p className="tabular text-muted text-[12.5px]">
          {done}
          <span className="text-faint">/{total}</span>
        </p>
      </div>
      <ProgressBar
        value={pct}
        size="sm"
        tone={blocking > 0 ? 'warning' : pct === 100 ? 'success' : 'accent'}
        className="mt-2.5"
        label={`${title}: ${done} of ${total}`}
      />
      <p className={cn('mt-2 text-[11.5px]', blocking > 0 ? 'text-warning-ink' : 'text-muted')}>
        {total === 0
          ? 'No items yet'
          : blocking > 0
            ? `${blocking} ${blockingLabel}`
            : 'Nothing outstanding'}
      </p>
    </Link>
  );
}
