'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { USER_ROLE_LABEL, type UserRole } from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { inviteUserAction } from '@/features/people/actions';
import { INVITABLE_ROLES as INVITABLE_ROLE_OPTIONS } from '@/features/people/roles';

/**
 * The gap `FUTURE-WORK.md` §1 named first: nothing before this created a
 * `User` row except `pnpm db:seed`. `MERCHANT` and `PLATFORM_ADMIN` are not
 * offered here on purpose - see `inviteUserAction`'s own comment.
 */
export function InvitePersonButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: INVITABLE_ROLE_OPTIONS[0] as UserRole,
    title: '',
  });
  const action = useAction(inviteUserAction, {
    onSuccess: () => {
      setOpen(false);
      setForm({ name: '', email: '', role: INVITABLE_ROLE_OPTIONS[0], title: '' });
    },
  });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-3.5" />
        Invite person
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a person"
        description="Creates their account and emails them a link to set their own password."
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
                  name: form.name,
                  email: form.email,
                  role: form.role,
                  title: form.title || undefined,
                })
              }
            >
              Send invite
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
            label="Name"
            htmlFor="invite-name"
            required
            error={action.fieldErrors.name ?? null}
          >
            <Input
              id="invite-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              autoFocus
            />
          </Field>

          <Field
            label="Work email"
            htmlFor="invite-email"
            required
            error={action.fieldErrors.email ?? null}
          >
            <Input
              id="invite-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@ahnmedia.com"
            />
          </Field>

          <Field label="Role" htmlFor="invite-role" required>
            <Select
              id="invite-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            >
              {INVITABLE_ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {USER_ROLE_LABEL[role].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Title" htmlFor="invite-title" hint="Optional - shown next to their role.">
            <Input
              id="invite-title"
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
