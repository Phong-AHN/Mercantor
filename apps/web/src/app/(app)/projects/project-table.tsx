import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import {
  formatDuration,
  formatMoney,
  INVOICE_STATUS_LABEL,
  TEAM_LABEL,
  type Team,
} from '@relay/core';
import {
  AvatarStack,
  Badge,
  Empty,
  Table,
  TableMessage,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TargetMeter,
} from '@relay/ui';
import { AgingPill, DueDate, HealthPill, ProjectLink, StagePill } from '@/components/domain';
import type { ProjectListItem } from '@/features/projects/queries';

/**
 * The portfolio table. Each row answers, left to right: where is it, is it
 * healthy, how long has it run, how long in this stage, what is blocking it,
 * who owes the next step, when does it launch.
 */
export function ProjectTable({
  projects,
  now,
  showMoney,
}: {
  projects: readonly ProjectListItem[];
  now: Date;
  showMoney: boolean;
}) {
  const columns = showMoney ? 9 : 8;

  return (
    <TableScroller>
      <Table>
        <THead>
          <tr>
            <TH className="w-[16%] min-w-[12rem]">Merchant</TH>
            <TH>Stage</TH>
            <TH>Health</TH>
            <TH numeric>Age</TH>
            <TH className="w-[10%] min-w-[8rem]">In stage</TH>
            <TH className="w-[20%] min-w-[11rem]">Blocked on</TH>
            <TH className="w-[20%] min-w-[11rem]">Next step</TH>
            <TH>Launch</TH>
            {showMoney && <TH>Invoicing</TH>}
            <TH className="min-w-[5rem]">Team</TH>
          </tr>
        </THead>
        <TBody>
          {projects.length === 0 && (
            <TableMessage colSpan={columns + 1}>
              <Empty
                title="No projects match these filters"
                description="Clear a filter or two and try again."
              />
            </TableMessage>
          )}

          {projects.map((project) => {
            const time = project.snapshot.time;
            const owner: Team =
              project.blocker?.ownerTeam ?? project.nextActionOwnerTeam ?? 'OTHER';

            return (
              <TR key={project.id} interactive>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <ProjectLink code={project.code} name={project.merchant.name} />
                  </div>
                  <p className="text-faint mt-0.5 truncate text-[11.5px]">
                    {project.merchant.platform ?? 'Platform unknown'}
                    {project.merchant.storeId ? ` - ${project.merchant.storeId}` : ''}
                  </p>
                </TD>

                <TD>
                  <StagePill stage={project.stage} size="sm" />
                </TD>

                <TD>
                  <HealthPill
                    health={project.snapshot.health.health}
                    size="sm"
                    reason={project.snapshot.health.reasons.join(' ')}
                  />
                </TD>

                <TD numeric>
                  <AgingPill band={time.agingBand} ageMs={time.ageMs} size="sm" />
                </TD>

                <TD>
                  <TargetMeter
                    value={time.currentStageMs}
                    target={time.currentStageTargetMs}
                    format={(ms) => formatDuration(ms, { compact: true })}
                  />
                </TD>

                <TD>
                  {project.blocker ? (
                    <Link
                      href={`/projects/${project.code}#blockers`}
                      className="group flex items-start gap-2"
                    >
                      <OctagonAlert className="text-danger mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="text-ink group-hover:text-accent-ink block truncate text-[12.5px] font-medium">
                          {project.blocker.title}
                        </span>
                        <span className="text-muted block text-[11.5px]">
                          {project.blocker.ownerName ?? TEAM_LABEL[project.blocker.ownerTeam].label}{' '}
                          &middot;{' '}
                          <span className="tabular">
                            {formatDuration(now.getTime() - project.blocker.startedAt.getTime(), {
                              compact: true,
                            })}
                          </span>
                        </span>
                      </span>
                    </Link>
                  ) : (
                    <span className="text-success-ink text-[12.5px]">Not blocked</span>
                  )}
                </TD>

                <TD>
                  <p className="text-ink line-clamp-2 text-[12.5px] leading-4">
                    {project.nextAction ?? (
                      <span className="text-faint">No next step recorded</span>
                    )}
                  </p>
                  <p className="text-muted mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                    <span>{project.nextActionOwner?.name ?? TEAM_LABEL[owner].label}</span>
                    {project.nextActionDueDate && (
                      <>
                        <span className="text-faint">&middot;</span>
                        <DueDate date={project.nextActionDueDate} now={now} />
                      </>
                    )}
                  </p>
                </TD>

                <TD>
                  <DueDate date={project.targetLaunchDate} now={now} />
                </TD>

                {showMoney && (
                  <TD>
                    <Badge
                      tone={INVOICE_STATUS_LABEL[project.snapshot.invoice.status].tone}
                      size="sm"
                    >
                      {INVOICE_STATUS_LABEL[project.snapshot.invoice.status].label}
                    </Badge>
                    {project.snapshot.invoice.outstandingMinor > 0 && (
                      <p className="tabular text-muted mt-0.5 text-[11.5px]">
                        {formatMoney(
                          project.snapshot.invoice.outstandingMinor,
                          project.snapshot.invoice.currency,
                          { compact: true },
                        )}{' '}
                        due
                      </p>
                    )}
                  </TD>
                )}

                <TD>
                  <AvatarStack
                    people={[
                      project.people.ahnPm,
                      project.people.ahnDev,
                      project.people.shoplineAm,
                      project.people.shoplineSe,
                    ]
                      .filter((person): person is NonNullable<typeof person> => person !== null)
                      .map((person) => ({ name: person.name, team: person.team }))}
                    size="sm"
                  />
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableScroller>
  );
}
