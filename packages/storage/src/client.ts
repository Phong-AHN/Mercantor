import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@relay/config';

/**
 * One client, lazily built from the validated environment. `S3_ENDPOINT` and
 * `S3_FORCE_PATH_STYLE` exist so the exact same code talks to MinIO locally
 * and to real S3 in production - nothing here is aware of which one it is.
 */
let client: S3Client | null = null;

export function s3Client(): S3Client {
  if (client) return client;

  const config = env();
  client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials:
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return client;
}

export function s3Bucket(): string {
  return env().S3_BUCKET;
}
