/**
 * What this product will accept as a file attachment - a deliberately narrow
 * allowlist rather than "anything the browser reports". Browser-safe: the
 * file picker's `accept` attribute reads this on the client, and the upload
 * and verification steps read the same table on the server, so the three
 * places can never quietly drift apart.
 *
 * SVG is left out on purpose. Attachments are opened with a plain `<a
 * target="_blank">`, and a browser renders an SVG opened directly as an HTML
 * document - embedded `<script>` and all. Brand logos go in at PNG
 * resolution instead; the risk is not worth the convenience for the one
 * asset type it would help.
 */
export interface AttachmentTypeSpec {
  mimeType: string;
  extension: string;
  label: string;
}

export const ALLOWED_ATTACHMENT_TYPES: readonly AttachmentTypeSpec[] = [
  { mimeType: 'image/png', extension: 'png', label: 'PNG image' },
  { mimeType: 'image/jpeg', extension: 'jpg', label: 'JPEG image' },
  { mimeType: 'image/webp', extension: 'webp', label: 'WebP image' },
  { mimeType: 'image/gif', extension: 'gif', label: 'GIF image' },
  { mimeType: 'application/pdf', extension: 'pdf', label: 'PDF document' },
  { mimeType: 'text/csv', extension: 'csv', label: 'CSV spreadsheet' },
  { mimeType: 'text/plain', extension: 'txt', label: 'Plain text' },
  { mimeType: 'application/zip', extension: 'zip', label: 'ZIP archive' },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
    label: 'Excel spreadsheet',
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
    label: 'Word document',
  },
  { mimeType: 'font/ttf', extension: 'ttf', label: 'TrueType font' },
  { mimeType: 'font/otf', extension: 'otf', label: 'OpenType font' },
  { mimeType: 'font/woff2', extension: 'woff2', label: 'WOFF2 font' },
];

/** 25MB. Generous for a brand asset or a product-data export, not for video. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function attachmentTypeFor(mimeType: string): AttachmentTypeSpec | null {
  return ALLOWED_ATTACHMENT_TYPES.find((type) => type.mimeType === mimeType) ?? null;
}

/** The `accept` attribute for the file picker. */
export function acceptedAttachmentTypes(): string {
  return ALLOWED_ATTACHMENT_TYPES.map((type) => type.mimeType).join(',');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
