import Link from 'next/link';
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
import { can } from '@relay/rbac';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  cn,
  DetailList,
  DetailRow,
  Empty,
  PersonCell,
  ProgressBar,
  Section,
  StageRail,
  StatusPill,
  TeamSplitBar,
  Timeline,
  TimelineItem,
  TONE_DOT,
  Unassigned,
} from '@relay/ui';
import { DueDate } from '@/components/domain';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { NextActionCard } from './next-action-card';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Where this project has been"
            description="Every stage it has visited, with the time spent in each. Re-work shows as a step behind the current one."
            actions={
              <Link
                href={`${base}/time`}
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                Full time breakdown
              </Link>
            }
          />
          <CardBody>
            <StageRail
              current={project.stage}
              durations={project.snapshot.stageDurations}
              visited={visitedStages}
              currentDurationMs={project.snapshot.time.currentStageMs}
            />
          </CardBody>
        </Card>

        <NextActionCard
          code={project.code}
          nextAction={project.nextAction}
          ownerName={project.nextActionOwner?.name ?? null}
          ownerId={project.nextActionOwner?.id ?? null}
          ownerTeam={project.nextActionOwnerTeam}
          dueDate={project.nextActionDueDate?.toISOString() ?? null}
          canEdit={can(principal, 'project:update')}
          now={now.toISOString()}
        />

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
            title="Recent activity"
            description="The last few things that happened, in the words of the people who did them."
            actions={
              <Link
                href={`${base}/activity`}
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                Open the feed
              </Link>
            }
          />
          <CardBody>
            {project.activities.length === 0 ? (
              <Empty title="Nothing has happened yet" className="py-8" />
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
      </div>

      {/* ---- right rail ------------------------------------------------- */}
      <div className="space-y-4">
        <Card>
          <CardHeader title="Who is on this" />
          <CardBody className="space-y-3">
            <PersonRow label="AHN project manager" person={project.people.ahnPm} />
            <PersonRow label="AHN developer" person={project.people.ahnDev} />
            <PersonRow label="SHOPLINE account manager" person={project.people.shoplineAm} />
            <PersonRow label="SHOPLINE solutions engineer" person={project.people.shoplineSe} />

            <div className="border-line border-t pt-3">
              <p className="text-faint mb-2 text-[11px] font-semibold uppercase tracking-wide">
                Merchant contacts
              </p>
              {project.merchantDetail.contacts.length === 0 ? (
                <p className="text-faint text-[12.5px]">No contact recorded yet.</p>
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
                              primary
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
          <CardHeader title="Dates & duration" />
          <CardBody>
            <DetailList>
              <DetailRow label="Started">{formatDate(project.startDate)}</DetailRow>
              <DetailRow label="Target launch">
                <DueDate date={project.targetLaunchDate} now={now} />
              </DetailRow>
              {project.actualLaunchDate && (
                <DetailRow label="Went live">{formatDate(project.actualLaunchDate)}</DetailRow>
              )}
              <DetailRow label="Project age">
                <span className="tabular">
                  {formatDuration(project.snapshot.time.ageMs, { compact: true })}
                </span>
              </DetailRow>
              <DetailRow label={`In ${STAGES[project.stage].shortLabel}`}>
                <span
                  className={cn(
                    'tabular',
                    project.snapshot.time.currentStageOverTarget && 'text-danger-ink',
                  )}
                >
                  {formatDuration(project.snapshot.time.currentStageMs, { compact: true })}
                </span>
              </DetailRow>
              <DetailRow label="Last activity">
                {formatRelative(project.lastActivityAt, now)}
              </DetailRow>
            </DetailList>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Where the time went"
            description="Blocked time is charged to whoever owned the blocker."
          />
          <CardBody>
            <TeamSplitBar
              byTeam={project.snapshot.time.byTeam}
              format={(ms) => formatDuration(ms, { compact: true })}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Approvals"
            actions={
              <Link
                href={`${base}/approvals`}
                className="text-accent-ink text-[12.5px] font-medium underline-offset-4 hover:underline"
              >
                Manage
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
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          TONE_DOT[APPROVAL_STATUS_LABEL[status].tone],
                        )}
                      />
                      <span className="text-ink-soft truncate text-[12.5px]">
                        {APPROVAL_TYPE_LABEL[type].label}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <StatusPill
                        descriptor={APPROVAL_STATUS_LABEL[status]}
                        size="sm"
                        dot={false}
                      />
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

        {project.integrations.length > 0 && (
          <Card>
            <CardHeader title="Connected" description="Where this project also lives." />
            <CardBody>
              <ul className="space-y-2">
                {project.integrations.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.externalUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:bg-surface-2 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1 py-1.5 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="text-faint block text-[11px] font-medium uppercase">
                          {link.provider}
                        </span>
                        <span className="text-ink block truncate text-[12.5px]">
                          {link.displayName ?? link.externalId}
                        </span>
                      </span>
                      <Badge tone={link.isActive ? 'success' : 'muted'} size="sm">
                        {link.isActive ? 'linked' : 'off'}
                      </Badge>
                    </a>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {project.scopeSummary && (
          <Section title="Scope summary">
            <p className="border-line bg-surface-1 text-ink-soft rounded-[var(--radius-md)] border p-4 text-[13px] leading-5">
              {project.scopeSummary}
            </p>
          </Section>
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
      className="border-line bg-surface-1 shadow-card hover:shadow-raised block rounded-[var(--radius-lg)] border p-4 transition-shadow"
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
        {blocking > 0 ? `${blocking} ${blockingLabel}` : 'Nothing outstanding'}
      </p>
    </Link>
  );
}
