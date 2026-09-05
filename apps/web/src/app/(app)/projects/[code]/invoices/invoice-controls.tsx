'use client';

import { useState } from 'react';
import { BellRing, Banknote, Pencil, Plus } from 'lucide-react';
import { INVOICE_STATUS_LABEL, INVOICE_STATUSES, type InvoiceStatus } from '@relay/core';
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from '@relay/ui';
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

function InvoiceDialog({
  code,
  invoice,
  open,
  onClose,
}: {
  code: string;
  invoice?: InvoiceForm;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    milestone: invoice?.milestone ?? '',
    number: invoice?.number ?? '',
    amount: invoice?.amount?.toString() ?? '',
    status: invoice?.status ?? ('NOT_INVOICED' as InvoiceStatus),
    invoiceDate: invoice?.invoiceDate?.slice(0, 10) ?? '',
    dueDate: invoice?.dueDate?.slice(0, 10) ?? '',
    notes: invoice?.notes ?? '',
  });
  const action = useAction(upsertInvoiceAction, { onSuccess: onClose });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={invoice ? `Edit ${invoice.milestone}` : 'Add a milestone'}
      description="Amounts are stored to the cent. A sent invoice needs a number and a date."
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
                status: form.status,
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount" htmlFor="amount" required error={action.fieldErrors.amount ?? null}>
            <Input
              id="amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as InvoiceStatus })
              }
            >
              {INVOICE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {INVOICE_STATUS_LABEL[value].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Number" htmlFor="number" error={action.fieldErrors.number ?? null}>
            <Input
              id="number"
              value={form.number}
              onChange={(event) => setForm({ ...form, number: event.target.value })}
              placeholder="AHN-0000"
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

export function NewInvoiceButton({ code }: { code: string; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add milestone
      </Button>
      <InvoiceDialog code={code} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function InvoiceControls({ code, invoice }: { code: string; invoice: InvoiceForm }) {
  const [dialog, setDialog] = useState<'edit' | 'payment' | null>(null);
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');

  const payment = useAction(recordPaymentAction, { onSuccess: () => setDialog(null) });
  const chase = useAction(chaseInvoiceAction);

  const outstanding = invoice.amount - invoice.paid;

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
        <InvoiceDialog code={code} invoice={invoice} open onClose={() => setDialog(null)} />
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
