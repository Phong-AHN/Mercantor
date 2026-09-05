/**
 * Verifies what a file actually is against what the client claimed it is.
 * D-011's carried-over principle: never trust a declared MIME type - check
 * the real bytes. This runs against the first ~4KB pulled by
 * `readObjectHead()`, after the object is already sitting in the bucket but
 * before the `Attachment` row (and any RBAC-gated download link) is created.
 *
 * A mismatch here means the object gets deleted and the confirm step fails -
 * the object is never linked to the project.
 */
export function sniffMimeType(head: Buffer): string | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (
    startsWith(head, [0x52, 0x49, 0x46, 0x46]) &&
    head.length >= 12 &&
    head.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  // ZIP and every Office Open XML format (xlsx, docx, ...) share the ZIP
  // local-file-header signature - xlsx/docx are ZIP containers. The
  // `application/zip` and OOXML entries in the attachment allowlist all
  // sniff to this same magic number; the declared-vs-real check in the
  // caller only needs to confirm "it really is a ZIP container", not which
  // kind, since the extension/content-type still came from the allowlist.
  if (
    startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(head, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(head, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return 'application/zip';
  }
  if (startsWith(head, [0x00, 0x01, 0x00, 0x00, 0x00])) return 'font/ttf';
  if (startsWith(head, [0x4f, 0x54, 0x54, 0x4f])) return 'font/otf';
  if (startsWith(head, [0x77, 0x4f, 0x46, 0x32])) return 'font/woff2';
  if (looksLikeText(head)) return 'text/plain-or-csv';
  return null;
}

/**
 * `sniffMimeType` cannot tell CSV from plain text, or a ZIP container from
 * the specific OOXML format riding inside it - both are legitimate ambiguity
 * in the format itself, not a gap in the check. This maps a declared type to
 * the sniff result(s) that are consistent with it, so the caller can accept
 * "declared xlsx, sniffed as a ZIP container" without accepting "declared
 * xlsx, sniffed as a JPEG".
 */
export function sniffIsConsistentWith(declaredMimeType: string, sniffed: string | null): boolean {
  if (sniffed === null) return false;
  if (declaredMimeType === sniffed) return true;
  if (sniffed === 'text/plain-or-csv') {
    return declaredMimeType === 'text/plain' || declaredMimeType === 'text/csv';
  }
  if (sniffed === 'application/zip') {
    return (
      declaredMimeType === 'application/zip' ||
      declaredMimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      declaredMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }
  return false;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/** No control bytes (other than tab/CR/LF) in the sample - a loose but
 * effective heuristic for "this is text, not a disguised binary". */
function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  for (const byte of buffer) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
    if (byte < 0x20 || byte === 0x7f) return false;
  }
  return true;
}
