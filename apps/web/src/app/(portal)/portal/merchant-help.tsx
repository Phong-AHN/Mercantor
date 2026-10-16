'use client';

import { useId, useState } from 'react';
import { BadgeCheck, Check, Copy, LifeBuoy } from 'lucide-react';
import { Alert, Button, Dialog, Field, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { postCommentAction } from '@/features/activity/actions';
import { approveRedirectMapAction } from '@/features/checklists/actions';

/** An email address with a one-click copy, for "add us as staff" instructions. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="bg-surface-2 text-ink rounded-[var(--radius-xs)] px-1.5 py-0.5 font-mono text-[12px]">
        {email}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(email);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard refused (permissions, http): the address is on screen to copy by hand.
          }
        }}
        className="text-accent-ink inline-flex items-center gap-1 text-[12px] font-medium"
        aria-label={`Copy ${email}`}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

/**
 * "I'm stuck on this": asks the team for help on one item without leaving
 * the page. It is an ordinary Conversation message - flagged as needing an
 * answer and mentioning the project manager and account manager, so both are
 * notified and it lands in the team's "Needs an answer" list.
 */
export function StuckButton({
  code,
  itemTitle,
  notifyUserIds,
}: {
  code: string;
  itemTitle: string;
  notifyUserIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  // One of these per checklist row, so the field id must be unique per instance.
  const noteId = `${useId()}-note`;
  const action = useAction(postCommentAction, {
    successMessage: 'Sent. Your team will reply in Conversation.',
    onSuccess: () => {
      setOpen(false);
      setNote('');
    },
  });

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <LifeBuoy className="size-3.5" />
        I&apos;m stuck on this
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Stuck on "${itemTitle}"?`}
        description="Tell us what is in the way. Your project manager and account manager are notified and reply in Conversation."
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
              onClick={() =>
                action.run({
                  code,
                  body: `I'm stuck on "${itemTitle}".${note.trim() ? `\n\n${note.trim()}` : ''}`,
                  category: 'MERCHANT_REQUEST',
                  visibility: 'EVERYONE',
                  status: 'OPEN',
                  mentions: notifyUserIds,
                })
              }
            >
              Ask for help
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
          <Field label="What is in the way? (optional)" htmlFor={noteId}>
            <Textarea
              id={noteId}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: I can't find where to add a staff member."
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/** The merchant's one-click sign-off on the redirect list, after a confirm. */
export function ApproveRedirectButton({
  code,
  itemId,
  links,
}: {
  code: string;
  itemId: string;
  links: number | null;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction(approveRedirectMapAction, { onSuccess: () => setOpen(false) });
  const what = links ? `${links.toLocaleString('en-US')} page links` : 'the page links';

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <BadgeCheck className="size-3.5" />
        Review and approve {what}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Approve the redirect list?"
        description="You are confirming that each old page address points to the right new page. If something looks wrong, use I'm stuck on this instead and tell us which rows."
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
              onClick={() => action.run({ code, itemId })}
            >
              Approve
            </Button>
          </>
        }
      >
        {action.error ? (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        ) : (
          <p className="text-muted text-[13px]">
            This keeps your Google ranking and your customers&apos; bookmarks working after the
            move.
          </p>
        )}
      </Dialog>
    </>
  );
}
