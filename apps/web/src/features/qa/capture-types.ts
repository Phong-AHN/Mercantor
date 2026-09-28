/** Browser-safe: the upload dialog's `accept` and the server check read the same list. */
export const CAPTURE_TYPES = [
  { mimeType: 'image/png', extension: 'png' },
  { mimeType: 'image/jpeg', extension: 'jpg' },
  { mimeType: 'image/webp', extension: 'webp' },
] as const;

/** Full-page screenshots of a long homepage run to several megabytes. */
export const CAPTURE_MAX_BYTES = 20 * 1024 * 1024;
