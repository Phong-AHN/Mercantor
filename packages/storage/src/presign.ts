import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { s3Bucket, s3Client } from './client';

const UPLOAD_TTL_SECONDS = 5 * 60;
/** Matches Orbit's ARCHITECTURE.md §8: short-lived, issued only after an RBAC check. */
const DOWNLOAD_TTL_SECONDS = 15 * 60;

/**
 * A presigned POST policy, not a presigned `PUT`. A `PUT` signature that
 * includes `ContentLength` locks the upload to that *exact* byte count
 * (S3 folds it into `SignedHeaders`), which would reject every file smaller
 * than the cap - not what "at most 25MB" means. A POST policy's
 * `content-length-range` condition is S3's actual mechanism for an upper
 * bound, enforced by the bucket itself before a single byte is trusted.
 *
 * The browser uploads directly to the bucket via multipart form POST; the
 * server never sees the bytes in flight.
 */
export async function presignUpload(input: {
  key: string;
  contentType: string;
  maxBytes: number;
}): Promise<{ url: string; fields: Record<string, string>; expiresAt: Date }> {
  const { url, fields } = await createPresignedPost(s3Client(), {
    Bucket: s3Bucket(),
    Key: input.key,
    Conditions: [
      ['content-length-range', 0, input.maxBytes],
      { 'Content-Type': input.contentType },
    ],
    Fields: {
      'Content-Type': input.contentType,
    },
    Expires: UPLOAD_TTL_SECONDS,
  });
  return { url, fields, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000) };
}

export async function presignDownload(key: string, filename?: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3Bucket(),
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${sanitizeFilename(filename)}"`
      : undefined,
  });
  return getSignedUrl(s3Client(), command, { expiresIn: DOWNLOAD_TTL_SECONDS });
}

/**
 * `filename` is a user-typed attachment label, and this value is echoed back
 * verbatim as a real response header by S3/MinIO when the presigned URL is
 * fetched. A quote or a CR/LF in the label would otherwise break out of the
 * `filename="..."` quoting or inject a second header into that response.
 */
function sanitizeFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex
  return filename.replace(/[\x00-\x1f\x7f"\\]/g, '').slice(0, 200) || 'download';
}

/** The declared `Content-Length` at upload time is never trusted for the
 * stored record - this reads what S3 actually received. */
export async function headObject(
  key: string,
): Promise<{ sizeBytes: number; contentType: string | undefined } | null> {
  try {
    const result = await s3Client().send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: key }));
    return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * The first few kilobytes are enough for every magic-number check this
 * product needs, and pulling only a range means verifying a 20MB upload
 * does not mean downloading 20MB.
 */
export async function readObjectHead(key: string, bytes = 4100): Promise<Buffer> {
  const result = await s3Client().send(
    new GetObjectCommand({ Bucket: s3Bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  const body = result.Body;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * The whole object, not just a head sample - for the one caller that
 * actually needs every byte server-side (OCR on an uploaded screenshot),
 * as opposed to `readObjectHead`'s magic-number sniff.
 */
export async function readObject(key: string): Promise<Buffer> {
  const result = await s3Client().send(new GetObjectCommand({ Bucket: s3Bucket(), Key: key }));
  const body = result.Body;
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  await s3Client().send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }));
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('name' in error ? (error as { name?: string }).name === 'NotFound' : false)
  );
}
