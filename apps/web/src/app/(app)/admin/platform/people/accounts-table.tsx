'use client';

import { useState } from 'react';
import { KeyRound, Pencil, Power, PowerOff } from 'lucide-react';
import { formatRelative, USER_ROLE_LABEL, type UserRole } from '@relay/core';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  PersonCell,
  Select,
  Table,
  TableScroller,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  platformResendInviteAction,
  platformSetUserActiveAction,
  platformUpdateUserAction,
} from '@/features/people/actions';
import { PLATFORM_INVITABLE_ROLES } from '@/features/people/roles';
import type { PlatformAccount } from '@/features/platform/service';

/**
 * The "manage" half of platform-wide account administration - every account
 * on the portal, editable from one table. `MERCHANT` rows get a narrower
 * action set (no role/organization editing - see `platformUpdateUserAction`'s
 * own comment for why) and the signed-in admin's own row gets none at all,
 * matching the same self-action refusals the server enforces.
 */
export function AccountsTable({
  accounts,
  organizations,
  currentUserId,
  now,
}: {
  accounts: readonly PlatformAccount[];
  organizations: readonly { id: string; name: string }[];
  currentUserId: string;
  now: Date;
}) {
  const [editing, setEditing] = useState<PlatformAccount | null>(null);

  return (
    <>
      <TableScroller>
        <Table>
          <THead>
            <tr>
              <TH className="min-w-[13rem]">Person</TH>
              <TH>Role</TH>
              <TH className="min-w-[10rem]">Organization</TH>
              <TH>Status</TH>
              <TH>Last seen</TH>
              <TH className="min-w-[12rem]">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                isSelf={account.id === currentUserId}
                now={now}
                onEdit={() => setEditing(account)}
              />
            ))}
          </TBody>
        </Table>
      </TableScroller>

      {editing && (
        <EditAccountDialog
          account={editing}
          organizations={organizations}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function AccountRow({
  account,
  isSelf,
  now,
  onEdit,
}: {
  account: PlatformAccount;
  isSelf: boolean;
  now: Date;
  onEdit: () => void;
}) {
  const setActive = useAction(platformSetUserActiveAction);
  const resend = useAction(platformResendInviteAction);
  const canEditRole = account.role !== 'MERCHANT' && !isSelf;

  return (
    <TR>
      <TD>
        <PersonCell name={account.name} role={account.email} team={account.team} />
      </TD>
      <TD>
        <Badge tone={USER_ROLE_LABEL[account.role].tone} size="sm">
          {USER_ROLE_LABEL[account.role].label}
        </Badge>
        {account.title && <span className="text-faint mt-0.5 block text-[11px]">{account.title}</span>}
      </TD>
      <TD className="text-ink-soft text-[12.5px]">{account.organizationName ?? '-'}</TD>
      <TD>
        <Badge tone={account.isActive ? 'success' : 'muted'} size="sm" dot>
          {account.isActive ? 'active' : 'deactivated'}
        </Badge>
      </TD>
      <TD className="text-muted text-[12.5px]">
        {account.lastLoginAt ? formatRelative(account.lastLoginAt, now) : 'never'}
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-1.5">
          {canEditRole && (
            <Button variant="ghost" size="xs" onClick={onEdit} title="Edit role and organization">
              <Pencil className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            loading={resend.pending}
            onClick={() => resend.run({ userId: account.id })}
            title={account.lastLoginAt ? 'Send a password reset link' : 'Resend the invite link'}
          >
            <KeyRound className="size-3.5" />
          </Button>
          {!isSelf && (
            <Button
              variant="ghost"
              size="xs"
              loading={setActive.pending}
              onClick={() => setActive.run({ userId: account.id, isActive: !account.isActive })}
              title={account.isActive ? 'Deactivate' : 'Reactivate'}
            >
              {account.isActive ? (
                <PowerOff className="text-danger size-3.5" />
              ) : (
                <Power className="text-success size-3.5" />
              )}
            </Button>
          )}
        </div>
      </TD>
    </TR>
  );
}

function EditAccountDialog({
  account,
  organizations,
  onClose,
}: {
  account: PlatformAccount;
  organizations: readonly { id: string; name: string }[];
  onClose: () => void;
}) {
  const [role, setRole] = useState<UserRole>(account.role);
  const [organizationId, setOrganizationId] = useState(account.organizationId ?? organizations[0]?.id ?? '');
  const [title, setTitle] = useState(account.title ?? '');
  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  const action = useAction(platformUpdateUserAction, { onSuccess: onClose });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${account.name}`}
      busy={action.pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() =>
              action.run({
                userId: account.id,
                role,
                organizationId: isPlatformAdmin ? null : organizationId,
                title: title || undefined,
              })
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

        <Field label="Role" htmlFor="edit-role" required>
          <Select id="edit-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            {PLATFORM_INVITABLE_ROLES.map((option) => (
              <option key={option} value={option}>
                {USER_ROLE_LABEL[option].label}
              </option>
            ))}
          </Select>
        </Field>

        {isPlatformAdmin ? (
          <Alert tone="info" dense>
            PLATFORM_ADMIN has no organization - this account reaches every tenant.
          </Alert>
        ) : (
          <Field
            label="Organization"
            htmlFor="edit-org"
            required
            error={action.fieldErrors.organizationId ?? null}
          >
            <Select
              id="edit-org"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Title" htmlFor="edit-title" hint="Optional.">
          <Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
