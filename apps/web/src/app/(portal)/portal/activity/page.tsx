import type { Metadata } from 'next';
import { CircleCheck, CircleDot, Circle } from 'lucide-react';
import { formatDate } from '@relay/core';
import { can, writableVisibilities } from '@relay/rbac';
import { Badge, Card, CardBody, CardHeader, cn } from '@relay/ui';
import { CommentComposer } from '@/app/(app)/projects/[code]/activity/activity-controls';
import { CommentThread } from '@/app/(app)/projects/[code]/activity/comment-thread';
import { merchantMilestones, milestoneReachedAt } from '@/features/portal/merchant-copy';
import { findPortalProject } from '@/features/portal/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { NoPortalProject } from '../no-project';

export const metadata: Metadata = { title: 'Conversation' };
export const dynamic = 'force-dynamic';

/**
 * The merchant's conversation with the team. The thread is the same query as
 * the internal one - the visibility filter in the service is what makes it
 * narrower; internal AHN notes are never fetched for this principal. The
 * team's step-by-step stage log is replaced by the five milestones.
 */
export default async function PortalActivityPage() {
  const principal = await requirePrincipalOrRedirect('/portal/activity');
  const project = await findPortalProject(principal);
  if (!project) return <NoPortalProject />;
  const now = project.snapshot.time.now;
  const visibilities = writableVisibilities(principal);
  const canComment = can(principal, 'comment:create');
  const canUploadFiles = can(principal, 'asset:upload');
  const milestones = merchantMilestones(project.stage, project.snapshot.visitedStages);
  const reachedAt = milestoneReachedAt(project.activities);
  const onHold = project.stage === 'ON_HOLD_BLOCKED';

  return (
    <div className="space-y-4">
      {canComment && (
        <CommentComposer
          code={project.code}
          visibilities={visibilities}
          people={[]}
          canAttachImages={canUploadFiles}
          simple
        />
      )}

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
          simpleComposer
        />
      </Card>

      <Card>
        <CardHeader
          title="Milestones"
          description={
            onHold
              ? 'Your move is paused for now - your team will explain here in Conversation.'
              : 'The five big steps of your move.'
          }
        />
        <CardBody>
          <ol className="space-y-3">
            {milestones.steps.map((step) => {
              const date = reachedAt.get(step.key);
              return (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 shrink-0',
                      step.state === 'done'
                        ? 'text-success-ink'
                        : step.state === 'current'
                          ? 'text-accent-ink'
                          : 'text-faint',
                    )}
                  >
                    {step.state === 'done' ? (
                      <CircleCheck className="size-5" />
                    ) : step.state === 'current' ? (
                      <CircleDot className="size-5" />
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-[13.5px] font-medium',
                          step.state === 'upcoming' ? 'text-muted' : 'text-ink',
                        )}
                      >
                        {step.label}
                      </span>
                      {step.state === 'current' && (
                        <Badge tone={onHold ? 'warning' : 'accent'} size="sm">
                          {onHold ? 'Paused' : 'Now'}
                        </Badge>
                      )}
                      {step.state !== 'upcoming' && date && (
                        <span className="text-faint text-[11.5px]">{formatDate(date)}</span>
                      )}
                    </p>
                    <p className="text-muted mt-0.5 text-[12.5px] leading-5">{step.phase}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
