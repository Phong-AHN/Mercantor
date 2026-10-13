import 'server-only';
import { ForbiddenError, type CommentVisibility } from '@relay/core';
import type { DbTransaction } from '@relay/db';
import { readableVisibilities, type Principal } from '@relay/rbac';

export interface AttachmentTargets {
  assetItemId?: string | null;
  accessItemId?: string | null;
  issueId?: string | null;
  commentId?: string | null;
}

/**
 * Checks every record an attachment is about to hang off belongs to the
 * project it is being created on, before the row exists.
 *
 * Without this, an id from another project - another organization's, even -
 * could be passed with this project's code: the attachment would be linked
 * across the tenant boundary, show up wherever the other record lists its
 * attachments (an issue's do, by relation), and be deleted along with it.
 * A comment additionally has to be one this person can read, so a merchant
 * cannot drop a file onto an AHN-internal note whose id they learned.
 *
 * Returns the comment's visibility, which the attachment's activity row
 * inherits (null when there is no comment).
 */
export async function assertAttachmentTargets(
  tx: DbTransaction,
  principal: Principal,
  projectId: string,
  targets: AttachmentTargets,
): Promise<CommentVisibility | null> {
  const refused = () => new ForbiddenError('That item does not belong to this project.');

  if (targets.assetItemId) {
    const item = await tx.assetItem.findFirst({
      where: { id: targets.assetItemId, projectId },
      select: { id: true },
    });
    if (!item) throw refused();
  }
  if (targets.accessItemId) {
    const item = await tx.accessItem.findFirst({
      where: { id: targets.accessItemId, projectId },
      select: { id: true },
    });
    if (!item) throw refused();
  }
  if (targets.issueId) {
    const issue = await tx.issue.findFirst({
      where: { id: targets.issueId, projectId },
      select: { id: true },
    });
    if (!issue) throw refused();
  }
  if (targets.commentId) {
    const comment = await tx.comment.findFirst({
      where: { id: targets.commentId, projectId, deletedAt: null },
      select: { visibility: true },
    });
    if (!comment || !readableVisibilities(principal).includes(comment.visibility)) {
      throw new ForbiddenError('That comment does not belong to this project.');
    }
    return comment.visibility;
  }
  return null;
}
