import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import {
  formatDuration,
  LINEAR_STAGES,
  STAGES,
  STAGE_PHASE_LABEL,
  TEAM_LABEL,
  type StagePhase,
} from '@relay/core';
import { AvatarStack, cn, Empty, TEAM_BAR } from '@relay/ui';
import { AgingPill, DueDate, HealthPill } from '@/components/domain';
import type { ProjectListItem } from '@/features/projects/queries';

const PHASES: StagePhase[] = ['ONBOARDING', 'BUILD', 'REVIEW', 'LAUNCH'];

/**
 * Board view: one column per phase, cards inside grouped by stage. Phase rather
 * than stage keeps the board readable - seventeen columns is a spreadsheet, not
 * a board.
 */
export function ProjectBoard({
  projects,
  now,
}: {
  projects: readonly ProjectListItem[];
  now: Date;
}) {
  if (projects.length === 0) {
    return (
      <div className="border-line bg-surface-1 rounded-[var(--radius-lg)] border">
        <Empty title="No projects match these filters" />
      </div>
    );
  }

  const onHold = projects.filter((project) => project.stage === 'ON_HOLD_BLOCKED');

  return (
    <div className="scrollbar-slim overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {PHASES.map((phase) => {
          const stages = LINEAR_STAGES.filter((stage) => STAGES[stage].phase === phase);
          const inPhase = projects.filter((project) => stages.includes(project.stage));
          return (
            <section key={phase} className="w-[19rem] shrink-0">
              <header className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-faint text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {STAGE_PHASE_LABEL[phase]}
                </h2>
                <span className="tabular bg-surface-2 text-muted rounded-full px-2 py-0.5 text-[11px] font-medium">
                  {inPhase.length}
                </span>
              </header>

              <div className="bg-surface-2/45 space-y-2 rounded-[var(--radius-lg)] p-2">
                {inPhase.length === 0 && (
                  <p className="text-faint px-2 py-6 text-center text-[12px]">Nothing here</p>
                )}
                {stages.map((stage) => {
                  const cards = inPhase.filter((project) => project.stage === stage);
                  if (cards.length === 0) return null;
                  return (
                    <div key={stage} className="space-y-2">
                      <p className="text-muted px-1 pt-1 text-[11px] font-medium">
                        {STAGES[stage].label}
                      </p>
                      {cards.map((project) => (
                        <ProjectCard key={project.id} project={project} now={now} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {onHold.length > 0 && (
          <section className="w-[19rem] shrink-0">
            <header className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-danger-ink text-[11px] font-semibold uppercase tracking-[0.12em]">
                On hold
              </h2>
              <span className="tabular bg-danger-soft text-danger-ink rounded-full px-2 py-0.5 text-[11px] font-medium">
                {onHold.length}
              </span>
            </header>
            <div className="bg-danger-soft/40 space-y-2 rounded-[var(--radius-lg)] p-2">
              {onHold.map((project) => (
                <ProjectCard key={project.id} project={project} now={now} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, now }: { project: ProjectListItem; now: Date }) {
  const owner = project.blocker?.ownerTeam ?? project.nextActionOwnerTeam ?? 'OTHER';

  return (
    <Link
      href={`/projects/${project.code}`}
      className="border-line bg-surface-1 shadow-card hover:shadow-raised block rounded-[var(--radius-md)] border p-3 transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[13.5px] font-semibold leading-5">
            {project.merchant.name}
          </p>
          <p className="text-faint font-mono text-[10.5px]">{project.code}</p>
        </div>
        <HealthPill health={project.snapshot.health.health} size="sm" />
      </div>

      {project.blocker && (
        <p className="bg-danger-soft text-danger-ink mt-2 flex items-start gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[11.5px] leading-4">
          <OctagonAlert className="mt-px size-3 shrink-0" />
          <span className="line-clamp-2">{project.blocker.title}</span>
        </p>
      )}

      <p className="text-muted mt-2 line-clamp-2 text-[12px] leading-4">
        {project.nextAction ?? 'No next step recorded.'}
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-muted flex items-center gap-1.5 text-[11.5px]">
          <span className={cn('size-1.5 rounded-full', TEAM_BAR[owner])} />
          {project.nextActionOwner?.name ?? TEAM_LABEL[owner].label}
        </span>
        <AgingPill
          band={project.snapshot.time.agingBand}
          ageMs={project.snapshot.time.ageMs}
          size="sm"
        />
      </div>

      <div className="border-line mt-2.5 flex items-center justify-between gap-2 border-t pt-2.5">
        <AvatarStack
          people={[project.people.ahnPm, project.people.ahnDev, project.people.shoplineAm]
            .filter((person): person is NonNullable<typeof person> => person !== null)
            .map((person) => ({ name: person.name, team: person.team }))}
          size="xs"
        />
        <span className="text-faint text-[11px]">
          {project.targetLaunchDate ? (
            <DueDate date={project.targetLaunchDate} now={now} />
          ) : (
            'No launch date'
          )}
        </span>
      </div>

      <p className="tabular text-faint mt-1.5 text-[10.5px]">
        {formatDuration(project.snapshot.time.currentStageMs, { compact: true })} in this stage
      </p>
    </Link>
  );
}
