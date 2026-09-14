'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { USER_ROLE_LABEL, type UserRole } from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { updateOrgUserRoleAction } from '@/features/people/actions';
import { INVITABLE_ROLES } from '@/features/people/roles';

/**
 * The `/people` counterpart to `InvitePersonButton`: edits a role/title on
 * an existing member of the viewer's own organization. Never offered for a
 * `MERCHANT` row or the viewer's own row - `updateOrgUserRoleAction`
 * refuses both server-side too, this just avoids rendering a button that
 * would only ever come back with an error.
 */
export function EditRoleButton({
  userId,
  name,
  role,
  title,
}: {
  userId: string;
  name: string;
  role: UserRole;
  title: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ role, title: title ?? '' });
  const action = useAction(updateOrgUserRoleAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)} title={`Edit ${name}`}>
        <Pencil className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${name}`}
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
                action.run({ userId, role: form.role, title: form.title || undefined })
              }
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

          <Field label="Role" htmlFor="edit-role-role" required>
            <Select
              id="edit-role-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            >
              {INVITABLE_ROLES.map((option) => (
                <option key={option} value={option}>
                  {USER_ROLE_LABEL[option].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Title" htmlFor="edit-role-title" hint="Optional - shown next to their role.">
            <Input
              id="edit-role-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. Senior Project Manager"
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
