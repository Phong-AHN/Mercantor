'use client';

import { useId, useRef, useState } from 'react';
import { Link2, Loader2, Upload } from 'lucide-react';
import {
  ACCESS_STATUS_LABEL,
  ASSET_STATUS_LABEL,
  MAX_ATTACHMENT_BYTES,
  acceptedAttachmentTypes,
  attachmentTypeFor,
  formatFileSize,
  type AccessStatus,
  type AssetStatus,
} from '@relay/core';
import { Alert, Button, cn, Dialog, Field, Input, TONE_SOFT } from '@relay/ui';
import { useAction } from '@/components/use-action';
import {
  attachLinkAction,
  setAccessStatusAction,
  setAssetStatusAction,
} from '@/features/checklists/actions';
import { confirmUploadAction, requestUploadAction } from '@/features/attachments/actions';

/**
 * A status control that is the status: clicking the state you want is the whole
 * interaction, rather than opening a form to change a dropdown. The options a
 * given reader is allowed to set are decided on the server and passed in.
 */
export function AccessStatusPicker({
  code,
  itemId,
  status,
  options,
}: {
  code: string;
  itemId: string;
  status: AccessStatus;
  options: AccessStatus[];
}) {
  const action = useAction(setAccessStatusAction, { toastOnSuccess: true });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = option === status;
        return (
          <button
            key={option}
            type="button"
            disabled={action.pending || active}
            onClick={() => action.run({ code, itemId, status: option })}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-default',
              active
                ? TONE_SOFT[ACCESS_STATUS_LABEL[option].tone]
                : 'text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            {ACCESS_STATUS_LABEL[option].label}
          </button>
        );
      })}
      {action.pending && <Loader2 className="text-muted size-3.5 animate-spin" />}
    </div>
  );
}

export function AssetStatusPicker({
  code,
  itemId,
  status,
  options,
}: {
  code: string;
  itemId: string;
  status: AssetStatus;
  options: AssetStatus[];
}) {
  const action = useAction(setAssetStatusAction, { toastOnSuccess: true });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => {
        const active = option === status;
        return (
          <button
            key={option}
            type="button"
            disabled={action.pending || active}
            onClick={() => action.run({ code, itemId, status: option })}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:cursor-default',
              active
                ? TONE_SOFT[ASSET_STATUS_LABEL[option].tone]
                : 'text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            {ASSET_STATUS_LABEL[option].label}
          </button>
        );
      })}
      {action.pending && <Loader2 className="text-muted size-3.5 animate-spin" />}
    </div>
  );
}

/** Attaching a link is how most assets actually arrive - a Drive folder. */
export function AttachLinkButton({
  code,
  assetItemId,
  accessItemId,
  label,
}: {
  code: string;
  assetItemId?: string;
  accessItemId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(label ?? '');
  const [url, setUrl] = useState('');
  const action = useAction(attachLinkAction, {
    onSuccess: () => {
      setOpen(false);
      setUrl('');
    },
  });
  // Every dialog on the page stays mounted (just hidden) while closed, and
  // this button renders once per checklist item - a literal id would collide
  // across every one of them, not just the open dialog.
  const uid = useId();
  const labelId = `${uid}-label`;
  const urlId = `${uid}-url`;

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Link2 className="size-3.5" />
        Attach link
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Attach a link"
        description="A Drive folder, a Figma file, a spreadsheet - anything the team needs to find again."
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
              onClick={() => action.run({ code, label: name, url, assetItemId, accessItemId })}
            >
              Attach
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
          <Field label="Label" htmlFor={labelId} required error={action.fieldErrors.label ?? null}>
            <Input id={labelId} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="URL" htmlFor={urlId} required error={action.fieldErrors.url ?? null}>
            <Input
              id={urlId}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/**
 * The actual bytes go straight from the browser to the bucket on a presigned
 * URL - this component never routes a file through the app server. What it
 * owns is the two-step handshake: ask for a presigned upload, do the upload,
 * then confirm it so the server can verify the real bytes before anyone else
 * can see the attachment.
 */
export function FileUploadButton({
  code,
  assetItemId,
  accessItemId,
  issueId,
  commentId,
}: {
  code: string;
  assetItemId?: string;
  accessItemId?: string;
  issueId?: string;
  commentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // See the matching note on `AttachLinkButton` - one instance per checklist
  // item means a literal id collides across every dialog on the page.
  const uid = useId();
  const fileFieldId = `${uid}-file`;
  const labelFieldId = `${uid}-label`;

  const request = useAction(requestUploadAction, { toastOnSuccess: false, refresh: false });
  const confirm = useAction(confirmUploadAction, {
    successMessage: 'File attached.',
    onSuccess: () => {
      setOpen(false);
      setFile(null);
      setLabel('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const pending = uploading || request.pending || confirm.pending;
  const error = uploadError ?? request.error ?? confirm.error;

  function pickFile(picked: File | null) {
    setUploadError(null);
    request.reset();
    confirm.reset();
    if (picked) {
      const accepted = attachmentTypeFor(picked.type);
      if (!accepted) {
        setUploadError('That file type is not accepted.');
        setFile(null);
        return;
      }
      if (picked.size > MAX_ATTACHMENT_BYTES) {
        setUploadError(`Files must be ${formatFileSize(MAX_ATTACHMENT_BYTES)} or smaller.`);
        setFile(null);
        return;
      }
    }
    setFile(picked);
    if (picked && !label) setLabel(picked.name);
  }

  async function handleUpload() {
    if (!file) return;
    setUploadError(null);

    const requested = await request.run({ code, contentType: file.type, sizeBytes: file.size });
    if (!requested.ok) return;

    setUploading(true);
    let uploadOk = false;
    try {
      const formData = new FormData();
      for (const [key, value] of Object.entries(requested.data.fields)) {
        formData.append(key, value);
      }
      // The file field must come last - S3 stops reading form fields at it.
      formData.append('file', file);

      const response = await fetch(requested.data.url, { method: 'POST', body: formData });
      uploadOk = response.ok;
      if (!response.ok) setUploadError('The upload did not go through. Try again.');
    } catch {
      setUploadError('The upload did not go through. Try again.');
    } finally {
      setUploading(false);
    }
    if (!uploadOk) return;

    await confirm.run({
      code,
      key: requested.data.key,
      label: label.trim() || file.name,
      contentType: requested.data.mimeType,
      assetItemId,
      accessItemId,
      issueId,
      commentId,
    });
  }

  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" />
        Upload file
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a file"
        description={`Images, PDFs, spreadsheets and a few other types, up to ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`}
        size="sm"
        busy={pending}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              disabled={!file}
              onClick={handleUpload}
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && (
            <Alert tone="danger" dense>
              {error}
            </Alert>
          )}
          <Field label="File" htmlFor={fileFieldId}>
            <input
              ref={fileInputRef}
              id={fileFieldId}
              type="file"
              accept={acceptedAttachmentTypes()}
              disabled={pending}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              className="text-ink file:bg-surface-2 file:text-ink hover:file:bg-surface-3 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </Field>
          <Field label="Label" htmlFor={labelFieldId} error={confirm.fieldErrors.label ?? null}>
            <Input
              id={labelFieldId}
              value={label}
              disabled={pending}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
