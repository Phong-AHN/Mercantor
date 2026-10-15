'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Alert, Button, Dialog, Field, Input } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { updateOrgMerchantAction } from '@/features/people/actions';

/**
 * The merchant-row counterpart to `EditRoleButton`: a merchant has no role
 * to change here, only the name and the email they sign in with. Refused
 * server-side when the account is shared with another organization.
 */
export function EditMerchantButton({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, email });
  const action = useAction(updateOrgMerchantAction, { onSuccess: () => setOpen(false) });
  const nameId = `edit-merchant-${userId}-name`;
  const emailId = `edit-merchant-${userId}-email`;

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setForm({ name, email });
          action.reset();
          setOpen(true);
        }}
        title={`Edit ${name}`}
        aria-label={`Edit ${name}`}
      >
        <Pencil className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${name}`}
        description="Their name and the email they sign in with. A new email takes effect at their next sign-in; their password stays the same."
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
              disabled={!form.name.trim() || !form.email.trim()}
              onClick={() => action.run({ userId, ...form })}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {action.error && Object.keys(action.fieldErrors).length === 0 && (
            <Alert tone="danger" dense>
              {action.error}
            </Alert>
          )}
          <Field label="Name" htmlFor={nameId} required error={action.fieldErrors.name ?? null}>
            <Input
              id={nameId}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor={emailId} required error={action.fieldErrors.email ?? null}>
            <Input
              id={emailId}
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
