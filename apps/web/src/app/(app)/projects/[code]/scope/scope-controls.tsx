'use client';

import { useState } from 'react';
import { CircleCheck, Pencil } from 'lucide-react';
import {
  SCOPE_DISPOSITION_LABEL,
  SCOPE_DISPOSITIONS,
  SCOPE_STATUS_LABEL,
  SCOPE_STATUSES,
  type ScopeDisposition,
  type ScopeStatus,
} from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import { approveChangeRequestAction, updateScopeItemAction } from '@/features/checklists/actions';

export function ScopeRowControls({
  code,
  itemId,
  label,
  disposition,
  status,
  sourceCount,
  migratedCount,
  notes,
}: {
  code: string;
  itemId: string;
  label: string;
  disposition: ScopeDisposition;
  status: ScopeStatus;
  sourceCount: number | null;
  migratedCount: number | null;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    disposition,
    status,
    sourceCount: sourceCount?.toString() ?? '',
    migratedCount: migratedCount?.toString() ?? '',
    notes: notes ?? '',
    changeRequestAmount: '',
  });
  const action = useAction(updateScopeItemAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Counts drive the migration-validation numbers, so keep them honest."
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
              onClick={() =>
                action.run({
                  code,
                  itemId,
                  disposition: form.disposition,
                  status: form.status,
                  sourceCount: form.sourceCount === '' ? undefined : Number(form.sourceCount),
                  migratedCount: form.migratedCount === '' ? undefined : Number(form.migratedCount),
                  notes: form.notes || undefined,
                  changeRequestAmountMinor:
                    form.disposition === 'CHANGE_REQUEST' && form.changeRequestAmount !== ''
                      ? Math.round(Number(form.changeRequestAmount) * 100)
                      : undefined,
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="In scope?" htmlFor="disposition">
              <Select
                id="disposition"
                value={form.disposition}
                onChange={(event) =>
                  setForm({ ...form, disposition: event.target.value as ScopeDisposition })
                }
              >
                {SCOPE_DISPOSITIONS.map((value) => (
                  <option key={value} value={value}>
                    {SCOPE_DISPOSITION_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ScopeStatus })
                }
              >
                {SCOPE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {SCOPE_STATUS_LABEL[value].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Records in source" htmlFor="sourceCount">
              <Input
                id="sourceCount"
                type="number"
                min={0}
                value={form.sourceCount}
                onChange={(event) => setForm({ ...form, sourceCount: event.target.value })}
              />
            </Field>
            <Field label="Records migrated" htmlFor="migratedCount">
              <Input
                id="migratedCount"
                type="number"
                min={0}
                value={form.migratedCount}
                onChange={(event) => setForm({ ...form, migratedCount: event.target.value })}
              />
            </Field>
          </div>

          {form.disposition === 'CHANGE_REQUEST' && (
            <Field
              label="Change request value"
              htmlFor="cr"
              hint="Agreed price for this additional scope."
            >
              <Input
                id="cr"
                type="number"
                min={0}
                step="0.01"
                value={form.changeRequestAmount}
                onChange={(event) => setForm({ ...form, changeRequestAmount: event.target.value })}
              />
            </Field>
          )}

          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              rows={3}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/**
 * The commercial sign-off, separate from pricing it. Only rendered where the
 * caller has already checked `invoice:manage` - the server enforces the same
 * gate independently, but the button does not exist for someone who could
 * only ever see it fail.
 */
export function ApproveChangeRequestButton({ code, itemId }: { code: string; itemId: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction(approveChangeRequestAction, { onSuccess: () => setOpen(false) });

  return (
    <>
      <Button variant="subtle" size="xs" onClick={() => setOpen(true)}>
        <CircleCheck className="size-3.5" />
        Approve
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Approve this change request?"
        description="Creates a new invoice line for the agreed amount. This cannot be undone from here - correct the invoice directly if the price was wrong."
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
              onClick={() => action.run({ code, itemId })}
            >
              Approve
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
