'use client';

import { useState } from 'react';
import { CircleCheck, OctagonAlert, PenLine } from 'lucide-react';
import { Alert, Button, Dialog, Field, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { decideHandoffAction } from '@/features/approvals/actions';

/**
 * SHOPLINE's three answers, exactly as the brief names them: approve
 * deployment, request changes, or report an issue.
 */
export function HandoffDecisionControls({ code, handoffId }: { code: string; handoffId: string }) {
  const [dialog, setDialog] = useState<'APPROVED' | 'CHANGES_REQUESTED' | 'ISSUE_REPORTED' | null>(
    null,
  );
  const [notes, setNotes] = useState('');
  const action = useAction(decideHandoffAction, { onSuccess: () => setDialog(null) });

  return (
    <div className="space-y-2">
      <Button variant="primary" size="md" fullWidth onClick={() => setDialog('APPROVED')}>
        <CircleCheck className="size-4" />
        Approve deployment
      </Button>
      <Button
        variant="secondary"
        size="md"
        fullWidth
        onClick={() => setDialog('CHANGES_REQUESTED')}
      >
        <PenLine className="size-4" />
        Request changes
      </Button>
      <Button variant="danger" size="md" fullWidth onClick={() => setDialog('ISSUE_REPORTED')}>
        <OctagonAlert className="size-4" />
        Report an issue
      </Button>

      <p className="text-faint pt-1 text-[11.5px] leading-4">
        Approving moves the project to Ready for Deployment. Requesting changes or reporting an
        issue sends it back to Development with your notes attached.
      </p>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog === 'APPROVED'
            ? 'Approve deployment'
            : dialog === 'CHANGES_REQUESTED'
              ? 'Request changes'
              : 'Report an issue'
        }
        description={
          dialog === 'APPROVED'
            ? 'Recorded against your name. The project moves to Ready for Deployment.'
            : 'AHN will work from these notes, so be specific.'
        }
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'APPROVED' ? 'primary' : 'danger'}
              size="sm"
              loading={action.pending}
              onClick={() =>
                dialog &&
                action.run({ code, handoffId, decision: dialog, notes: notes || undefined })
              }
            >
              {dialog === 'APPROVED' ? 'Approve' : 'Send back to AHN'}
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
            label={dialog === 'APPROVED' ? 'Notes' : 'What needs to change'}
            htmlFor="decisionNotes"
            required={dialog !== 'APPROVED'}
            error={action.fieldErrors.notes ?? null}
          >
            <Textarea
              id="decisionNotes"
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
