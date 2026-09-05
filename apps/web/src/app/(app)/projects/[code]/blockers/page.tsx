import {
  BLOCKER_CATEGORY_LABEL,
  formatDate,
  formatDuration,
  TEAM_LABEL,
  type Team,
} from '@relay/core';
import { can } from '@relay/rbac';
import { Badge, Card, CardBody, CardHeader, cn, Empty, Section, StatusPill } from '@relay/ui';
import { DueDate } from '@/components/domain';
import { getProject, listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { BlockerControls, OpenBlockerButton } from './blocker-controls';

export const dynamic = 'force-dynamic';

export default async function ProjectBlockersPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/blockers`);
  const [project, people] = await Promise.all([getProject(principal, code), listAssignableUsers()]);

  const manage = can(principal, 'blocker:manage');
  const now = project.snapshot.time.now;
  const open = project.blockers.filter((blocker) => blocker.resolvedAt === null);
  const resolved = project.blockers.filter((blocker) => blocker.resolvedAt !== null);
  const assignees = people.all.map((person) => ({ id: person.id, name: person.name }));

  return (
    <div className="space-y-5">
      <Section
        title="Open blockers"
        description="Each one has its own clock. Reassigning it stops the previous owner's timer and starts the next."
        actions={manage ? <OpenBlockerButton code={project.code} people={assignees} /> : null}
      >
        {open.length === 0 ? (
          <Card>
            <Empty
              title="Nothing is blocked"
              description="This project has a clear next step and nobody is waiting on anybody."
              className="py-12"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {open.map((blocker) => (
              <Card key={blocker.id} className="border-danger/30">
                <CardHeader
                  title={blocker.title}
                  description={blocker.description ?? undefined}
                  actions={
                    <div className="flex items-center gap-2">
                      <StatusPill descriptor={BLOCKER_CATEGORY_LABEL[blocker.category]} size="sm" />
                      <Badge tone="danger" size="sm" dot>
                        open{' '}
                        {formatDuration(now.getTime() - blocker.startedAt.getTime(), {
                          compact: true,
                        })}
                      </Badge>
                    </div>
                  }
                />
                <CardBody className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Fact label="Owned by">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn('size-2 rounded-full', TEAM_DOT[blocker.ownerTeam as Team])}
                        />
                        {blocker.owner?.name ?? TEAM_LABEL[blocker.ownerTeam].label}
                      </span>
                    </Fact>
                    <Fact label="Next action">{blocker.nextAction ?? 'Not recorded'}</Fact>
                    <Fact label="Due">
                      <DueDate date={blocker.dueDate} now={now} />
                    </Fact>
                  </div>

                  <div>
                    <p className="text-faint mb-2 text-[11px] font-semibold uppercase tracking-wide">
                      Ownership history
                    </p>
                    <ol className="space-y-1.5">
                      {blocker.ownerships.map((ownership) => {
                        const duration =
                          (ownership.endedAt ?? now).getTime() - ownership.startedAt.getTime();
                        return (
                          <li
                            key={ownership.id}
                            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12.5px]"
                          >
                            <span className="text-ink flex items-center gap-1.5 font-medium">
                              <span
                                className={cn(
                                  'size-1.5 rounded-full',
                                  TEAM_DOT[ownership.ownerTeam as Team],
                                )}
                              />
                              {ownership.owner?.name ?? TEAM_LABEL[ownership.ownerTeam].label}
                            </span>
                            <span className="tabular text-muted">
                              {formatDuration(duration, { compact: true })}
                            </span>
                            <span className="text-faint">
                              {formatDate(ownership.startedAt)} &rarr;{' '}
                              {ownership.endedAt ? formatDate(ownership.endedAt) : 'now'}
                            </span>
                            {ownership.note && (
                              <span className="text-muted">- {ownership.note}</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {manage && (
                    <BlockerControls
                      code={project.code}
                      blockerId={blocker.id}
                      currentTeam={blocker.ownerTeam}
                      people={assignees}
                    />
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Resolved"
        description="Kept, because how long something was blocked is part of why the project took as long as it did."
      >
        {resolved.length === 0 ? (
          <Card>
            <Empty title="Nothing resolved yet" className="py-8" />
          </Card>
        ) : (
          <div className="space-y-2">
            {resolved.map((blocker) => {
              const heldMs = (blocker.resolvedAt ?? now).getTime() - blocker.startedAt.getTime();
              return (
                <Card key={blocker.id} variant="flat">
                  <CardBody className="py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink text-[13.5px] font-medium leading-5">
                          {blocker.title}
                        </p>
                        {blocker.resolution && (
                          <p className="text-muted mt-0.5 text-[12.5px]">{blocker.resolution}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone="success" size="sm">
                          resolved {formatDate(blocker.resolvedAt)}
                        </Badge>
                        <p className="tabular text-faint mt-1 text-[11.5px]">
                          blocked for {formatDuration(heldMs, { compact: true })}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

const TEAM_DOT: Record<Team, string> = {
  AHN: 'bg-team-ahn',
  SHOPLINE: 'bg-team-shopline',
  MERCHANT: 'bg-team-merchant',
  OTHER: 'bg-team-other',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-faint text-[11px] font-semibold uppercase tracking-wide">{label}</p>
      <div className="text-ink-soft mt-1 text-[13px]">{children}</div>
    </div>
  );
}
