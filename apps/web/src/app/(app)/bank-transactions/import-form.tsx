'use client';

import { useRef, useState } from 'react';
import { TriangleAlert, Upload } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
} from '@relay/ui';
import type { ParsedBankTransaction } from '@relay/core';
import { useAction } from '@/components/use-action';
import {
  confirmBankImportAction,
  previewBankImportAction,
  requestBankImportUploadAction,
} from '@/features/bank-import/actions';

type PreviewRow = ParsedBankTransaction & { include: boolean };

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload -> preview -> confirm, the same shape as the attachment upload flow
 * elsewhere in this app, plus the middle step this feature actually needs:
 * OCR runs and the parsed rows are shown for review *before* anything is
 * saved, so a bad read gets fixed (or just unchecked) by eye rather than
 * silently written to the ledger.
 */
export function BankImportPanel() {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [projectCode, setProjectCode] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const request = useAction(requestBankImportUploadAction, {
    toastOnSuccess: false,
    refresh: false,
  });
  const preview = useAction(previewBankImportAction, { toastOnSuccess: false, refresh: false });
  const confirm = useAction(confirmBankImportAction, {
    onSuccess: () => {
      setRows(null);
      setPreviewKey(null);
      setRawText('');
      setProjectCode('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const pending = uploading || request.pending || preview.pending;
  const error = uploadError ?? request.error ?? preview.error;

  async function handleFile(file: File | null) {
    setUploadError(null);
    setRows(null);
    request.reset();
    preview.reset();
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Upload a PNG, JPEG or WebP screenshot.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError('Screenshots must be 10MB or smaller.');
      return;
    }

    const requested = await request.run({ contentType: file.type, sizeBytes: file.size });
    if (!requested.ok) return;

    setUploading(true);
    let uploadOk = false;
    try {
      const formData = new FormData();
      for (const [key, value] of Object.entries(requested.data.fields)) {
        formData.append(key, value);
      }
      formData.append('file', file); // must be last - S3 stops reading fields at it
      const response = await fetch(requested.data.url, { method: 'POST', body: formData });
      uploadOk = response.ok;
      if (!response.ok) setUploadError('The upload did not go through. Try again.');
    } catch {
      setUploadError('The upload did not go through. Try again.');
    } finally {
      setUploading(false);
    }
    if (!uploadOk) return;

    const previewed = await preview.run({ key: requested.data.key });
    if (!previewed.ok) return;

    setPreviewKey(previewed.data.key);
    setRawText(previewed.data.rawText);
    setRows(
      previewed.data.rows.map((row) => ({
        ...row,
        occurredAt: row.occurredAt ? new Date(row.occurredAt) : null,
        include: row.amount !== null,
      })),
    );
  }

  function toggleRow(index: number) {
    setRows((current) =>
      current
        ? current.map((row, i) => (i === index ? { ...row, include: !row.include } : row))
        : current,
    );
  }

  async function handleConfirm() {
    if (!rows || !previewKey) return;
    const included = rows.filter((row) => row.include);
    await confirm.run({
      key: previewKey,
      projectCode: projectCode.trim() || undefined,
      rows: included.map(({ include: _include, ...row }) => row),
    });
  }

  const includedCount = rows?.filter((row) => row.include).length ?? 0;

  return (
    <Card>
      <CardHeader
        title="Import from screenshot"
        description="A screenshot of VietinBank's Chuyển tiền / Đã duyệt list - one or several transactions per image."
      />
      <CardBody className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {pending ? 'Reading the screenshot...' : 'Choose a screenshot'}
          </Button>
          {pending && (
            <span className="text-muted text-[12px]">
              Uploading, then running OCR - a few seconds for a typical screenshot.
            </span>
          )}
        </div>

        {error && (
          <Alert tone="danger" dense>
            {error}
          </Alert>
        )}

        {rows && rows.length === 0 && (
          <Alert tone="warning" dense>
            No amount was readable anywhere in that screenshot - nothing to import. Try a clearer or
            less zoomed-out capture.
          </Alert>
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-ink-soft text-[12.5px]">
              Found {rows.length} transaction{rows.length === 1 ? '' : 's'}. Review before importing
              - uncheck anything that looks wrong, or check the raw OCR text below if a field is
              empty.
            </p>

            <ul className="divide-line border-line divide-y rounded-[var(--radius-sm)] border">
              {rows.map((row, index) => (
                <li key={index} className="flex items-start gap-3 px-3.5 py-3">
                  <Checkbox
                    id={`bank-row-${index}`}
                    label=""
                    checked={row.include}
                    onChange={() => toggleRow(index)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-ink text-[13px] font-medium">
                        {row.amount !== null
                          ? `${row.amount.toLocaleString('vi-VN')} ${row.currency}`
                          : 'Amount not read'}
                      </span>
                      {row.direction && (
                        <Badge tone="muted" size="sm">
                          {row.direction}
                        </Badge>
                      )}
                      {row.status !== 'UNKNOWN' && (
                        <Badge
                          tone={
                            row.status === 'SUCCESS'
                              ? 'success'
                              : row.status === 'FAILED'
                                ? 'danger'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {row.statusRaw ?? row.status}
                        </Badge>
                      )}
                      {row.occurredAt && (
                        <span className="text-faint text-[11.5px]">
                          {row.occurredAt.toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                    <p className="text-ink-soft text-[12.5px]">
                      {row.recipientName ?? 'Unknown recipient'}
                      {row.recipientBank && (
                        <span className="text-muted">
                          {' '}
                          &middot; {row.recipientBank}
                          {row.recipientAccountNumber ? ` (${row.recipientAccountNumber})` : ''}
                        </span>
                      )}
                    </p>
                    {row.content && <p className="text-muted text-[12px]">{row.content}</p>}
                    {row.warnings.length > 0 && (
                      <p className="text-warning flex items-start gap-1 text-[11.5px]">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        {row.warnings.join(' ')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <details className="text-[12px]">
              <summary className="text-muted cursor-pointer select-none">Show raw OCR text</summary>
              <pre className="bg-surface-2 mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] p-3 text-[11px] leading-4">
                {rawText}
              </pre>
            </details>

            <div className="flex flex-wrap items-end gap-3">
              <Field
                label="Link to a project"
                htmlFor="bank-import-project"
                hint="Optional - leave blank for a general expense."
                className="max-w-[220px]"
              >
                <Input
                  id="bank-import-project"
                  placeholder="PRJ-0001"
                  value={projectCode}
                  onChange={(event) => setProjectCode(event.target.value)}
                />
              </Field>
              <Button
                variant="primary"
                size="sm"
                loading={confirm.pending}
                disabled={includedCount === 0}
                onClick={handleConfirm}
              >
                Import {includedCount} transaction{includedCount === 1 ? '' : 's'}
              </Button>
            </div>
            {confirm.error && (
              <Alert tone="danger" dense>
                {confirm.error}
              </Alert>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
