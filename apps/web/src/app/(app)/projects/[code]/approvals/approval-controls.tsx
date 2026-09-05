'use client';

import { useState } from 'react';
import { CircleCheck, CircleX, Send, TriangleAlert } from 'lucide-react';
import { APPROVAL_TYPE_LABEL, type ApprovalStatus, type ApprovalType } from '@relay/core';
import { Alert, Button, Dialog, Field, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { decideApprovalAction, requestApprovalAction } from '@/features/approvals/actions';

export function ApprovalControls({
  code,
  type,
  status,
  canRequest,
  canDecide,
}: {
  code: string;
  type: ApprovalType;
  status: ApprovalStatus;
  canRequest: boolean;
  canDecide: boolean;
}) {
  const [dialog, setDialog] = useState<'request' | 'approve' | 'changes' | null>(null);
  const [notes, setNotes] = useState('');

  const request = useAction(requestApprovalAction, { onSuccess: () => setDialog(null) });
  const decide = useAction(decideApprovalAction, { onSuccess: () => setDialog(null) });

  return (
    <div className="border-line flex flex-wrap items-center gap-2 border-t pt-3">
      {canRequest && status !== 'PENDING' && (
        <Button variant="subtle" size="sm" onClick={() => setDialog('request')}>
          <Send className="size-3.5" />
          {status === 'APPROVED' ? 'Request again' : 'Request approval'}
        </Button>
      )}

      {canDecide && status !== 'APPROVED' && (
        <>
          <Button variant="primary" size="sm" onClick={() => setDialog('approve')}>
            <CircleCheck className="size-3.5" />
            Approve
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDialog('changes')}>
            <TriangleAlert className="size-3.5" />
            Request changes
          </Button>
        </>
      )}

      {canDecide && status === 'APPROVED' && (
        <Button variant="ghost" size="sm" onClick={() => setDialog('changes')}>
          <CircleX className="size-3.5" />
          Withdraw approval
        </Button>
      )}

      {!canDecide && (
        <p className="text-faint text-[11.5px]">
          This checkpoint is decided by the other side of the table.
        </p>
      )}

      <Dialog
        open={dialog === 'request'}
        onClose={() => setDialog(null)}
        title={`Request ${APPROVAL_TYPE_LABEL[type].label.toLowerCase()}`}
        description="Notifies whoever owns this checkpoint, and posts to the linked Slack channel."
        size="sm"
        busy={request.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={request.pending}
              onClick={() => request.run({ code, type, notes: notes || undefined })}
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {request.error && (
            <Alert tone="danger" dense>
              {request.error}
            </Alert>
          )}
          <Field label="What are they approving" htmlFor="requestNotes" hint="Optional context.">
            <Textarea
              id="requestNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={APPROVAL_TYPE_LABEL[type].label}
        description="Recorded against your name with a timestamp. This is the record, not a copy of one."
        size="sm"
        busy={decide.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={decide.pending}
              onClick={() =>
                decide.run({ code, type, decision: 'APPROVED', notes: notes || undefined })
              }
            >
              <CircleCheck className="size-3.5" />
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {decide.error && (
            <Alert tone="danger" dense>
              {decide.error}
            </Alert>
          )}
          <Field label="Notes" htmlFor="approveNotes" hint="Optional. Conditions, caveats, scope.">
            <Textarea
              id="approveNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === 'changes'}
        onClose={() => setDialog(null)}
        title="Request changes"
        description="Say what has to change. This is what the other side will work from."
        size="sm"
        busy={decide.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={decide.pending}
              onClick={() => decide.run({ code, type, decision: 'CHANGES_REQUESTED', notes })}
            >
              Request changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {decide.error && (
            <Alert tone="danger" dense>
              {decide.error}
            </Alert>
          )}
          <Field
            label="What needs to change"
            htmlFor="changeNotes"
            required
            error={decide.fieldErrors.notes ?? null}
          >
            <Textarea
              id="changeNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              autoFocus
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
