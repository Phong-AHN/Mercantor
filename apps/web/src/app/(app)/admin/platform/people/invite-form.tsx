'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { USER_ROLE_LABEL, type UserRole } from '@relay/core';
import { Alert, Button, Field, FormActions, Input, Select } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { platformInviteUserAction } from '@/features/people/actions';
import { PLATFORM_INVITABLE_ROLES } from '@/features/people/roles';
import { inviteMerchantAction } from '@/features/projects/actions';

type RoleChoice = UserRole | 'MERCHANT';

/**
 * The one form that can create any account on the portal: an organization's
 * own staff (any org, any of their roles), another `PLATFORM_ADMIN`, or a
 * merchant. Three different shapes behind one role picker:
 *
 *   - `PLATFORM_ADMIN` - no organization, calls `platformInviteUserAction`.
 *   - Any other staff role - an organization is required, same action.
 *   - `MERCHANT` - not a `UserRole` this action grants at all; a merchant
 *     belongs to one project, not a tenant, so this branch calls the
 *     existing project-scoped `inviteMerchantAction` instead, with a
 *     project picker in place of the organization one.
 *
 * Every path ends the same way: a `User` row and a one-time set-password
 * link emailed out, same as `/people`'s own invite button.
 */
export function PlatformInviteForm({
  organizations,
  projects,
}: {
  organizations: readonly { id: string; name: string }[];
  projects: readonly { code: string; label: string }[];
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: PLATFORM_INVITABLE_ROLES[0] as RoleChoice,
    title: '',
    organizationId: organizations[0]?.id ?? '',
    projectCode: projects[0]?.code ?? '',
  });

  const resetContactFields = () => setForm((f) => ({ ...f, name: '', email: '', title: '' }));

  const staffInvite = useAction(platformInviteUserAction, { onSuccess: resetContactFields });
  const merchantInvite = useAction(inviteMerchantAction, { onSuccess: resetContactFields });

  const isMerchant = form.role === 'MERCHANT';
  const isPlatformAdmin = form.role === 'PLATFORM_ADMIN';
  const active = isMerchant ? merchantInvite : staffInvite;

  function submit() {
    if (isMerchant) {
      merchantInvite.run({ code: form.projectCode, name: form.name, email: form.email });
      return;
    }
    staffInvite.run({
      email: form.email,
      name: form.name,
      role: form.role,
      title: form.title || undefined,
      organizationId: isPlatformAdmin ? null : form.organizationId,
    });
  }

  const canSubmit =
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    (isMerchant ? form.projectCode.length > 0 : isPlatformAdmin || form.organizationId.length > 0);

  return (
    <div className="space-y-3">
      {active.error && (
        <Alert tone="danger" dense>
          {active.error}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="pf-name" required error={active.fieldErrors.name ?? null}>
          <Input
            id="pf-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Email" htmlFor="pf-email" required error={active.fieldErrors.email ?? null}>
          <Input
            id="pf-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="name@company.com"
          />
        </Field>
      </div>

      <Field label="Role" htmlFor="pf-role" required>
        <Select
          id="pf-role"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value as RoleChoice })}
        >
          {PLATFORM_INVITABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {USER_ROLE_LABEL[role].label}
            </option>
          ))}
          <option value="MERCHANT">{USER_ROLE_LABEL.MERCHANT.label}</option>
        </Select>
      </Field>

      {isMerchant ? (
        <Field
          label="Project"
          htmlFor="pf-project"
          required
          hint="A merchant's access is scoped to one project, not an organization."
        >
          {projects.length === 0 ? (
            <Alert tone="warning" dense>
              No projects exist yet - create one first.
            </Alert>
          ) : (
            <Select
              id="pf-project"
              value={form.projectCode}
              onChange={(event) => setForm({ ...form, projectCode: event.target.value })}
            >
              {projects.map((project) => (
                <option key={project.code} value={project.code}>
                  {project.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : isPlatformAdmin ? (
        <Alert tone="info" dense>
          PLATFORM_ADMIN has no organization - this account reaches every tenant.
        </Alert>
      ) : (
        <Field
          label="Organization"
          htmlFor="pf-org"
          required
          error={staffInvite.fieldErrors.organizationId ?? null}
        >
          {organizations.length === 0 ? (
            <Alert tone="warning" dense>
              No organizations exist yet.
            </Alert>
          ) : (
            <Select
              id="pf-org"
              value={form.organizationId}
              onChange={(event) => setForm({ ...form, organizationId: event.target.value })}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      {!isMerchant && (
        <Field label="Title" htmlFor="pf-title" hint="Optional - shown next to their role.">
          <Input
            id="pf-title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="e.g. Senior Project Manager"
          />
        </Field>
      )}

      <FormActions>
        <Button
          variant="primary"
          size="sm"
          loading={active.pending}
          disabled={!canSubmit}
          onClick={submit}
        >
          <UserPlus className="size-3.5" />
          Send invite
        </Button>
      </FormActions>
    </div>
  );
}
