'use client';

import { useState } from 'react';
import { BellRing, Banknote, Pencil, Plus } from 'lucide-react';
import { formatMoney, type InvoiceStatus } from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Textarea } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  chaseInvoiceAction,
  recordPaymentAction,
  upsertInvoiceAction,
} from '@/features/invoices/actions';

interface InvoiceForm {
  id?: string;
  milestone: string;
  number: string | null;
  amount: number;
  paid: number;
  status: InvoiceStatus;
  invoiceDate: string | null;
  dueDate: string | null;
  notes: string | null;
  currency: string;
}

/**
 * "Put in the contract size, then the amount, and it does the math" - the
 * project's contract value is fixed and already known, so the one number
 * actually worth computing live is what an amount represents as a share of
 * it. `null` for a missing/zero contract value or a not-yet-a-number
 * amount - nothing to say yet, not an error.
 */
function contractSharePct(amount: string, contractValue: number): number | null {
  const parsed = Number(amount);
  if (contractValue <= 0 || !Number.isFinite(parsed) || parsed <= 0) return null;
  return (parsed / contractValue) * 100;
}

function formatPct(pct: number): string {
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

function contractShareHint(amount: string, contractValue: number, currency: string): string | null {
  const pct = contractSharePct(amount, contractValue);
  if (pct === null) return null;
  return `≈ ${formatPct(pct)} of the ${formatMoney(contractValue * 100, currency)} contract value`;
}

/**
 * The auto-filled milestone name ("70% of payment completed") tracks the
 * Amount field live - but only while the Milestone field still holds either
 * nothing or a name this same auto-fill produced. The moment someone types
 * their own name ("Kickoff deposit", "Design sign-off"), that stops:
 * detected by pattern match rather than a separate "touched" flag, so it
 * still resumes auto-naming if they clear the field back out.
 */
const AUTO_MILESTONE_PATTERN = /^\d+(?:\.\d+)?% of payment completed$/;

function autoMilestoneName(pct: number): string {
  return `${formatPct(pct)} of payment completed`;
}

function InvoiceDialog({
  code,
  invoice,
  contractValue,
  currency,
  nextNumber,
  open,
  onClose,
}: {
  code: string;
  invoice?: InvoiceForm;
  contractValue: number;
  currency: string;
  /** Only used for a brand-new invoice - editing an existing one keeps its
   * own number, never renumbers it. */
  nextNumber: string;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    milestone: invoice?.milestone ?? '',
    number: invoice?.number ?? nextNumber,
    amount: invoice?.amount?.toString() ?? '',
    invoiceDate: invoice?.invoiceDate?.slice(0, 10) ?? '',
    dueDate: invoice?.dueDate?.slice(0, 10) ?? '',
    notes: invoice?.notes ?? '',
  });
  const action = useAction(upsertInvoiceAction, { onSuccess: onClose });
  const shareHint = contractShareHint(form.amount, contractValue, currency);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={invoice ? `Edit ${invoice.milestone}` : 'Add a milestone'}
      description="Status is calculated from what's been paid, never set by hand - record a payment to move it along."
      size="sm"
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
                code,
                invoiceId: invoice?.id,
                milestone: form.milestone,
                number: form.number || undefined,
                amount: Number(form.amount || 0),
                invoiceDate: form.invoiceDate || undefined,
                dueDate: form.dueDate || undefined,
                notes: form.notes || undefined,
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

        <Field
          label="Milestone"
          htmlFor="milestone"
          required
          error={action.fieldErrors.milestone ?? null}
        >
          <Input
            id="milestone"
            value={form.milestone}
            onChange={(event) => setForm({ ...form, milestone: event.target.value })}
            placeholder="e.g. Design sign-off (30%)"
          />
        </Field>

        <Field
          label="Amount"
          htmlFor="amount"
          required
          error={action.fieldErrors.amount ?? null}
          hint={shareHint ?? undefined}
        >
          <Input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(event) => {
              const amount = event.target.value;
              const pct = contractSharePct(amount, contractValue);
              setForm((f) => ({
                ...f,
                amount,
                milestone:
                  pct !== null && (f.milestone.trim() === '' || AUTO_MILESTONE_PATTERN.test(f.milestone))
                    ? autoMilestoneName(pct)
                    : f.milestone,
              }));
            }}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Number" htmlFor="number" error={action.fieldErrors.number ?? null}>
            <Input
              id="number"
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
            />
          </Field>
          <Field
            label="Invoice date"
            htmlFor="invoiceDate"
            error={action.fieldErrors.invoiceDate ?? null}
          >
            <Input
              id="invoiceDate"
              type="date"
              value={form.invoiceDate}
              onChange={(event) => setForm({ ...form, invoiceDate: event.target.value })}
            />
          </Field>
          <Field label="Due date" htmlFor="dueDate">
            <Input
              id="dueDate"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            rows={2}
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function NewInvoiceButton({
  code,
  currency,
  contractValue,
  nextNumber,
}: {
  code: string;
  currency: string;
  contractValue: number;
  nextNumber: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add milestone
      </Button>
      <InvoiceDialog
        code={code}
        currency={currency}
        contractValue={contractValue}
        nextNumber={nextNumber}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function InvoiceControls({
  code,
  invoice,
  contractValue,
}: {
  code: string;
  invoice: InvoiceForm;
  contractValue: number;
}) {
  const [dialog, setDialog] = useState<'edit' | 'payment' | null>(null);
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');

  const payment = useAction(recordPaymentAction, { onSuccess: () => setDialog(null) });
  const chase = useAction(chaseInvoiceAction);

  const outstanding = invoice.amount - invoice.paid;
  const paidAfterPct = contractSharePct((invoice.paid + Number(amount || 0)).toString(), contractValue);
  const paidAfterHint =
    paidAfterPct === null ? undefined : `Brings the project to ${formatPct(paidAfterPct)} paid`;

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="xs" onClick={() => setDialog('edit')} title="Edit">
        <Pencil className="size-3.5" />
      </Button>

      {outstanding > 0 && invoice.status !== 'NOT_INVOICED' && (
        <>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setAmount(outstanding.toFixed(2));
              setDialog('payment');
            }}
            title="Record a payment"
          >
            <Banknote className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            loading={chase.pending}
            onClick={() => chase.run({ code, invoiceId: invoice.id! })}
            title="Send a reminder"
          >
            <BellRing className="size-3.5" />
          </Button>
        </>
      )}

      {dialog === 'edit' && (
        <InvoiceDialog
          code={code}
          invoice={invoice}
          currency={invoice.currency}
          contractValue={contractValue}
          nextNumber={invoice.number ?? ''}
          open
          onClose={() => setDialog(null)}
        />
      )}

      <Dialog
        open={dialog === 'payment'}
        onClose={() => setDialog(null)}
        title={`Record a payment against ${invoice.milestone}`}
        description={`Outstanding: ${outstanding.toFixed(2)} ${invoice.currency}.`}
        size="sm"
        busy={payment.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={payment.pending}
              onClick={() =>
                payment.run({
                  code,
                  invoiceId: invoice.id!,
                  amount: Number(amount || 0),
                  paidDate: paidDate || undefined,
                })
              }
            >
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {payment.error && (
            <Alert tone="danger" dense>
              {payment.error}
            </Alert>
          )}
          <Field
            label="Amount received"
            htmlFor="paymentAmount"
            required
            error={payment.fieldErrors.amount ?? null}
            hint={paidAfterHint}
          >
            <Input
              id="paymentAmount"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date received" htmlFor="paidDate">
            <Input
              id="paidDate"
              type="date"
              value={paidDate}
              onChange={(event) => setPaidDate(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
