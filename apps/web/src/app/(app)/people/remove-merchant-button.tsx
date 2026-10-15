'use client';

import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { Alert, Button, Dialog } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { removeOrgMerchantAction } from '@/features/people/actions';

/**
 * The merchant-row counterpart to `RemovePersonButton`. A merchant is not a
 * staff account to delete: this takes them off every one of your
 * organization's projects and keeps the account, so inviting them to a
 * project again restores access without a new password.
 */
export function RemoveMerchantButton({
  userId,
  name,
  projects,
}: {
  userId: string;
  name: string;
  projects: number;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction(removeOrgMerchantAction, { onSuccess: () => setOpen(false) });
  const scope = projects === 1 ? 'your project' : `all ${projects} of your projects`;

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
        title={`Remove ${name}`}
        aria-label={`Remove ${name}`}
      >
        <UserMinus className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${name}?`}
        description={`They lose access to ${scope} in the merchant portal. Their account is kept, and inviting them to a project again restores access.`}
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
              <UserMinus className="size-3.5" />
              Remove access
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
