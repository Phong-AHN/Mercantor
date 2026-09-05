import {
  AGING_BAND_LABEL,
  formatDate,
  formatDays,
  formatDuration,
  STAGES,
  TEAM_LABEL,
  type Team,
} from '@relay/core';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  cn,
  DetailList,
  DetailRow,
  Empty,
  ProgressBar,
  Stat,
  StatusPill,
  Table,
  TableScroller,
  TBody,
  TD,
  TeamSplitBar,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

const TEAMS_ORDER: Team[] = ['AHN', 'MERCHANT', 'SHOPLINE', 'OTHER'];

/**
 * The time page. The brief asks for elapsed time to be tracked and, separately,
 * for delay ownership - so this page keeps the two apart: how long each stage
 * took, and who the clock was running against while it did.
 */
export default async function ProjectTimePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/time`);
  const project = await getProject(principal, code);
  const time = project.snapshot.time;

  const blockerSpans = project.blockers.flatMap((blocker) =>
    blocker.ownerships.map((ownership) => ({
      blockerTitle: blocker.title,
      resolved: blocker.resolvedAt !== null,
      ownerTeam: ownership.ownerTeam as Team,
      ownerName: ownership.owner?.name ?? null,
      startedAt: ownership.startedAt,
      endedAt: ownership.endedAt,
      note: ownership.note,
      durationMs: (ownership.endedAt ?? time.now).getTime() - ownership.startedAt.getTime(),
    })),
  );

  const breaches = project.slaBreaches.map((breach) => ({
    id: breach.id,
    kind: breach.kind,
    stage: breach.stage,
    targetDays: breach.targetDays,
    startedAt: breach.startedAt,
    resolvedAt: breach.resolvedAt,
    durationMs: (breach.resolvedAt ?? time.now).getTime() - breach.startedAt.getTime(),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Project age"
          value={formatDuration(time.ageMs, { compact: true })}
          detail={`Started ${formatDate(time.startedAt)}`}
          tone={AGING_BAND_LABEL[time.agingBand].tone}
        />
        <Stat
          label="Current stage"
          value={formatDuration(time.currentStageMs, { compact: true })}
          detail={
            time.currentStageTargetMs === null
              ? STAGES[project.stage].label
              : `${STAGES[project.stage].label} - target ${formatDuration(time.currentStageTargetMs, { compact: true })}`
          }
          tone={time.currentStageOverTarget ? 'danger' : 'success'}
        />
        <Stat
          label="Against target launch"
          value={
            time.daysToTarget === null
              ? 'No target'
              : time.daysToTarget >= 0
                ? `${formatDays(time.daysToTarget)} left`
                : `${formatDays(time.daysToTarget)} late`
          }
          detail={
            time.targetLaunchDate ? formatDate(time.targetLaunchDate) : 'Set a target launch date'
          }
          tone={time.onSchedule === false ? 'danger' : time.onSchedule ? 'success' : 'muted'}
        />
        <Stat
          label="Total blocked"
          value={formatDuration(time.totalBlockedMs, { compact: true })}
          detail={`${Math.round((time.totalBlockedMs / Math.max(1, time.ageMs)) * 100)}% of the project's life`}
          tone={time.totalBlockedMs > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card>
        <CardHeader
          title="Who owns the elapsed time"
          description="Stage time is charged to the team the stage belongs to. While a blocker is open, its owner is charged instead - so no millisecond is counted twice."
        />
        <CardBody className="space-y-5">
          <TeamSplitBar
            byTeam={time.byTeam}
            format={(ms) => formatDuration(ms, { compact: true })}
            height="lg"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEAMS_ORDER.map((team) => (
              <div key={team} className="border-line rounded-[var(--radius-md)] border p-3">
                <p className="text-muted text-[11.5px] font-medium">{TEAM_LABEL[team].label}</p>
                <p className="tabular text-ink mt-1 text-[19px] font-semibold leading-6">
                  {formatDuration(time.byTeam[team], { compact: true })}
                </p>
                <p className="tabular text-faint mt-0.5 text-[12px]">
                  {time.byTeamPercent[team]}% of elapsed time
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Time in each stage"
            description="Summed across repeat visits, so re-work is visible rather than hidden."
          />
          <CardBody>
            {time.byStage.length === 0 ? (
              <Empty title="No stage history yet" className="py-8" />
            ) : (
              <ul className="space-y-3">
                {time.byStage.map((entry) => {
                  const share = time.ageMs > 0 ? (entry.totalMs / time.ageMs) * 100 : 0;
                  const isCurrent = entry.stage === project.stage;
                  return (
                    <li key={entry.stage}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-[13px]',
                              isCurrent ? 'text-ink font-semibold' : 'text-ink-soft',
                            )}
                          >
                            {STAGES[entry.stage].label}
                          </span>
                          {entry.visits > 1 && (
                            <span className="bg-warning-soft text-warning-ink shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium">
                              {entry.visits} visits
                            </span>
                          )}
                          <span className="text-faint shrink-0 text-[11px]">
                            {TEAM_LABEL[STAGES[entry.stage].ownerTeam].label}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'tabular shrink-0 text-[12.5px]',
                            entry.overTarget ? 'text-danger-ink font-medium' : 'text-muted',
                          )}
                        >
                          {formatDuration(entry.totalMs, { compact: true })}
                          {entry.targetMs !== null && (
                            <span className="text-faint ml-1">
                              / {formatDuration(entry.targetMs, { compact: true })}
                            </span>
                          )}
                        </span>
                      </div>
                      <ProgressBar
                        value={share}
                        size="sm"
                        tone={entry.overTarget ? 'danger' : isCurrent ? 'accent' : 'muted'}
                        label={`${STAGES[entry.stage].label}: ${formatDuration(entry.totalMs)}`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ageing & schedule" />
          <CardBody>
            <DetailList>
              <DetailRow label="Ageing band">
                <StatusPill descriptor={AGING_BAND_LABEL[time.agingBand]} size="sm" />
              </DetailRow>
              <DetailRow label="Days running">
                <span className="tabular">{Math.floor(time.ageDays)}</span>
              </DetailRow>
              <DetailRow label="Target launch">
                {time.targetLaunchDate ? formatDate(time.targetLaunchDate) : 'Not set'}
              </DetailRow>
              <DetailRow label="Days ahead / behind">
                <span
                  className={cn(
                    'tabular',
                    time.onSchedule === false ? 'text-danger-ink' : 'text-success-ink',
                  )}
                >
                  {time.daysToTarget === null
                    ? '-'
                    : `${time.daysToTarget >= 0 ? '+' : ''}${Math.round(time.daysToTarget)}`}
                </span>
              </DetailRow>
              <DetailRow label="Inactive for">
                {time.inactiveDays === null
                  ? '-'
                  : `${Math.floor(time.inactiveDays)} day${Math.floor(time.inactiveDays) === 1 ? '' : 's'}`}
              </DetailRow>
            </DetailList>

            {project.snapshot.health.reasons.length > 0 && (
              <Alert
                tone={
                  project.snapshot.health.health === 'BLOCKED'
                    ? 'danger'
                    : project.snapshot.health.health === 'AT_RISK'
                      ? 'warning'
                      : 'success'
                }
                dense
                className="mt-4"
              >
                <ul className="space-y-0.5">
                  {project.snapshot.health.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Blocker timers"
          count={blockerSpans.length}
          description="Every span a blocker spent with a particular owner. When ownership changed, the previous timer stopped and the next one started."
        />
        {blockerSpans.length === 0 ? (
          <Empty
            title="No blocker has ever been opened"
            description="Nothing has needed a timer of its own."
            className="py-10"
          />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[16rem]">Blocker</TH>
                  <TH>Owner</TH>
                  <TH>From</TH>
                  <TH>To</TH>
                  <TH numeric>Held for</TH>
                  <TH className="min-w-[12rem]">Note</TH>
                </tr>
              </THead>
              <TBody>
                {blockerSpans
                  .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
                  .map((span, index) => (
                    <TR key={`${span.blockerTitle}-${index}`}>
                      <TD>
                        <span className="text-ink line-clamp-2 text-[12.5px]">
                          {span.blockerTitle}
                        </span>
                        {!span.resolved && (
                          <span className="text-danger-ink mt-0.5 block text-[11px] font-medium">
                            still open
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span className="text-ink-soft text-[12.5px]">
                          {span.ownerName ?? TEAM_LABEL[span.ownerTeam].label}
                        </span>
                        {span.ownerName && (
                          <span className="text-faint block text-[11px]">
                            {TEAM_LABEL[span.ownerTeam].label}
                          </span>
                        )}
                      </TD>
                      <TD className="text-muted text-[12.5px]">{formatDate(span.startedAt)}</TD>
                      <TD className="text-muted text-[12.5px]">
                        {span.endedAt ? formatDate(span.endedAt) : 'now'}
                      </TD>
                      <TD numeric>
                        <span
                          className={cn(
                            'tabular text-[12.5px] font-medium',
                            span.endedAt === null ? 'text-danger-ink' : 'text-ink',
                          )}
                        >
                          {formatDuration(span.durationMs, { compact: true })}
                        </span>
                      </TD>
                      <TD className="text-muted text-[12px]">{span.note ?? '-'}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>

      <Card>
        <CardHeader
          title="SLA breach history"
          count={breaches.length}
          description="A formal record of every time a stage or the target launch date ran over, and when it stopped. Unlike the live figures above, this stays even after the project moves on."
        />
        {breaches.length === 0 ? (
          <Empty
            title="No breach has ever been recorded"
            description="Every stage and the target launch date have stayed within target so far."
            className="py-10"
          />
        ) : (
          <TableScroller className="rounded-none border-0 shadow-none">
            <Table>
              <THead>
                <tr>
                  <TH className="min-w-[14rem]">Breach</TH>
                  <TH>Target</TH>
                  <TH>Started</TH>
                  <TH>Resolved</TH>
                  <TH numeric>Duration</TH>
                </tr>
              </THead>
              <TBody>
                {breaches
                  .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
                  .map((breach) => (
                    <TR key={breach.id}>
                      <TD>
                        <span className="text-ink text-[12.5px]">
                          {breach.kind === 'STAGE_OVERRUN' && breach.stage
                            ? `${STAGES[breach.stage].label} ran over`
                            : 'Target launch date passed'}
                        </span>
                        {!breach.resolvedAt && (
                          <span className="text-danger-ink mt-0.5 block text-[11px] font-medium">
                            still open
                          </span>
                        )}
                      </TD>
                      <TD className="text-muted text-[12.5px]">
                        {breach.targetDays !== null
                          ? `${breach.targetDays} day${breach.targetDays === 1 ? '' : 's'}`
                          : formatDate(breach.startedAt)}
                      </TD>
                      <TD className="text-muted text-[12.5px]">{formatDate(breach.startedAt)}</TD>
                      <TD className="text-muted text-[12.5px]">
                        {breach.resolvedAt ? formatDate(breach.resolvedAt) : 'ongoing'}
                      </TD>
                      <TD numeric>
                        <span
                          className={cn(
                            'tabular text-[12.5px] font-medium',
                            breach.resolvedAt === null ? 'text-danger-ink' : 'text-ink',
                          )}
                        >
                          {formatDuration(breach.durationMs, { compact: true })}
                        </span>
                      </TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </div>
  );
}
