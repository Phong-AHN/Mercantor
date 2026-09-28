'use client';

import { useState } from 'react';
import { Gauge, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PAGE_TYPE_LABEL, PAGE_TYPES, type PageType } from '@relay/core';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  addPagesAction,
  removePageAction,
  runPageCheckAction,
  runPerfTestAction,
  updatePageAction,
} from '@/features/qa/actions';
import { deleteShowcaseMetricAction, saveShowcaseMetricAction } from '@/features/qa/capture-actions';

export function AddPagesButton({ code, suggestions }: { code: string; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState('');
  const action = useAction(addPagesAction, {
    onSuccess: () => {
      setOpen(false);
      setUrls('');
    },
  });
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Add pages
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add pages to check"
        description="Paste one URL per line. Paths like /collections/all work too. The page type is suggested from the URL and can be changed after."
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
              onClick={() => action.run({ code, urls })}
            >
              Add pages
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
          <Field label="Pages" htmlFor="urls" error={action.fieldErrors.urls ?? null}>
            <Textarea
              id="urls"
              rows={8}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={'https://shop.example.com/\n/collections/all\n/products/linen-shirt\n/cart'}
              className="font-mono text-[12.5px]"
            />
          </Field>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted text-[12px]">Common templates:</span>
              {suggestions.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setUrls((current) => (current ? `${current}\n${path}` : path))}
                  className="border-line text-ink hover:bg-surface-2 rounded-full border px-2.5 py-1 font-mono text-[11.5px]"
                >
                  {path}
                </button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function PageTypeSelect({
  code,
  pageId,
  pageType,
  confirmed,
}: {
  code: string;
  pageId: string;
  pageType: PageType;
  confirmed: boolean;
}) {
  const action = useAction(updatePageAction, { toastOnSuccess: false });
  return (
    <Select
      aria-label="Page type"
      value={pageType}
      disabled={action.pending}
      onChange={(e) => action.run({ code, pageId, pageType: e.target.value as PageType })}
      className={confirmed ? 'h-8 text-[12.5px]' : 'h-8 border-dashed text-[12.5px]'}
      title={confirmed ? 'Confirmed' : 'Suggested from the URL - pick to confirm'}
    >
      {PAGE_TYPES.map((value) => (
        <option key={value} value={value}>
          {PAGE_TYPE_LABEL[value].label}
          {!confirmed && value === pageType ? ' (suggested)' : ''}
        </option>
      ))}
    </Select>
  );
}

export function IncludeToggle({
  code,
  pageId,
  included,
}: {
  code: string;
  pageId: string;
  included: boolean;
}) {
  const action = useAction(updatePageAction);
  return (
    <label className="text-muted inline-flex cursor-pointer items-center gap-1.5 text-[12px]">
      <input
        type="checkbox"
        checked={included}
        disabled={action.pending}
        onChange={(e) => action.run({ code, pageId, includeInScans: e.target.checked })}
        className="accent-[var(--accent)]"
      />
      Included
    </label>
  );
}

export function CheckPageButton({ code, pageId }: { code: string; pageId: string }) {
  const action = useAction(runPageCheckAction);
  return (
    <Button variant="subtle" size="xs" loading={action.pending} onClick={() => action.run({ code, pageId })}>
      <RefreshCw className="size-3" />
      Check
    </Button>
  );
}

/** Runs pages one action call at a time, so each stays inside a request's time limit. */
export function CheckAllButton({ code, pageIds }: { code: string; pageIds: string[] }) {
  const action = useAction(runPageCheckAction, { toastOnSuccess: false, refresh: false });
  const [progress, setProgress] = useState<number | null>(null);
  const refresher = useAction(runPageCheckAction, { toastOnSuccess: false });

  async function runAll() {
    for (let index = 0; index < pageIds.length; index += 1) {
      setProgress(index + 1);
      const last = index === pageIds.length - 1;
      await (last ? refresher : action).run({ code, pageId: pageIds[index]! });
    }
    setProgress(null);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pageIds.length === 0 || progress !== null}
      onClick={runAll}
    >
      <RefreshCw className={progress !== null ? 'size-3.5 animate-spin' : 'size-3.5'} />
      {progress !== null ? `Checking ${progress} of ${pageIds.length}` : 'Check all pages'}
    </Button>
  );
}

export function RemovePageButton({ code, pageId, url }: { code: string; pageId: string; url: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction(removePageAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <IconButton label="Remove page" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
      </IconButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => action.run({ code, pageId })}
        title="Remove this page?"
        description={`${url} will no longer be checked. Findings, captures and performance history for it are kept.`}
        confirmLabel="Remove"
        variant="danger"
        busy={action.pending}
      />
    </>
  );
}

export function RunPerfButton({
  code,
  pageId,
  device,
  label,
}: {
  code: string;
  pageId: string;
  device: 'DESKTOP' | 'MOBILE';
  label?: string;
}) {
  const action = useAction(runPerfTestAction);
  return (
    <Button
      variant="subtle"
      size="xs"
      loading={action.pending}
      onClick={() => action.run({ code, pageId, device })}
    >
      <Gauge className="size-3" />
      {label ?? (device === 'DESKTOP' ? 'Desktop' : 'Mobile')}
    </Button>
  );
}

export interface MetricValues {
  metricId?: string;
  label: string;
  beforeValue: string;
  afterValue: string;
  unit: string;
  direction: 'LOWER_IS_BETTER' | 'HIGHER_IS_BETTER' | 'NEUTRAL';
  measuredAt: string;
}

const EMPTY_METRIC: MetricValues = {
  label: '',
  beforeValue: '',
  afterValue: '',
  unit: '',
  direction: 'LOWER_IS_BETTER',
  measuredAt: '',
};

export function MetricButton({ code, initial }: { code: string; initial?: MetricValues }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MetricValues>(initial ?? EMPTY_METRIC);
  const action = useAction(saveShowcaseMetricAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <Button
        variant={initial ? 'link' : 'secondary'}
        size={initial ? 'xs' : 'sm'}
        onClick={() => {
          setForm(initial ?? EMPTY_METRIC);
          setOpen(true);
        }}
      >
        {initial ? 'Edit' : (
          <>
            <Plus className="size-3.5" />
            Add a number
          </>
        )}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={initial ? 'Edit headline number' : 'Add a headline number'}
        description="A measured before and after, e.g. from Lighthouse or WebPageTest. Up to three featured numbers lead the project card."
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
                  metricId: form.metricId,
                  label: form.label,
                  beforeValue: form.beforeValue === '' ? null : Number(form.beforeValue),
                  afterValue: form.afterValue,
                  unit: form.unit,
                  direction: form.direction,
                  measuredAt: form.measuredAt || undefined,
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
          <Field label="What was measured" htmlFor="m-label" required error={action.fieldErrors.label ?? null}>
            <Input
              id="m-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Requests to load the homepage"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Before" htmlFor="m-before">
              <Input
                id="m-before"
                inputMode="decimal"
                value={form.beforeValue}
                onChange={(e) => setForm({ ...form, beforeValue: e.target.value })}
              />
            </Field>
            <Field label="After" htmlFor="m-after" required error={action.fieldErrors.afterValue ?? null}>
              <Input
                id="m-after"
                inputMode="decimal"
                value={form.afterValue}
                onChange={(e) => setForm({ ...form, afterValue: e.target.value })}
              />
            </Field>
            <Field label="Unit" htmlFor="m-unit">
              <Input
                id="m-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="MB, s"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Better is" htmlFor="m-direction">
              <Select
                id="m-direction"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value as MetricValues['direction'] })
                }
              >
                <option value="LOWER_IS_BETTER">Lower</option>
                <option value="HIGHER_IS_BETTER">Higher</option>
                <option value="NEUTRAL">Neither</option>
              </Select>
            </Field>
            <Field label="Measured on" htmlFor="m-date">
              <Input
                id="m-date"
                type="date"
                value={form.measuredAt}
                onChange={(e) => setForm({ ...form, measuredAt: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function DeleteMetricButton({ code, metricId }: { code: string; metricId: string }) {
  const action = useAction(deleteShowcaseMetricAction);
  return (
    <Button
      variant="link"
      size="xs"
      loading={action.pending}
      onClick={() => action.run({ code, metricId })}
      className="text-danger-ink"
    >
      Remove
    </Button>
  );
}
