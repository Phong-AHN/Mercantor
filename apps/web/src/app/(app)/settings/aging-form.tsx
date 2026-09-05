'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { AGING_BAND_LABEL } from '@relay/core';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FormActions,
  Input,
  StatusPill,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import { updateAgingThresholdsAction } from '@/features/settings/actions';

export function AgingForm({
  attentionDays,
  delayedDays,
  criticalDays,
  inactivityDays,
}: {
  attentionDays: number;
  delayedDays: number;
  criticalDays: number;
  inactivityDays: number;
}) {
  const [form, setForm] = useState({
    attentionDays: attentionDays.toString(),
    delayedDays: delayedDays.toString(),
    criticalDays: criticalDays.toString(),
    inactivityDays: inactivityDays.toString(),
  });
  const action = useAction(updateAgingThresholdsAction);

  return (
    <Card>
      <CardHeader
        title="Ageing indicators"
        description="A project's age, in days since the introduction, decides which band it sits in on the dashboard."
      />
      <CardBody className="space-y-4">
        {action.error && (
          <Alert tone="danger" dense>
            {action.error}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Attention from"
            htmlFor="attentionDays"
            hint="days"
            error={action.fieldErrors.attentionDays ?? null}
          >
            <Input
              id="attentionDays"
              type="number"
              min={1}
              value={form.attentionDays}
              onChange={(event) => setForm({ ...form, attentionDays: event.target.value })}
            />
          </Field>
          <Field
            label="Delayed from"
            htmlFor="delayedDays"
            hint="days"
            error={action.fieldErrors.delayedDays ?? null}
          >
            <Input
              id="delayedDays"
              type="number"
              min={1}
              value={form.delayedDays}
              onChange={(event) => setForm({ ...form, delayedDays: event.target.value })}
            />
          </Field>
          <Field
            label="Critical from"
            htmlFor="criticalDays"
            hint="days"
            error={action.fieldErrors.criticalDays ?? null}
          >
            <Input
              id="criticalDays"
              type="number"
              min={1}
              value={form.criticalDays}
              onChange={(event) => setForm({ ...form, criticalDays: event.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Inactivity alert after"
          htmlFor="inactivityDays"
          hint="Days without a recorded update before a project is flagged At Risk and its owners are nudged."
        >
          <Input
            id="inactivityDays"
            type="number"
            min={1}
            value={form.inactivityDays}
            onChange={(event) => setForm({ ...form, inactivityDays: event.target.value })}
          />
        </Field>

        <div className="bg-surface-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] p-3">
          <StatusPill descriptor={AGING_BAND_LABEL.ON_TRACK} size="sm" />
          <span className="tabular text-muted text-[11.5px]">
            0-{Math.max(0, Number(form.attentionDays) - 1)}
          </span>
          <StatusPill descriptor={AGING_BAND_LABEL.ATTENTION} size="sm" />
          <span className="tabular text-muted text-[11.5px]">
            {form.attentionDays}-{Math.max(0, Number(form.delayedDays) - 1)}
          </span>
          <StatusPill descriptor={AGING_BAND_LABEL.DELAYED} size="sm" />
          <span className="tabular text-muted text-[11.5px]">
            {form.delayedDays}-{Math.max(0, Number(form.criticalDays) - 1)}
          </span>
          <StatusPill descriptor={AGING_BAND_LABEL.CRITICAL} size="sm" />
          <span className="tabular text-muted text-[11.5px]">{form.criticalDays}+</span>
        </div>

        <FormActions>
          <Button
            variant="primary"
            size="sm"
            loading={action.pending}
            onClick={() =>
              action.run({
                attentionDays: Number(form.attentionDays),
                delayedDays: Number(form.delayedDays),
                criticalDays: Number(form.criticalDays),
                inactivityDays: Number(form.inactivityDays),
              })
            }
          >
            <Save className="size-3.5" />
            Save thresholds
          </Button>
        </FormActions>
      </CardBody>
    </Card>
  );
}
