'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Eye, EyeOff, ImageUp, Layers, Trash2 } from 'lucide-react';
import {
  CAPTURE_PHASE_LABEL,
  CAPTURE_VIEWPORT_LABEL,
  formatDate,
  formatFileSize,
  type CapturePhase,
  type CaptureViewport,
} from '@relay/core';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  IconButton,
  Input,
  RadioCards,
  Select,
  useToast,
} from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  autoCaptureAction,
  confirmCaptureUploadAction,
  deleteCaptureAction,
  deleteComparisonAction,
  requestCaptureUploadAction,
  saveComparisonAction,
  setComparisonVisibilityAction,
} from '@/features/qa/capture-actions';
import { CAPTURE_MAX_BYTES, CAPTURE_TYPES } from '@/features/qa/capture-types';

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function UploadCaptureButton({
  code,
  pages,
  defaults,
}: {
  code: string;
  pages: string[];
  defaults?: { url?: string; phase?: CapturePhase; viewport?: CaptureViewport };
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    url: defaults?.url ?? pages[0] ?? '',
    phase: defaults?.phase ?? ('BEFORE' as CapturePhase),
    viewport: defaults?.viewport ?? ('DESKTOP' as CaptureViewport),
    changeNote: '',
    capturedAt: '',
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const request = useAction(requestCaptureUploadAction, { toastOnSuccess: false, refresh: false });
  const confirm = useAction(confirmCaptureUploadAction, {
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    },
  });
  const pending = uploading || request.pending || confirm.pending;

  function pick(picked: File | null) {
    setError(null);
    if (picked && !CAPTURE_TYPES.some((type) => type.mimeType === picked.type)) {
      setError('Screenshots must be PNG, JPEG or WebP.');
      setFile(null);
      return;
    }
    if (picked && picked.size > CAPTURE_MAX_BYTES) {
      setError(`Screenshots must be ${formatFileSize(CAPTURE_MAX_BYTES)} or smaller.`);
      setFile(null);
      return;
    }
    setFile(picked);
  }

  async function upload() {
    if (!file) {
      setError('Choose a screenshot first.');
      return;
    }
    setError(null);
    let size: { width: number; height: number };
    try {
      size = await imageSize(file);
    } catch {
      setError('That image could not be read.');
      return;
    }
    const requested = await request.run({ code, contentType: file.type, sizeBytes: file.size });
    if (!requested.ok) return;

    setUploading(true);
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(requested.data.fields)) body.append(key, value);
      body.append('file', file);
      const response = await fetch(requested.data.url, { method: 'POST', body });
      if (!response.ok) {
        setError('The upload did not go through. Try again.');
        return;
      }
    } catch {
      setError('The upload did not go through. Try again.');
      return;
    } finally {
      setUploading(false);
    }

    await confirm.run({
      code,
      key: requested.data.key,
      contentType: file.type,
      url: form.url,
      phase: form.phase,
      viewport: form.viewport,
      width: size.width,
      height: size.height,
      changeNote: form.changeNote || undefined,
      capturedAt: form.capturedAt || undefined,
    });
  }

  const shownError = error ?? request.error ?? confirm.error;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ImageUp className="size-3.5" />
        Upload capture
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a capture"
        description="A full-page screenshot of one page. Every upload is kept, so the history shows how the page changed."
        busy={pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={pending} onClick={upload}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {shownError && (
            <Alert tone="danger" dense>
              {shownError}
            </Alert>
          )}
          <Field label="Screenshot" htmlFor="c-file" required hint="PNG, JPEG or WebP.">
            <input
              ref={fileRef}
              id="c-file"
              type="file"
              accept={CAPTURE_TYPES.map((type) => type.mimeType).join(',')}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="text-ink file:border-line file:bg-surface-2 block w-full text-[13px] file:mr-3 file:rounded-full file:border file:px-3 file:py-1.5 file:text-[12.5px]"
            />
          </Field>
          <Field label="Page" htmlFor="c-url" required error={confirm.fieldErrors.url ?? null}>
            <Input
              id="c-url"
              list="c-url-pages"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <datalist id="c-url-pages">
              {pages.map((url) => (
                <option key={url} value={url} />
              ))}
            </datalist>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phase">
              <RadioCards
                name="c-phase"
                className="grid-cols-2 sm:grid-cols-2"
                value={form.phase}
                onChange={(phase) => setForm({ ...form, phase })}
                options={(['BEFORE', 'AFTER'] as const).map((value) => ({
                  value,
                  label: CAPTURE_PHASE_LABEL[value].label,
                }))}
              />
            </Field>
            <Field label="Viewport">
              <RadioCards
                name="c-viewport"
                className="grid-cols-2 sm:grid-cols-2"
                value={form.viewport}
                onChange={(viewport) => setForm({ ...form, viewport })}
                options={(['DESKTOP', 'MOBILE'] as const).map((value) => ({
                  value,
                  label: CAPTURE_VIEWPORT_LABEL[value].label,
                }))}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What changed" htmlFor="c-note" hint="Optional, e.g. New hero and navigation.">
              <Input
                id="c-note"
                value={form.changeNote}
                onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
              />
            </Field>
            <Field label="Captured on" htmlFor="c-date" hint="Leave empty for today.">
              <Input
                id="c-date"
                type="date"
                value={form.capturedAt}
                onChange={(e) => setForm({ ...form, capturedAt: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </>
  );
}

interface CaptureOption {
  id: string;
  phase: CapturePhase;
  capturedAt: Date;
  changeNote: string | null;
}

export function CompareButton({
  code,
  url,
  label,
  before,
  after,
}: {
  code: string;
  url: string;
  label: string;
  before: CaptureOption[];
  after: CaptureOption[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    beforeCaptureId: before[0]?.id ?? '',
    afterCaptureId: after[0]?.id ?? '',
    label,
    afterLabel: 'AFTER',
    changeNote: '',
    featured: false,
  });
  const action = useAction(saveComparisonAction, { onSuccess: () => setOpen(false) });
  const describe = (capture: CaptureOption) =>
    `${formatDate(capture.capturedAt)}${capture.changeNote ? ` - ${capture.changeNote}` : ''}`;

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        disabled={before.length === 0 || after.length === 0}
        title={before.length === 0 || after.length === 0 ? 'Needs a before and an after capture' : undefined}
        onClick={() => setOpen(true)}
      >
        <Layers className="size-3" />
        Make comparison
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Make a comparison"
        description={url}
        size="sm"
        busy={action.pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={action.pending} onClick={() => action.run({ code, ...form })}>
              Save comparison
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
          <Field label="Name" htmlFor="cmp-label" error={action.fieldErrors.label ?? null}>
            <Input id="cmp-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <Field label="Before" htmlFor="cmp-before">
            <Select
              id="cmp-before"
              value={form.beforeCaptureId}
              onChange={(e) => setForm({ ...form, beforeCaptureId: e.target.value })}
            >
              {before.map((capture) => (
                <option key={capture.id} value={capture.id}>
                  {describe(capture)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="After" htmlFor="cmp-after">
            <Select
              id="cmp-after"
              value={form.afterCaptureId}
              onChange={(e) => setForm({ ...form, afterCaptureId: e.target.value })}
            >
              {after.map((capture) => (
                <option key={capture.id} value={capture.id}>
                  {describe(capture)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="After is" htmlFor="cmp-after-label" hint="Say whether the after is live or still a design.">
            <Select
              id="cmp-after-label"
              value={form.afterLabel}
              onChange={(e) => setForm({ ...form, afterLabel: e.target.value })}
            >
              <option value="AFTER">Live (AFTER)</option>
              <option value="AFTER · DESIGN">A design proposal (AFTER · DESIGN)</option>
              <option value="AFTER · STAGING">On staging (AFTER · STAGING)</option>
            </Select>
          </Field>
          <label className="text-ink flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            Lead the project card with this comparison
          </label>
        </div>
      </Dialog>
    </>
  );
}

export function ComparisonControls({
  code,
  pairId,
  visible,
  canApprove,
  canManage,
}: {
  code: string;
  pairId: string;
  visible: boolean;
  canApprove: boolean;
  canManage: boolean;
}) {
  const share = useAction(setComparisonVisibilityAction);
  const remove = useAction(deleteComparisonAction);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canApprove && (
        <Button
          variant={visible ? 'subtle' : 'secondary'}
          size="xs"
          loading={share.pending}
          onClick={() => share.run({ code, pairId, visible: !visible })}
        >
          {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          {visible ? 'Hide from client' : 'Share with client'}
        </Button>
      )}
      {canManage && (
        <Button variant="ghost" size="xs" loading={remove.pending} onClick={() => remove.run({ code, pairId })}>
          Remove
        </Button>
      )}
    </div>
  );
}

const AUTO_VIEWPORTS: CaptureViewport[] = ['DESKTOP', 'MOBILE'];

export function AutoCaptureButton({
  code,
  pageId,
  phase,
  viewport,
}: {
  code: string;
  pageId: string;
  phase: CapturePhase;
  viewport: CaptureViewport;
}) {
  const action = useAction(autoCaptureAction);
  return (
    <Button
      variant="subtle"
      size="xs"
      loading={action.pending}
      onClick={() => action.run({ code, pageId, phase, viewport })}
      title={`Capture the ${viewport.toLowerCase()} ${phase.toLowerCase()} now`}
    >
      <Camera className="size-3" />
      {CAPTURE_VIEWPORT_LABEL[viewport].label}
    </Button>
  );
}

/**
 * Every page × desktop and mobile, one request each: a full-page screenshot
 * takes 10-30 seconds, so a batch in one request would outlive the function.
 * Failures are counted and the run carries on.
 */
export function AutoCaptureAllButton({
  code,
  pageIds,
  phase,
}: {
  code: string;
  pageIds: string[];
  phase: CapturePhase;
}) {
  const toast = useToast();
  const router = useRouter();
  const action = useAction(autoCaptureAction, { toastOnSuccess: false, refresh: false });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function runAll() {
    const jobs = pageIds.flatMap((pageId) => AUTO_VIEWPORTS.map((viewport) => ({ pageId, viewport })));
    let failed = 0;
    for (let index = 0; index < jobs.length; index += 1) {
      setProgress({ done: index, total: jobs.length });
      const result = await action.run({ code, phase, ...jobs[index]! });
      if (!result.ok) failed += 1;
    }
    setProgress(null);
    router.refresh();
    const captured = jobs.length - failed;
    if (failed === 0) toast.success(`${captured} ${phase.toLowerCase()} capture${captured === 1 ? '' : 's'} taken.`);
    else toast.error(`${captured} captured, ${failed} failed`, 'Each failure says why; retry those pages one by one.');
  }

  return (
    <Button
      variant={phase === 'BEFORE' ? 'secondary' : 'primary'}
      size="sm"
      disabled={pageIds.length === 0 || progress !== null}
      onClick={runAll}
    >
      <Camera className={progress ? 'size-3.5 animate-pulse' : 'size-3.5'} />
      {progress
        ? `Capturing ${progress.done + 1} of ${progress.total}`
        : `Capture all ${phase === 'BEFORE' ? 'before' : 'after'}`}
    </Button>
  );
}

export function DeleteCaptureButton({ code, captureId }: { code: string; captureId: string }) {
  const [open, setOpen] = useState(false);
  const action = useAction(deleteCaptureAction, { onSuccess: () => setOpen(false) });
  return (
    <>
      <IconButton label="Delete capture" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
      </IconButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => action.run({ code, captureId })}
        title="Delete this capture?"
        description="The image is removed for good, along with any comparison that uses it."
        confirmLabel="Delete"
        variant="danger"
        busy={action.pending}
      />
    </>
  );
}
