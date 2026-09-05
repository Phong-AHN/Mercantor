'use client';

import { useState } from 'react';
import { AtSign, CircleCheck, Hash, Send } from 'lucide-react';
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
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  postCommentAction,
  recordSlackMessageAction,
  resolveCommentAction,
} from '@/features/activity/actions';

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
 */
export function CommentComposer({
  code,
  visibilities,
  people,
  parentId,
  compact = false,
  autoFocus = false,
  onPosted,
}: {
  code: string;
  visibilities: CommentVisibility[];
  people: Person[];
  parentId?: string;
  compact?: boolean;
  autoFocus?: boolean;
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

  const action = useAction(postCommentAction, {
    onSuccess: () => {
      setBody('');
      setMentions([]);
      setNeedsAnswer(false);
      onPosted?.();
    },
  });

  const internal = visibility === 'INTERNAL_AHN';

  const body_ = (
    <CardBody className={cn('space-y-3', compact && 'p-3')}>
      {action.error && (
        <Alert tone="danger" dense>
          {action.error}
        </Alert>
      )}

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={compact ? 2 : 3}
        placeholder={
          compact ? 'Write a reply.' : 'Post an update, ask a question, or record feedback.'
        }
        aria-label={compact ? 'Write a reply' : 'Write an update'}
        autoFocus={autoFocus}
        className={cn(internal && 'border-danger/40 bg-danger-soft/30')}
      />

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
            loading={action.pending}
            disabled={body.trim().length === 0}
            onClick={() =>
              action.run({
                code,
                body,
                category,
                visibility,
                status: needsAnswer ? 'OPEN' : 'NONE',
                parentId,
                mentions,
                alsoSlack: alsoSlack && !internal,
              })
            }
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
