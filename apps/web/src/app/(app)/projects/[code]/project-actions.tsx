'use client';

import { useState } from 'react';
import {
  ArrowRight,
  MailPlus,
  MessageSquarePlus,
  MoveRight,
  PackageCheck,
  TriangleAlert,
} from 'lucide-react';
import {
  allowedTransitions,
  checkTransition,
  COMMENT_CATEGORIES,
  COMMENT_CATEGORY_LABEL,
  COMMENT_VISIBILITY_LABEL,
  STAGES,
  type CommentVisibility,
  type ProjectStage,
} from '@relay/core';
import { Alert, Button, Checkbox, Dialog, Field, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { postCommentAction } from '@/features/activity/actions';
import { submitHandoffAction } from '@/features/approvals/actions';
import { sendIntroductionAction } from '@/features/introduction/actions';
import { advanceStageAction } from '@/features/projects/actions';

export interface ProjectActionsProps {
  code: string;
  stage: ProjectStage;
  merchantName: string;
  writableVisibilities: CommentVisibility[];
  permissions: {
    advanceStage: boolean;
    comment: boolean;
    sendIntroduction: boolean;
    submitHandoff: boolean;
  };
  introductionSent: boolean;
}

/**
 * The action bar. Everything a person is most likely to do next, in the order
 * the project itself suggests: move it on, say something, introduce it, hand it
 * over. Controls the reader has no permission for are not rendered - and the
 * server checks again anyway.
 */
export function ProjectActions(props: ProjectActionsProps) {
  const [open, setOpen] = useState<'stage' | 'update' | 'intro' | 'handoff' | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      {props.permissions.comment && (
        <Button variant="secondary" size="md" onClick={() => setOpen('update')}>
          <MessageSquarePlus className="size-4" />
          Log update
        </Button>
      )}

      {props.permissions.sendIntroduction && !props.introductionSent && (
        <Button variant="secondary" size="md" onClick={() => setOpen('intro')}>
          <MailPlus className="size-4" />
          Send introduction
        </Button>
      )}

      {props.permissions.submitHandoff && (
        <Button variant="secondary" size="md" onClick={() => setOpen('handoff')}>
          <PackageCheck className="size-4" />
          Submit to SHOPLINE
        </Button>
      )}

      {props.permissions.advanceStage && (
        <Button variant="primary" size="md" onClick={() => setOpen('stage')}>
          <MoveRight className="size-4" />
          Move stage
        </Button>
      )}

      {open === 'stage' && <StageDialog {...props} onClose={close} />}
      {open === 'update' && <UpdateDialog {...props} onClose={close} />}
      {open === 'intro' && <IntroDialog {...props} onClose={close} />}
      {open === 'handoff' && <HandoffDialog {...props} onClose={close} />}
    </>
  );
}

function StageDialog({ code, stage, onClose }: ProjectActionsProps & { onClose: () => void }) {
  const options = allowedTransitions(stage);
  const [to, setTo] = useState<ProjectStage>(options[0] ?? stage);
  const [reason, setReason] = useState('');
  const action = useAction(advanceStageAction, { onSuccess: onClose });

  const check = checkTransition(stage, to);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Move this project to another stage"
      description={`Currently ${STAGES[stage].label}. The stage clock restarts, and the time already spent is kept.`}
      busy={action.pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={action.pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() => action.run({ code, to, reason: reason || undefined })}
          >
            Move to {STAGES[to].shortLabel}
            <ArrowRight className="size-3.5" />
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error && !action.unmet.length && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}
        {action.unmet.length > 0 && (
          <Alert tone="warning" title="Not ready yet">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {action.unmet.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Field label="New stage" htmlFor="stage" required>
          <Select
            id="stage"
            value={to}
            onChange={(event) => setTo(event.target.value as ProjectStage)}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {STAGES[option].label}
                {(STAGES[option].order ?? 0) < (STAGES[stage].order ?? 0) ? ' (back)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <p className="bg-surface-2 text-muted rounded-[var(--radius-sm)] px-3 py-2 text-[12.5px]">
          {STAGES[to].description} Waiting on <strong>{STAGES[to].ownerTeam}</strong>
          {STAGES[to].targetDays !== null && <> - target {STAGES[to].targetDays} days.</>}
        </p>

        <Field
          label="Reason"
          htmlFor="reason"
          required={check.requiresReason}
          hint={
            check.requiresReason
              ? 'Going backwards or on hold needs a reason - it is what the timeline will show.'
              : 'Optional. Anything worth explaining later.'
          }
          error={action.fieldErrors.reason ?? null}
        >
          <Textarea
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder={
              check.requiresReason
                ? 'e.g. Merchant asked for a hero and PDP rework after the design review.'
                : ''
            }
          />
        </Field>
      </div>
    </Dialog>
  );
}

function UpdateDialog({
  code,
  writableVisibilities,
  onClose,
}: ProjectActionsProps & { onClose: () => void }) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<(typeof COMMENT_CATEGORIES)[number]>('GENERAL_UPDATE');
  const [visibility, setVisibility] = useState<CommentVisibility>(
    writableVisibilities.includes('AHN_SHOPLINE')
      ? 'AHN_SHOPLINE'
      : (writableVisibilities[0] ?? 'EVERYONE'),
  );
  const [alsoSlack, setAlsoSlack] = useState(false);
  const action = useAction(postCommentAction, { onSuccess: onClose });

  const internal = visibility === 'INTERNAL_AHN';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Log an update"
      description="Goes into the project activity feed, and into Slack if you want it to."
      busy={action.pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={action.pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() =>
              action.run({
                code,
                body,
                category,
                visibility,
                status: 'NONE',
                mentions: [],
                alsoSlack: alsoSlack && !internal,
              })
            }
          >
            Post update
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <Field label="Update" htmlFor="body" required error={action.fieldErrors.body ?? null}>
          <Textarea
            id="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            autoFocus
            placeholder="What happened, and what it means for the launch date."
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="category">
            <Select
              id="category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as (typeof COMMENT_CATEGORIES)[number])
              }
            >
              {COMMENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {COMMENT_CATEGORY_LABEL[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Who can see this"
            htmlFor="visibility"
            hint={COMMENT_VISIBILITY_LABEL[visibility].hint}
          >
            <Select
              id="visibility"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as CommentVisibility)}
            >
              {writableVisibilities.map((value) => (
                <option key={value} value={value}>
                  {COMMENT_VISIBILITY_LABEL[value].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {internal ? (
          <Alert tone="danger" dense>
            An AHN-internal note never leaves AHN. It is not sent to Slack and SHOPLINE cannot see
            it.
          </Alert>
        ) : (
          <Checkbox
            id="alsoSlack"
            label="Also post to the linked Slack channel"
            hint="With a link straight back to this project."
            checked={alsoSlack}
            onChange={(event) => setAlsoSlack(event.target.checked)}
          />
        )}
      </div>
    </Dialog>
  );
}

function IntroDialog({
  code,
  merchantName,
  onClose,
}: ProjectActionsProps & { onClose: () => void }) {
  const [note, setNote] = useState('');
  const action = useAction(sendIntroductionAction, { onSuccess: onClose });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Introduce ${merchantName} to AHN`}
      description="Generates the standard introduction from this project record and sends it to the merchant contact, copying both sides."
      busy={action.pending}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={action.pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() => action.run({ code, note: note || undefined })}
          >
            <MailPlus className="size-3.5" />
            Send introduction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <Alert tone="info" dense>
          The body is generated from the project: merchant details, migration type, both contacts,
          the access needed to start, next steps, and a link to this portal. Sending also moves the
          project to Merchant Contacted and starts the response clock.
        </Alert>

        <Field
          label="Add a personal note (optional)"
          htmlFor="note"
          hint="Appended to the end of the standard email."
        >
          <Textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            placeholder="e.g. Following our call on Tuesday - Linh will reach out to book the kickoff."
          />
        </Field>
      </div>
    </Dialog>
  );
}

function HandoffDialog({ code, onClose }: ProjectActionsProps & { onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const action = useAction(submitHandoffAction, { onSuccess: onClose });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Submit to SHOPLINE"
      description="Verifies migration, design, development, QA, merchant approval, blockers and access before anything is sent."
      busy={action.pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={action.pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() => action.run({ code, deploymentNotes: notes, confirm })}
          >
            <PackageCheck className="size-3.5" />
            Submit for review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.unmet.length > 0 ? (
          <Alert tone="danger" title="Not ready to hand over" icon={<TriangleAlert />}>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {action.unmet.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          action.error && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )
        )}

        <Field
          label="Deployment notes"
          htmlFor="notes"
          required
          hint="Cutover window, DNS plan, rollback path, anything SHOPLINE needs before approving."
          error={action.fieldErrors.deploymentNotes ?? null}
        >
          <Textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            autoFocus
            placeholder="e.g. DNS cutover at 02:00 UTC Thursday. Old store stays live in maintenance mode for 48 hours as a rollback path."
          />
        </Field>

        <Checkbox
          id="confirm"
          label="This package is complete and ready for SHOPLINE review"
          hint="Recorded against your name, with a snapshot of the checklist as it stands now."
          checked={confirm}
          onChange={(event) => setConfirm(event.target.checked)}
        />
      </div>
    </Dialog>
  );
}
