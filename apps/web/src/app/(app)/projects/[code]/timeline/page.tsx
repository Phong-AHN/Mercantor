import { ACTIVITY_TYPE_LABEL, formatDate, formatDateTime, formatRelative } from '@relay/core';
import { Card, CardBody, CardHeader, Empty, Timeline, TimelineItem } from '@relay/ui';
import { getProject } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const dynamic = 'force-dynamic';

/**
 * The chronological source of truth: introduction, response, kickoff, access,
 * assets, design, feedback, development, QA, SHOPLINE review, deployment - in
 * the order it actually happened, with nothing editable after the fact.
 */
export default async function ProjectTimelinePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/timeline`);
  const project = await getProject(principal, code);
  const now = project.snapshot.time.now;

  // Grouped by day, because "what happened on Tuesday" is how people ask.
  const byDay = new Map<string, typeof project.activities>();
  for (const event of project.activities) {
    const key = event.occurredAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(event);
    else byDay.set(key, [event]);
  }

  return (
    <Card>
      <CardHeader
        title="Communication history"
        count={project.activities.length}
        description="Every recorded event on this project, newest first. Written by the portal as things happen - not typed in afterwards."
      />
      <CardBody>
        {project.activities.length === 0 ? (
          <Empty title="Nothing recorded yet" className="py-12" />
        ) : (
          <div className="space-y-6">
            {[...byDay.entries()].map(([day, events]) => (
              <section key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="text-muted text-[12px] font-semibold uppercase tracking-wide">
                    {formatDate(new Date(day))}
                  </h3>
                  <span className="bg-line h-px flex-1" />
                  <span className="text-faint text-[11.5px]">
                    {events.length} event{events.length === 1 ? '' : 's'}
                  </span>
                </div>

                <Timeline>
                  {events.map((event, index) => (
                    <TimelineItem
                      key={event.id}
                      tone={ACTIVITY_TYPE_LABEL[event.type].tone}
                      title={event.summary}
                      meta={
                        <span title={formatDateTime(event.occurredAt)}>
                          {formatRelative(event.occurredAt, now)}
                        </span>
                      }
                      connector={index < events.length - 1}
                    >
                      {event.detail && <p className="whitespace-pre-wrap">{event.detail}</p>}
                      <p className="text-faint mt-1 flex flex-wrap items-center gap-2 text-[11.5px]">
                        <span className="bg-surface-2 rounded-full px-2 py-0.5">
                          {ACTIVITY_TYPE_LABEL[event.type].label}
                        </span>
                        {event.actor && <span>{event.actor.name}</span>}
                      </p>
                    </TimelineItem>
                  ))}
                </Timeline>
              </section>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
