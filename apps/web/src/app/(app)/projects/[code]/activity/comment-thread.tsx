'use client';

import { useState } from 'react';
import { MessageSquare, Paperclip } from 'lucide-react';
import {
  COMMENT_CATEGORY_LABEL,
  COMMENT_STATUS_LABEL,
  COMMENT_VISIBILITY_LABEL,
  formatDateTime,
  formatRelative,
  type CommentVisibility,
} from '@relay/core';
import { Avatar, Badge, cn, Empty, StatusPill } from '@relay/ui';
import { FileUploadButton } from '@/app/(app)/projects/[code]/access/access-controls';
import { CommentComposer, ResolveButton } from './activity-controls';

const SOURCE_LABEL: Record<string, string> = {
  PORTAL: 'in the portal',
  SLACK: 'from Slack',
  EMAIL: 'from email',
  CLICKUP: 'from ClickUp',
};

export interface ThreadComment {
  id: string;
  body: string;
  category: keyof typeof COMMENT_CATEGORY_LABEL;
  visibility: CommentVisibility;
  status: keyof typeof COMMENT_STATUS_LABEL;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  parentId: string | null;
  author: { id: string; name: string; role: string };
  mentions: { user: { id: string; name: string } }[];
  attachments: { id: string; kind: 'FILE' | 'LINK'; label: string; url: string }[];
}

interface Person {
  id: string;
  name: string;
}

/**
 * Groups the flat, RBAC-filtered list the server already sent into threads.
 * A reply whose parent this viewer cannot see (a visibility mismatch nobody
 * should really create, but nothing stops it at write time) renders as its
 * own top-level item rather than silently vanishing - the query already
 * decided what this viewer may see; grouping never re-decides that.
 */
function groupThreads(comments: ThreadComment[]): {
  topLevel: ThreadComment[];
  repliesByParent: Map<string, ThreadComment[]>;
} {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const topLevel: ThreadComment[] = [];
  const repliesByParent = new Map<string, ThreadComment[]>();

  for (const comment of comments) {
    if (comment.parentId && byId.has(comment.parentId)) {
      const list = repliesByParent.get(comment.parentId) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parentId, list);
    } else {
      topLevel.push(comment);
    }
  }
  // The source list is newest-first; a thread reads oldest-first.
  for (const list of repliesByParent.values()) list.reverse();

  return { topLevel, repliesByParent };
}

export function CommentThread({
  code,
  comments,
  now,
  people,
  visibilities,
  canReply,
  canManage,
  canUploadFiles,
}: {
  code: string;
  comments: ThreadComment[];
  now: Date;
  people: Person[];
  visibilities: CommentVisibility[];
  canReply: boolean;
  canManage: boolean;
  canUploadFiles: boolean;
}) {
  if (comments.length === 0) {
    return (
      <Empty
        title="Nothing has been said yet"
        description="Post the first update and it becomes part of the project history."
        className="py-12"
      />
    );
  }

  const { topLevel, repliesByParent } = groupThreads(comments);

  return (
    <ul className="divide-line divide-y">
      {topLevel.map((comment) => (
        <li key={comment.id} className="px-5 py-4">
          <CommentRow
            code={code}
            comment={comment}
            repliesByParent={repliesByParent}
            now={now}
            people={people}
            visibilities={visibilities}
            canReply={canReply}
            canManage={canManage}
            canUploadFiles={canUploadFiles}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Recursive on purpose: a reply is itself a comment, and D-032 means "can
 * itself be replied to" literally, not just one level deep. Rendering only
 * looks up `repliesByParent` for the comment it was handed - a flat,
 * one-level lookup here silently drops any reply to a reply, since nothing
 * would ever query that grandchild's own entry in the map.
 */
function CommentRow({
  code,
  comment,
  repliesByParent,
  now,
  people,
  visibilities,
  canReply,
  canManage,
  canUploadFiles,
}: {
  code: string;
  comment: ThreadComment;
  repliesByParent: Map<string, ThreadComment[]>;
  now: Date;
  people: Person[];
  visibilities: CommentVisibility[];
  canReply: boolean;
  canManage: boolean;
  canUploadFiles: boolean;
}) {
  const replies = repliesByParent.get(comment.id) ?? [];
  const [replying, setReplying] = useState(false);

  return (
    <div className="flex gap-3">
      <Avatar
        name={comment.author.name}
        team={
          comment.author.role.startsWith('AHN')
            ? 'AHN'
            : comment.author.role.startsWith('SHOPLINE')
              ? 'SHOPLINE'
              : 'MERCHANT'
        }
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ink text-[13px] font-semibold">{comment.author.name}</span>
          <StatusPill descriptor={COMMENT_CATEGORY_LABEL[comment.category]} size="sm" dot={false} />
          {comment.visibility !== 'AHN_SHOPLINE' && (
            <StatusPill
              descriptor={COMMENT_VISIBILITY_LABEL[comment.visibility]}
              size="sm"
              variant="outline"
              dot={false}
            />
          )}
          {comment.status !== 'NONE' && (
            <StatusPill descriptor={COMMENT_STATUS_LABEL[comment.status]} size="sm" />
          )}
          <span
            className="text-faint ml-auto text-[11.5px]"
            title={formatDateTime(comment.createdAt)}
          >
            {formatRelative(comment.createdAt, now)}
            {comment.source !== 'PORTAL' && ` ${SOURCE_LABEL[comment.source]}`}
          </span>
        </div>

        <p
          className={cn(
            'text-ink-soft mt-1.5 whitespace-pre-wrap text-[13.5px] leading-6',
            comment.visibility === 'INTERNAL_AHN' &&
              'border-danger/50 bg-danger-soft/40 rounded-[var(--radius-sm)] border-l-2 py-2 pl-3 pr-3',
          )}
        >
          {comment.body}
        </p>

        {comment.mentions.length > 0 && (
          <p className="text-muted mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
            mentioned
            {comment.mentions.map((mention) => (
              <Badge key={mention.user.id} tone="accent" size="sm">
                @{mention.user.name}
              </Badge>
            ))}
          </p>
        )}

        {comment.sourceUrl && (
          <a
            href={comment.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-ink mt-1.5 inline-block text-[11.5px] underline-offset-4 hover:underline"
          >
            View the original message
          </a>
        )}

        {comment.attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {comment.attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bg-surface-2 text-accent-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] underline-offset-4 hover:underline"
                >
                  <Paperclip className="size-3" />
                  {attachment.label}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          {canReply && !replying && (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="text-muted hover:text-ink flex items-center gap-1 text-[11.5px] font-medium"
            >
              <MessageSquare className="size-3.5" />
              Reply
            </button>
          )}
          {canUploadFiles && <FileUploadButton code={code} commentId={comment.id} />}
          {canManage && comment.status !== 'NONE' && comment.status !== 'RESOLVED' && (
            <ResolveButton code={code} commentId={comment.id} />
          )}
        </div>

        {replying && (
          <div className="border-line bg-surface-2/40 mt-2 rounded-[var(--radius-md)] border">
            <CommentComposer
              code={code}
              visibilities={visibilities}
              people={people}
              parentId={comment.id}
              compact
              autoFocus
              onPosted={() => setReplying(false)}
            />
          </div>
        )}

        {replies.length > 0 && (
          <ul className="border-line mt-3 space-y-3 border-l pl-4">
            {replies.map((reply) => (
              <li key={reply.id}>
                <CommentRow
                  code={code}
                  comment={reply}
                  repliesByParent={repliesByParent}
                  now={now}
                  people={people}
                  visibilities={visibilities}
                  canReply={canReply}
                  canManage={canManage}
                  canUploadFiles={canUploadFiles}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
