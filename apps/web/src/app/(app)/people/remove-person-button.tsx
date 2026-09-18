'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Alert, Button, Dialog } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { removeOrgUserAction } from '@/features/people/actions';

/**
 * The destructive counterpart to `EditRoleButton` - behind a confirm dialog
 * like every other hard-to-reverse delete in this app (an invoice, a
 * comment). Removing is not actually permanent (re-inviting the same email
 * reactivates the account, same as `createInvitedUser` already handles),
 * but the person loses access and every live session immediately, so it
 * still gets the same "are you sure" treatment.
 */
export function RemovePersonButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction(removeOrgUserAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)} title={`Remove ${name}`}>
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${name}?`}
        description="They lose access immediately and every open session is signed out. Re-inviting the same email brings the account back."
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={action.pending}
              onClick={() => action.run({ userId })}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          </>
        }
      >
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}
      </Dialog>
    </>
  );
}
