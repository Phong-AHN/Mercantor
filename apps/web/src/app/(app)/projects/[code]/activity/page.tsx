import { COMMENT_CATEGORY_LABEL, COMMENT_VISIBILITY_LABEL, formatRelative } from '@relay/core';
import { can, writableVisibilities } from '@relay/rbac';
import { Card, CardBody, CardHeader, Empty, StatusPill } from '@relay/ui';
import { getProject, listAssignableUsers } from '@/features/projects/queries';
import { requirePrincipalOrRedirect } from '@/server/session';
import { CommentComposer, RecordSlackButton } from './activity-controls';
import { CommentThread } from './comment-thread';

export const dynamic = 'force-dynamic';

export default async function ProjectActivityPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const principal = await requirePrincipalOrRedirect(`/projects/${code}/activity`);
  const [project, people] = await Promise.all([getProject(principal, code), listAssignableUsers()]);

  const now = project.snapshot.time.now;
  const canComment = can(principal, 'comment:create');
  const canManage = can(principal, 'comment:manage');
  const canUploadFiles = can(principal, 'asset:upload');
  const visibilities = writableVisibilities(principal);
  const openItems = project.comments.filter(
    (comment) => comment.status === 'OPEN' || comment.status === 'IN_PROGRESS',
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        {canComment && (
          <CommentComposer code={project.code} visibilities={visibilities} people={people.all} />
        )}

        <Card>
          <CardHeader
            title="Conversation"
            count={project.comments.length}
            description="Updates, questions, feedback and issues - all against the record rather than in somebody's inbox."
            actions={canComment ? <RecordSlackButton code={project.code} /> : null}
          />
          <CommentThread
            code={project.code}
            comments={project.comments}
            now={now}
            people={people.all}
            visibilities={visibilities}
            canReply={canComment}
            canManage={canManage}
            canUploadFiles={canUploadFiles}
          />
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Needs an answer"
            count={openItems.length}
            description="Items somebody flagged as open."
          />
          <CardBody>
            {openItems.length === 0 ? (
              <Empty title="Nothing outstanding" className="py-6" />
            ) : (
              <ul className="space-y-3">
                {openItems.map((comment) => (
                  <li key={comment.id} className="border-danger/50 border-l-2 pl-3">
                    <p className="text-muted text-[11.5px]">
                      {COMMENT_CATEGORY_LABEL[comment.category].label} &middot;{' '}
                      {comment.author.name}
                    </p>
                    <p className="text-ink-soft mt-0.5 line-clamp-3 text-[12.5px] leading-4">
                      {comment.body}
                    </p>
                    <p className="text-faint mt-1 text-[11px]">
                      {formatRelative(comment.createdAt, now)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Who can see what" />
          <CardBody>
            <ul className="space-y-2.5">
              {(['INTERNAL_AHN', 'AHN_SHOPLINE', 'EVERYONE'] as const).map((visibility) => (
                <li key={visibility}>
                  <StatusPill
                    descriptor={COMMENT_VISIBILITY_LABEL[visibility]}
                    size="sm"
                    dot={false}
                  />
                  <p className="text-muted mt-1 text-[12px] leading-4">
                    {COMMENT_VISIBILITY_LABEL[visibility].hint}
                  </p>
                </li>
              ))}
            </ul>
            <p className="border-line text-faint mt-4 border-t pt-3 text-[11.5px] leading-4">
              Visibility is applied when the feed is queried, not when it is drawn - a note you
              cannot see is never sent to your browser.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
