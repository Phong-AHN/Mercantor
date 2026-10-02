'use client';

import { X } from 'lucide-react';
import { MAX_ATTACHMENT_BYTES, attachmentTypeFor, formatFileSize } from '@relay/core';
import { requestUploadAction } from '@/features/attachments/actions';

/**
 * Images on a comment: picking, previewing and uploading them in the
 * composer, and showing them in the thread.
 *
 * They ride the same two-step handshake as every other attachment
 * (`requestUploadAction`, a direct upload to the bucket, then
 * `confirmUploadAction` once the comment exists), so the server still sniffs
 * the real bytes before anyone else can see them.
 */

/** Raster types only - the ones `/api/attachments/[id]?inline=1` will serve for an `<img>`. */
export const COMMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_COMMENT_IMAGES = 10;

export interface PendingImage {
  id: string;
  file: File;
  /** A `blob:` URL for the preview; revoked when the image is dropped. */
  preview: string;
}

export function isCommentImage(attachment: { kind: string; mimeType?: string | null }): boolean {
  return (
    attachment.kind === 'FILE' &&
    !!attachment.mimeType &&
    COMMENT_IMAGE_TYPES.includes(attachment.mimeType)
  );
}

/**
 * The picked, pasted or dropped files that can go on a comment, plus a
 * message for any that cannot. Non-images are skipped quietly when they came
 * with images (a drag from a folder), and reported when nothing usable came.
 */
export function acceptImages(
  files: readonly File[],
  already: number,
): { accepted: PendingImage[]; error: string | null } {
  const images = files.filter((file) => COMMENT_IMAGE_TYPES.includes(file.type));
  if (images.length === 0) {
    return {
      accepted: [],
      error: files.length > 0 ? 'Only PNG, JPEG, WebP and GIF images can be attached.' : null,
    };
  }
  const tooLarge = images.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
  const room = Math.max(0, MAX_COMMENT_IMAGES - already);
  const fitting = images.filter((file) => file.size <= MAX_ATTACHMENT_BYTES).slice(0, room);
  const accepted = fitting.map((file) => ({
    id: crypto.randomUUID(),
    file,
    preview: URL.createObjectURL(file),
  }));

  let error: string | null = null;
  if (tooLarge.length > 0) {
    error = `Images must be ${formatFileSize(MAX_ATTACHMENT_BYTES)} or smaller.`;
  } else if (images.length - tooLarge.length > room) {
    error = `Up to ${MAX_COMMENT_IMAGES} images per update.`;
  }
  return { accepted, error };
}

/** A pasted screenshot is always called "image.png"; give it a name worth keeping. */
function labelFor(file: File, index: number): string {
  if (file.name && file.name !== 'image.png') return file.name;
  const extension = attachmentTypeFor(file.type)?.extension ?? 'png';
  return `screenshot-${index + 1}.${extension}`;
}

export interface UploadedImage {
  key: string;
  mimeType: string;
  label: string;
}

/**
 * Puts the bytes in the bucket. Nothing is linked to the project yet - that
 * is `confirmUploadAction`, once there is a comment to link to.
 */
export async function uploadImages(code: string, images: PendingImage[]): Promise<UploadedImage[]> {
  return Promise.all(
    images.map(async ({ file }, index) => {
      const requested = await requestUploadAction({
        code,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!requested.ok) throw new Error(requested.error);

      const formData = new FormData();
      for (const [key, value] of Object.entries(requested.data.fields)) {
        formData.append(key, value);
      }
      // The file field must come last - S3 stops reading form fields at it.
      formData.append('file', file);
      const response = await fetch(requested.data.url, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('An image did not upload. Try again.');

      return {
        key: requested.data.key,
        mimeType: requested.data.mimeType,
        label: labelFor(file, index),
      };
    }),
  );
}

export function PendingImageStrip({
  images,
  onRemove,
  disabled,
}: {
  images: PendingImage[];
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  if (images.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Images to attach">
      {images.map((image) => (
        <li
          key={image.id}
          className="border-line bg-surface-2 relative size-20 overflow-hidden rounded-[var(--radius-sm)] border"
        >
          <img src={image.preview} alt={image.file.name} className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(image.id)}
            disabled={disabled}
            aria-label={`Remove ${image.file.name}`}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80 disabled:opacity-50"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CommentImageGallery({
  images,
}: {
  images: { id: string; label: string; url: string }[];
}) {
  if (images.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {images.map((image) => {
        const src = `${image.url}?inline=1`;
        return (
          <li key={image.id}>
            <a
              href={src}
              target="_blank"
              rel="noreferrer noopener"
              title={image.label}
              className="border-line bg-surface-2 focus-visible:ring-accent block overflow-hidden rounded-[var(--radius-sm)] border focus-visible:outline-none focus-visible:ring-2"
            >
              <img
                src={src}
                alt={image.label}
                loading="lazy"
                className="h-32 w-auto max-w-[16rem] object-cover transition-opacity hover:opacity-90"
              />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
