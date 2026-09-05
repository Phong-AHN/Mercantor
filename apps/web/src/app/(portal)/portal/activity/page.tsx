import type { Metadata } from 'next';
import { ACTIVITY_TYPE_LABEL, formatRelative } from '@relay/core';
import { can, writableVisibilities } from '@relay/rbac';
import { Card, CardBody, CardHeader, Empty, Timeline, TimelineItem } from '@relay/ui';
import { CommentComposer } from '@/app/(app)/projects/[code]/activity/activity-controls';
import { CommentThread } from '@/app/(app)/projects/[code]/activity/comment-thread';
import { getPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Activity' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's feed. It is the same query as the internal one - the
 * visibility filter in the service is what makes it narrower, not a different
 * page. Internal AHN notes are never fetched for this principal.
 */
export default async function PortalActivityPage() {
  const principal = await requirePrincipalOrRedirect('/portal/activity');
  const project = await getPortalProject(principal);
  const now = project.snapshot.time.now;
  const visibilities = writableVisibilities(principal);
  const canComment = can(principal, 'comment:create');
  const canUploadFiles = can(principal, 'asset:upload');

  return (
    <div className="space-y-4">
      <CommentComposer code={project.code} visibilities={visibilities} people={[]} />

      <Card>
        <CardHeader
          title="Conversation"
          count={project.comments.length}
          description="Everything AHN and SHOPLINE have shared with you, and everything you have sent back."
        />
        <CommentThread
          code={project.code}
          comments={project.comments}
          now={now}
          people={[]}
          visibilities={visibilities}
          canReply={canComment}
          canManage={false}
          canUploadFiles={canUploadFiles}
        />
      </Card>

      <Card>
        <CardHeader
          title="Milestones"
          description="The record of what has happened on your migration."
        />
        <CardBody>
          {project.activities.length === 0 ? (
            <Empty title="Nothing recorded yet" className="py-8" />
          ) : (
            <Timeline>
              {project.activities.map((event, index, list) => (
                <TimelineItem
                  key={event.id}
                  tone={ACTIVITY_TYPE_LABEL[event.type].tone}
                  title={event.summary}
                  meta={formatRelative(event.occurredAt, now)}
                  connector={index < list.length - 1}
                >
                  {event.detail && <p>{event.detail}</p>}
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
