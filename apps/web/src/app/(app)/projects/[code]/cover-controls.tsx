'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp } from 'lucide-react';
import { cn, MenuButton, Spinner, useToast } from '@relay/ui';

const MAX_WIDTH = 1920;

/**
 * Shrinks the picked image before upload: a hero never needs more than
 * 1920px, and a phone photo would otherwise be ten times the size. The server
 * still checks the real bytes, so this is about speed, not trust.
 */
async function prepare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_WIDTH / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    // Some browsers cannot encode WebP; JPEG is the universal fallback.
    return (
      blob ??
      (await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85),
      ))
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CoverControls({
  code,
  hasCover,
  hasFallback,
  onImage,
}: {
  code: string;
  hasCover: boolean;
  /** Whether a storefront screenshot would show once the cover is removed. */
  hasFallback: boolean;
  onImage: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function send(method: 'POST' | 'DELETE', body?: FormData) {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(code)}/cover`, {
        method,
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(
          method === 'POST' ? 'The cover was not saved' : 'The cover was not removed',
          payload?.error?.message ?? 'Try again in a moment.',
        );
        return;
      }
      toast.success(method === 'POST' ? 'Cover updated.' : 'Cover removed.');
      router.refresh();
    } catch {
      toast.error('The cover was not saved', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onPick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('That file is not a supported image', 'Use a PNG, JPEG or WebP image.');
      return;
    }
    let blob: Blob;
    try {
      blob = await prepare(file);
    } catch {
      toast.error('That image could not be read', 'Try a different file.');
      return;
    }
    const body = new FormData();
    body.append('file', blob, 'cover');
    await send('POST', body);
  }

  const trigger = cn(
    'focus-visible:ring-accent inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
    onImage
      ? 'bg-black/35 text-white backdrop-blur-sm hover:bg-black/50'
      : 'text-muted hover:bg-surface-2 hover:text-ink',
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      {hasCover ? (
        <MenuButton
          label="Cover image"
          triggerClassName={trigger}
          items={[
            {
              key: 'replace',
              label: 'Upload a new cover',
              description: 'PNG, JPEG or WebP. Shown behind the project name.',
              onSelect: () => inputRef.current?.click(),
            },
            {
              key: 'remove',
              label: 'Remove cover',
              description: hasFallback
                ? 'The latest storefront screenshot is shown instead.'
                : 'A plain background is shown instead.',
              onSelect: () => void send('DELETE'),
            },
          ]}
        >
          {busy ? <Spinner className="size-3.5" /> : <ImageUp className="size-3.5" aria-hidden />}
          Cover
        </MenuButton>
      ) : (
        <button
          type="button"
          className={trigger}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Spinner className="size-3.5" /> : <ImageUp className="size-3.5" aria-hidden />}
          Add cover
        </button>
      )}
    </>
  );
}
