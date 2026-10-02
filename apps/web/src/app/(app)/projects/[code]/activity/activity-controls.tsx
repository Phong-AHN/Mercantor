'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, CircleCheck, Hash, ImagePlus, Pencil, Send } from 'lucide-react';
import {
  COMMENT_CATEGORIES,
  COMMENT_CATEGORY_LABEL,
  COMMENT_VISIBILITY_LABEL,
  type CommentCategory,
  type CommentVisibility,
} from '@relay/core';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  cn,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import { confirmUploadAction } from '@/features/attachments/actions';
import {
  postCommentAction,
  recordSlackMessageAction,
  resolveCommentAction,
  updateCommentAction,
} from '@/features/activity/actions';
import {
  acceptImages,
  COMMENT_IMAGE_TYPES,
  MAX_COMMENT_IMAGES,
  PendingImageStrip,
  uploadImages,
  type PendingImage,
  type UploadedImage,
} from './comment-images';

interface Person {
  id: string;
  name: string;
}

/**
 * The composer. Category, visibility and "needs an answer" are set before
 * posting rather than fixed afterwards, because a note nobody classified is a
 * note nobody triages.
 *
 * `parentId` turns it into a reply, and `compact` sheds the controls a reply
 * does not need (category, Slack) so a thread does not feel like filling out
 * the same form twice.
 *
 * With `canAttachImages`, images can go on the update too - picked, pasted
 * (a screenshot straight from the clipboard) or dropped. They are uploaded
 * before the update is posted, so a failed upload never leaves a posted
 * update missing the picture it describes, and linked to it right after.
 */
export function CommentComposer({
  code,
  visibilities,
  people,
  parentId,
  compact = false,
  autoFocus = false,
  canAttachImages = false,
  onPosted,
}: {
  code: string;
  visibilities: CommentVisibility[];
  people: Person[];
  parentId?: string;
  compact?: boolean;
  autoFocus?: boolean;
  canAttachImages?: boolean;
  onPosted?: () => void;
}) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CommentCategory>('GENERAL_UPDATE');
  const [visibility, setVisibility] = useState<CommentVisibility>(
    visibilities.includes('AHN_SHOPLINE') ? 'AHN_SHOPLINE' : (visibilities[0] ?? 'EVERYONE'),
  );
  const [needsAnswer, setNeedsAnswer] = useState(false);
  const [alsoSlack, setAlsoSlack] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  // The toast and the refresh wait until the images are linked too, or the
  // update would appear first without them.
  const action = useAction(postCommentAction, { toastOnSuccess: false, refresh: false });

  // Previews are blob: URLs; they go with the composer.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview)),
    [],
  );

  const internal = visibility === 'INTERNAL_AHN';
  const busy = action.pending || uploading;

  function addImages(files: readonly File[]) {
    if (!canAttachImages || busy) return;
    const { accepted, error } = acceptImages(files, images.length);
    setImageError(error);
    if (accepted.length > 0) setImages((current) => [...current, ...accepted]);
  }

  function removeImage(id: string) {
    setImageError(null);
    const gone = images.find((image) => image.id === id);
    if (gone) URL.revokeObjectURL(gone.preview);
    setImages((current) => current.filter((image) => image.id !== id));
  }

  async function post() {
    setImageError(null);
    let uploaded: UploadedImage[] = [];
    if (images.length > 0) {
      setUploading(true);
      try {
        uploaded = await uploadImages(code, images);
      } catch (error) {
        setImageError(
          error instanceof Error ? error.message : 'An image did not upload. Try again.',
        );
        return;
      } finally {
        setUploading(false);
      }
    }

    const result = await action.run({
      code,
      body,
      category,
      visibility,
      status: needsAnswer ? 'OPEN' : 'NONE',
      parentId,
      mentions,
      alsoSlack: alsoSlack && !internal,
    });
    if (!result.ok) return;

    let failed = 0;
    if (uploaded.length > 0) {
      setUploading(true);
      for (const image of uploaded) {
        const confirmed = await confirmUploadAction({
          code,
          key: image.key,
          label: image.label,
          contentType: image.mimeType,
          commentId: result.data.id,
        }).catch(() => null);
        if (!confirmed?.ok) failed += 1;
      }
      setUploading(false);
    }

    images.forEach((image) => URL.revokeObjectURL(image.preview));
    setImages([]);
    setBody('');
    setMentions([]);
    setNeedsAnswer(false);
    if (failed > 0) {
      toast.error(
        'Update posted, but not every image was attached',
        `${failed} of ${uploaded.length} could not be verified. Attach them again from the update.`,
      );
    } else {
      toast.success('Update posted.');
    }
    router.refresh();
    onPosted?.();
  }

  const body_ = (
    <CardBody
      className={cn(
        'space-y-3',
        compact && 'p-3',
        dragging && 'outline-accent outline-dashed outline-2 -outline-offset-2',
      )}
      onDragOver={(event) => {
        if (!canAttachImages || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!canAttachImages || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        setDragging(false);
        addImages([...event.dataTransfer.files]);
      }}
    >
      {action.error && (
        <Alert tone="danger" dense>
          {action.error}
        </Alert>
      )}
      {imageError && (
        <Alert tone="danger" dense>
          {imageError}
        </Alert>
      )}

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (!canAttachImages || files.length === 0) return;
          // A pasted screenshot becomes an attachment, not text.
          event.preventDefault();
          addImages(files);
        }}
        rows={compact ? 2 : 3}
        placeholder={
          compact ? 'Write a reply.' : 'Post an update, ask a question, or record feedback.'
        }
        aria-label={compact ? 'Write a reply' : 'Write an update'}
        autoFocus={autoFocus}
        className={cn(internal && 'border-danger/40 bg-danger-soft/30')}
      />

      <PendingImageStrip images={images} onRemove={removeImage} disabled={busy} />

      {mentions.length > 0 && (
        <p className="text-muted flex flex-wrap items-center gap-1.5 text-[12px]">
          Notifying
          {mentions.map((id) => {
            const person = people.find((p) => p.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMentions(mentions.filter((value) => value !== id))}
                className="bg-accent-soft text-accent-ink rounded-full px-2 py-0.5 text-[11.5px] font-medium"
              >
                @{person?.name ?? 'unknown'} &times;
              </button>
            );
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <Select
            aria-label="Update type"
            value={category}
            onChange={(event) => setCategory(event.target.value as CommentCategory)}
            className="w-auto min-w-[11rem]"
          >
            {COMMENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {COMMENT_CATEGORY_LABEL[value].label}
              </option>
            ))}
          </Select>
        )}

        <Select
          aria-label="Visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as CommentVisibility)}
          className="w-auto min-w-[10rem]"
        >
          {visibilities.map((value) => (
            <option key={value} value={value}>
              {COMMENT_VISIBILITY_LABEL[value].label}
            </option>
          ))}
        </Select>

        {people.length > 0 && (
          <Button variant="subtle" size="sm" onClick={() => setShowMentions(true)}>
            <AtSign className="size-3.5" />
            Mention
          </Button>
        )}

        {canAttachImages && (
          <>
            <Button
              variant="subtle"
              size="sm"
              disabled={busy || images.length >= MAX_COMMENT_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              title="Attach images - you can also paste or drop them here"
            >
              <ImagePlus className="size-3.5" />
              Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={COMMENT_IMAGE_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                addImages([...(event.target.files ?? [])]);
                event.target.value = '';
              }}
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!compact && (
            <Checkbox
              id="needsAnswer"
              label="Needs an answer"
              checked={needsAnswer}
              onChange={(event) => setNeedsAnswer(event.target.checked)}
            />
          )}
          {!compact && !internal && (
            <Checkbox
              id="alsoSlack"
              label="Post to Slack"
              checked={alsoSlack}
              onChange={(event) => setAlsoSlack(event.target.checked)}
            />
          )}
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={body.trim().length === 0}
            onClick={() => void post()}
          >
            <Send className="size-3.5" />
            {compact ? 'Reply' : 'Post'}
          </Button>
        </div>
      </div>

      {internal && (
        <p className="text-danger-ink text-[11.5px]">
          AHN internal - SHOPLINE and the merchant will not see this, and it is never sent to Slack.
        </p>
      )}
    </CardBody>
  );

  return (
    <>
      {compact ? body_ : <Card>{body_}</Card>}

      <Dialog
        open={showMentions}
        onClose={() => setShowMentions(false)}
        title="Mention someone"
        description="They get a notification with a link straight to this project."
        size="sm"
      >
        <ul className="space-y-1">
          {people.map((person) => {
            const on = mentions.includes(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() =>
                    setMentions(
                      on
                        ? mentions.filter((value) => value !== person.id)
                        : [...mentions, person.id],
                    )
                  }
                  className={cn(
                    'flex w-full items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left text-[13px] transition-colors',
                    on ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-surface-2',
                  )}
                >
                  {person.name}
                  {on && <CircleCheck className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}

export function RecordSlackButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [permalink, setPermalink] = useState('');
  const [note, setNote] = useState('');
  const action = useAction(recordSlackMessageAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
        <Hash className="size-3.5" />
        Record a Slack message
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record a Slack message"
        description="Pulls a message into the project history so a decision made in Slack does not stay only in Slack."
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={action.pending}
              onClick={() => action.run({ code, permalink, note: note || undefined })}
            >
              Record it
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <Field
            label="Slack message link"
            htmlFor="permalink"
            required
            hint="Copy link on the message in Slack."
            error={action.fieldErrors.permalink ?? null}
          >
            <Input
              id="permalink"
              value={permalink}
              onChange={(event) => setPermalink(event.target.value)}
              placeholder="https://yourteam.slack.com/archives/C0123/p1700000000000100"
            />
          </Field>
          <Field
            label="Why it matters"
            htmlFor="note"
            hint="Optional context for whoever reads it later."
          >
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function ResolveButton({ code, commentId }: { code: string; commentId: string }) {
  const action = useAction(resolveCommentAction);
  return (
    <Button
      variant="subtle"
      size="xs"
      loading={action.pending}
      onClick={() => action.run({ code, commentId, status: 'RESOLVED' })}
    >
      <CircleCheck className="size-3.5" />
      Mark resolved
    </Button>
  );
}

/**
 * Fixes a typo, nothing more - `updateCommentAction` is deliberately
 * body-only, so there is no category/visibility control here to fill in.
 */
export function EditCommentButton({
  code,
  commentId,
  body,
}: {
  code: string;
  commentId: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(body);
  const action = useAction(updateCommentAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setText(body);
          setOpen(true);
        }}
        className="text-muted hover:text-ink flex items-center gap-1 text-[11.5px] font-medium"
      >
        <Pencil className="size-3.5" />
        Edit
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit"
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={action.pending}
              disabled={text.trim().length === 0}
              onClick={() => action.run({ code, commentId, body: text })}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            autoFocus
          />
        </div>
      </Dialog>
    </>
  );
}
