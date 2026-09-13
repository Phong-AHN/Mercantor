'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ROLE_PERMISSIONS, type Permission } from '@relay/rbac';
import { USER_ROLE_LABEL, type UserRole } from '@relay/core';
import { cn, Table, TableScroller, TBody, TD, TH, THead, TR } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { setRolePermissionOverrideAction } from '@/features/platform/actions';
import type { RoleMatrixCell } from '@/features/platform/service';

/**
 * One cell per (role, permission). A filled dot is granted, hollow is not;
 * a ring around either marks a cell that no longer matches
 * `ROLE_PERMISSIONS` in code - an override is in play. Click to flip a
 * cell; clicking it back to what the code default already says deletes the
 * override row rather than leaving a redundant one, so the ring disappears
 * exactly when the database agrees with the matrix again.
 */
export function PermissionMatrix({
  permissions,
  roles,
  cells,
}: {
  permissions: readonly Permission[];
  roles: readonly UserRole[];
  cells: RoleMatrixCell[];
}) {
  const [state, setState] = useState(cells);
  const toggle = useAction(setRolePermissionOverrideAction, { toastOnSuccess: false, refresh: false });
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const cellFor = (role: UserRole, permission: Permission) =>
    state.find((c) => c.role === role && c.permission === permission)!;

  async function flip(role: UserRole, permission: Permission) {
    const key = `${role}:${permission}`;
    const current = cellFor(role, permission);
    const nextGranted = !current.granted;
    const defaultGranted = ROLE_PERMISSIONS[role].includes(permission);
    setPendingKey(key);
    const result = await toggle.run({ role, permission, granted: nextGranted });
    if (result.ok) {
      setState((prev) =>
        prev.map((c) =>
          c.role === role && c.permission === permission
            ? { ...c, granted: nextGranted, overridden: nextGranted !== defaultGranted }
            : c,
        ),
      );
    }
    setPendingKey(null);
  }

  return (
    <TableScroller>
      <Table>
        <THead>
          <tr>
            <TH className="min-w-[13rem]">Permission</TH>
            {roles.map((role) => (
              <TH key={role} className="text-center whitespace-nowrap">
                {USER_ROLE_LABEL[role].label}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {permissions.map((permission) => (
            <TR key={permission}>
              <TD className="text-ink-soft font-mono text-[11.5px]">{permission}</TD>
              {roles.map((role) => {
                const cell = cellFor(role, permission);
                const key = `${role}:${permission}`;
                const busy = pendingKey === key;
                return (
                  <TD key={role} className="text-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => flip(role, permission)}
                      title={
                        cell.overridden
                          ? `Overridden - default is ${cell.granted ? 'denied' : 'granted'}`
                          : undefined
                      }
                      className={cn(
                        'inline-flex size-5 items-center justify-center rounded-full border transition-colors disabled:opacity-40',
                        cell.granted
                          ? 'bg-accent border-accent'
                          : 'bg-surface-2 border-line-strong',
                        cell.overridden && 'ring-2 ring-warning ring-offset-1 ring-offset-surface-1',
                      )}
                      aria-label={`${cell.granted ? 'Revoke' : 'Grant'} ${permission} for ${USER_ROLE_LABEL[role].label}`}
                      aria-pressed={cell.granted}
                    />
                  </TD>
                );
              })}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableScroller>
  );
}

export function ResetHint() {
  return (
    <p className="text-muted flex items-center gap-1.5 text-[11.5px]">
      <RotateCcw className="size-3.5" />
      Click a filled cell to revoke, an empty one to grant. A ringed cell has been changed from the
      code default - click it back to the default state to clear the override.
    </p>
  );
}
